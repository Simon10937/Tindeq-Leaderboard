import type { UploadAttempt, UploadStatus } from "@/features/assessments/upload/state";

const transitions: Record<UploadStatus, readonly UploadStatus[]> = {
  pending: ["uploading"],
  uploading: ["processing", "rejected"],
  processing: ["ready", "rejected"],
  ready: ["excluded"],
  rejected: ["pending", "excluded"],
  excluded: [],
};

export function canTransitionUpload(from: UploadStatus, to: UploadStatus, published = false) {
  return !published && transitions[from].includes(to);
}

export function transitionUpload<T extends UploadAttempt>(attempt: T, to: UploadStatus, published = false): T {
  if (!canTransitionUpload(attempt.status, to, published)) {
    throw new Error(`Upload cannot transition from ${attempt.status} to ${to}${published ? " after publication" : ""}.`);
  }
  return { ...attempt, status: to, ...(to === "pending" ? { errorCode: undefined } : {}) };
}

export function canPublishManifest(attempts: readonly UploadAttempt[]) {
  return attempts.some((attempt) => attempt.status === "ready")
    && attempts.every((attempt) => attempt.status === "ready" || attempt.status === "excluded");
}

