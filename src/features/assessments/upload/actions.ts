"use server";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTindeqRfdCsv } from "@/features/assessments/parsers/rfd";
import { KGF_TO_NEWTONS } from "@/features/assessments/parsers/tindeq";
import { calculateRfd2080 } from "@/features/assessments/calculations/rfd";
import { isRfdRankingEnabled } from "@/features/assessments/calculations";
import oracleManifest from "@/features/assessments/calculations/rfd-oracle-manifest.json";
import { MAX_CSV_BYTES, sessionUploadSchema, validateCsvFiles, type CsvFileDescriptor } from "./validation";

type PrepareInput = {
  groupId: string;
  protocolVersionId: string;
  hand: "left" | "right";
  declaredAt: string;
  timezone: string;
  bodyWeightKg?: number;
  protocolAdherence: true;
  files: CsvFileDescriptor[];
};

export type PreparedUpload = { attemptId: string; path: string; token: string };

export async function prepareUploadManifest(input: PrepareInput): Promise<{ sessionId: string; uploads: PreparedUpload[] }> {
  const session = sessionUploadSchema.parse({
    hand: input.hand,
    declaredAt: input.declaredAt,
    protocolAdherence: input.protocolAdherence,
    bodyWeightKg: input.bodyWeightKg,
  });
  const fileErrors = validateCsvFiles(input.files);
  if (fileErrors.length) throw new Error(fileErrors.join(" "));
  if (!/^[0-9a-f-]{36}$/i.test(input.groupId) || !/^[0-9a-f-]{36}$/i.test(input.protocolVersionId)) {
    throw new Error("Choose a valid group protocol.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_assessment_manifest", {
    target_group: input.groupId,
    target_protocol_version: input.protocolVersionId,
    comparison_hand: session.hand,
    declared_at: session.declaredAt,
    declared_timezone: input.timezone,
    body_weight_newtons: session.bodyWeightKg ? session.bodyWeightKg * KGF_TO_NEWTONS : null,
    adherence_confirmed: true,
    files: input.files.map(({ name, size }) => ({ name, size })),
  });
  const attempts = Array.isArray(data) ? data : [];
  if (error || attempts.length !== input.files.length) throw new Error("The upload session could not be created.");

  const admin = createAdminClient();
  const uploads = await Promise.all(attempts.map(async (attempt): Promise<PreparedUpload> => {
    const { data: signed, error: signError } = await admin.storage
      .from("assessment-evidence")
      .createSignedUploadUrl(attempt.object_path);
    if (signError || !signed?.token) throw new Error("An upload capability could not be created. Retry this session.");
    return { attemptId: attempt.attempt_id, path: attempt.object_path, token: signed.token };
  }));
  return { sessionId: attempts[0].session_id, uploads };
}

export async function finalizeRfdAttempt(attemptId: string) {
  const supabase = await createClient();
  const { data: attempt } = await supabase
    .from("assessment_attempts")
    .select("id,owner_id,session_id,object_path,ingestion_status,assessment_sessions(body_weight_n,protocol_version_id)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) throw new Error("This upload is unavailable.");
  if (attempt.ingestion_status === "ready") {
    const { data: metric } = await supabase.from("metric_runs").select("oracle_approved")
      .eq("attempt_id", attempt.id).eq("is_current", true).maybeSingle();
    const canRank = metric?.oracle_approved === true;
    return { status: "ready" as const, canRank, reason: canRank ? "oracle_approved" as const : "oracle_not_approved" as const };
  }
  if (!["pending", "processing"].includes(attempt.ingestion_status)) throw new Error("This upload cannot be processed.");

  const { data: claimed, error: claimError } = await supabase.rpc("claim_assessment_attempt", { target_attempt: attemptId });
  if (claimError || !claimed) throw new Error("Another request is processing this upload.");

  const admin = createAdminClient();
  try {
    const { data: blob, error: downloadError } = await admin.storage.from("assessment-evidence").download(attempt.object_path);
    if (downloadError || !blob) throw new Error("source_unavailable");
    if (blob.size <= 0 || blob.size > MAX_CSV_BYTES) throw new Error("invalid_source_size");
    const bytes = Buffer.from(await blob.arrayBuffer());
    const sourceSha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();
    const parsed = parseTindeqRfdCsv(bytes.toString("utf8"));
    const calculation = calculateRfd2080(parsed.trace, { baselineForceN: parsed.trace.forceN[0] });
    const oracleApproved = isRfdRankingEnabled(oracleManifest, parsed.parserVersion, calculation.algorithmVersion);
    const related = Array.isArray(attempt.assessment_sessions) ? attempt.assessment_sessions[0] : attempt.assessment_sessions;
    const bodyWeightN = related?.body_weight_n ?? null;
    const { data: protocol, error: protocolError } = await admin.from("protocol_versions")
      .select("minimum_valid_duration_ms,settings").eq("id", related?.protocol_version_id).single();
    if (protocolError || !protocol) throw new Error("protocol_unavailable");
    const durationUs = parsed.trace.elapsedUs.at(-1) ?? 0;
    const minimumPeakForceN = Number((protocol.settings as { minimumPeakForceN?: unknown }).minimumPeakForceN);
    if (durationUs < protocol.minimum_valid_duration_ms * 1_000) throw new Error("trace_too_short_for_protocol");
    if (!Number.isFinite(minimumPeakForceN) || minimumPeakForceN <= 0) throw new Error("invalid_protocol_settings");
    if (calculation.peakCorrectedForceN < minimumPeakForceN) throw new Error("peak_force_below_protocol_minimum");
    const { error: completionError } = await admin.rpc("complete_rfd_attempt", {
      target_attempt: attempt.id, claim_token: claimed, source_hash: sourceSha256, source_bytes: bytes.length,
      parser: parsed.parserVersion, vendor: { metadata: parsed.vendorMetadata, metrics: parsed.vendorMetrics },
      trace_elapsed_us: parsed.trace.elapsedUs, trace_force_n: parsed.trace.forceN,
      algorithm: calculation.algorithmVersion, primary_score: calculation.rfdNPerSecond,
      relative_score: bodyWeightN ? (calculation.rfdNPerSecond / bodyWeightN) * 100 : null,
      calculation, oracle_is_approved: oracleApproved,
    });
    if (completionError) throw new Error("attempt_persistence_failed");
    return { status: "ready" as const, canRank: oracleApproved, reason: oracleApproved ? "oracle_approved" as const : "oracle_not_approved" as const };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "processing_failed";
    const { data: rejected, error: rejectionError } = await admin.rpc("reject_rfd_attempt", {
      target_attempt: attempt.id, claim_token: claimed, error_code: code,
    });
    if (rejectionError || !rejected) return { status: "processing" as const, canRank: false, reason: "rejection_persistence_failed" as const };
    return { status: "rejected" as const, canRank: false, reason: code };
  }
}

export async function publishAssessmentSession(sessionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_assessment_session", { target_session: sessionId });
  if (error) {
    const reason = error.message.includes("no_oracle_approved_attempt") ? "oracle_not_approved" as const
      : error.message.includes("session_unresolved") ? "session_unresolved" as const : "publication_failed" as const;
    return { published: false as const, reason };
  }
  return { published: true as const };
}
