"use server";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTindeqRfdCsv } from "@/features/assessments/parsers/rfd";
import { KGF_TO_NEWTONS } from "@/features/assessments/parsers/tindeq";
import { calculateRfd2080 } from "@/features/assessments/calculations/rfd";
import { isRfdRankingEnabled } from "@/features/assessments/calculations";
import oracleManifest from "../../../../tests/oracles/rfd/manifest.json";
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
  if (!attempt || attempt.ingestion_status !== "pending") throw new Error("This upload is not pending.");

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

    const { error: traceError } = await admin.from("force_traces").insert({
      attempt_id: attempt.id,
      owner_id: attempt.owner_id,
      elapsed_us: parsed.trace.elapsedUs,
      force_n: parsed.trace.forceN,
      sample_count: parsed.trace.elapsedUs.length,
      duration_us: parsed.trace.elapsedUs.at(-1),
    });
    if (traceError) throw new Error("trace_persistence_failed");
    const { error: metricError } = await admin.from("metric_runs").insert({
      attempt_id: attempt.id,
      owner_id: attempt.owner_id,
      assessment_type: "rfd",
      parser_version: parsed.parserVersion,
      algorithm_version: calculation.algorithmVersion,
      primary_metric: calculation.rfdNPerSecond,
      relative_metric: bodyWeightN ? (calculation.rfdNPerSecond / bodyWeightN) * 100 : null,
      calculation_payload: calculation,
      oracle_approved: oracleApproved,
    });
    if (metricError) throw new Error("metric_persistence_failed");
    const { error: readyError } = await admin.from("assessment_attempts").update({
      source_sha256: sourceSha256,
      source_size_bytes: bytes.length,
      ingestion_status: "ready",
      parser_version: parsed.parserVersion,
      vendor_payload: { metadata: parsed.vendorMetadata, metrics: parsed.vendorMetrics },
      failure_code: null,
      processing_lease_expires_at: null,
    }).eq("id", attempt.id).eq("owner_id", attempt.owner_id);
    if (readyError) throw new Error("attempt_persistence_failed");
    if (related?.protocol_version_id) {
      await admin.from("protocol_versions").update({ state: "locked", locked_at: new Date().toISOString() }).eq("id", related.protocol_version_id).eq("state", "published");
    }
    return { status: "ready" as const, canRank: oracleApproved, reason: oracleApproved ? "oracle_approved" as const : "oracle_not_approved" as const };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "processing_failed";
    await admin.from("assessment_attempts").update({ ingestion_status: "rejected", failure_code: code, processing_lease_expires_at: null }).eq("id", attempt.id).eq("owner_id", attempt.owner_id);
    return { status: "rejected" as const, canRank: false, reason: code };
  }
}

export async function publishAssessmentSession(sessionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_assessment_session", { target_session: sessionId });
  if (error) return { published: false as const, reason: "oracle_not_approved" as const };
  return { published: true as const };
}
