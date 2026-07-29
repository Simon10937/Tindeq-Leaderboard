export const uploadStatuses = [
  "pending",
  "uploading",
  "processing",
  "ready",
  "rejected",
  "excluded",
] as const;

export type UploadStatus = (typeof uploadStatuses)[number];
export type UploadAttempt = {
  id: string;
  status: UploadStatus;
  errorCode?: string;
};
