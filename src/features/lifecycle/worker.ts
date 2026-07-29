import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type DeletionJob = { job_id: string; user_id: string; phase: "revoke" | "evidence" | "database" | "identity"; attempts: number };
export type LifecycleResult = { claimed: number; completedPhases: number; failed: number; jobs: { id: string; phase: string; outcome: "advanced" | "failed" }[] };
type AdminClient = ReturnType<typeof createAdminClient>;

export async function runLifecycleBatch(options: { limit?: number; replayJobId?: string } = {}): Promise<LifecycleResult> {
  const admin = createAdminClient();
  if (options.replayJobId) {
    const { error } = await admin.rpc("replay_account_deletion_job", { target_job: options.replayJobId });
    if (error) throw new Error("Deletion job is not available for replay.");
  }
  const workerId = randomUUID();
  const { data, error } = await admin.rpc("claim_account_deletion_jobs", {
    claim_worker: workerId,
    batch_size: Math.min(10, Math.max(1, options.limit ?? 5)),
    only_job: options.replayJobId ?? null,
  });
  if (error) throw new Error("Lifecycle jobs could not be claimed.");
  const jobs = (data ?? []) as DeletionJob[];
  const outcomes = await Promise.all(jobs.map(async (job) => {
    try {
      await processPhase(admin, job, workerId);
      return { id: job.job_id, phase: job.phase, outcome: "advanced" as const };
    } catch (cause) {
      const errorCode = cause instanceof Error ? cause.message.slice(0, 80) : "unknown_lifecycle_error";
      await admin.rpc("fail_account_deletion_job", { target_job: job.job_id, claim_worker: workerId, error_code: errorCode });
      return { id: job.job_id, phase: job.phase, outcome: "failed" as const };
    }
  }));
  const completedPhases = outcomes.filter((item) => item.outcome === "advanced").length;
  return { claimed: jobs.length, completedPhases, failed: outcomes.length - completedPhases, jobs: outcomes };
}

async function processPhase(admin: AdminClient, job: DeletionJob, workerId: string) {
  if (job.phase === "revoke") {
    await Promise.all([
      expectSuccess(admin.from("group_publications").delete().eq("owner_id", job.user_id), "publication_revoke_failed"),
      expectSuccess(admin.from("source_reviews").delete().eq("reviewer_id", job.user_id), "review_revoke_failed"),
      admin.auth.admin.signOut(job.user_id, "global").then(({ error }) => {
        if (error && error.status !== 404) throw new Error("session_revoke_failed");
      }),
    ]);
    await checkpoint(admin, job, workerId, "evidence");
    return;
  }
  if (job.phase === "evidence") {
    const { data: attempts, error } = await admin.from("assessment_attempts").select("object_path").eq("owner_id", job.user_id);
    if (error) throw new Error("evidence_inventory_failed");
    const paths = (attempts ?? []).map((row) => row.object_path);
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error: removeError } = await admin.storage.from("assessment-evidence").remove(paths.slice(offset, offset + 100));
      if (removeError) throw new Error("evidence_delete_failed");
    }
    await checkpoint(admin, job, workerId, "database");
    return;
  }
  if (job.phase === "database") {
    const { error } = await admin.rpc("delete_account_database_data", { target_job: job.job_id, claim_worker: workerId });
    if (error) throw new Error("database_delete_failed");
    return;
  }
  const { error } = await admin.auth.admin.deleteUser(job.user_id, false);
  if (error && error.status !== 404) throw new Error("identity_delete_failed");
  await checkpoint(admin, job, workerId, "complete");
}

async function checkpoint(admin: AdminClient, job: DeletionJob, workerId: string, nextPhase: "evidence" | "database" | "complete") {
  const { error } = await admin.rpc("checkpoint_account_deletion_job", {
    target_job: job.job_id,
    claim_worker: workerId,
    expected_phase: job.phase,
    next_phase: nextPhase,
  });
  if (error) throw new Error("lifecycle_checkpoint_failed");
}

async function expectSuccess(operation: PromiseLike<{ error: { message: string } | null }>, code: string) {
  const { error } = await operation;
  if (error) throw new Error(code);
}
