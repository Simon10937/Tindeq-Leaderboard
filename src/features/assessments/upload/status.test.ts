import { describe, expect, it } from "vitest";
import { canPublishManifest, canTransitionUpload, transitionUpload } from "@/features/assessments/upload/status";

describe("upload status transitions", () => {
  it("follows the staged processing path", () => {
    expect(canTransitionUpload("pending", "uploading")).toBe(true);
    expect(canTransitionUpload("uploading", "processing")).toBe(true);
    expect(canTransitionUpload("processing", "ready")).toBe(true);
    expect(canTransitionUpload("processing", "pending")).toBe(false);
  });

  it("retries rejected files and excludes reviewed files before publication", () => {
    expect(canTransitionUpload("rejected", "pending")).toBe(true);
    expect(canTransitionUpload("rejected", "excluded")).toBe(true);
    expect(canTransitionUpload("ready", "excluded")).toBe(true);
    expect(canTransitionUpload("ready", "excluded", true)).toBe(false);
    expect(() => transitionUpload({ id: "one", status: "ready" }, "excluded", true)).toThrow();
  });

  it("publishes only a resolved manifest with at least one ready file", () => {
    expect(canPublishManifest([{ id: "one", status: "ready" }, { id: "two", status: "excluded" }])).toBe(true);
    expect(canPublishManifest([{ id: "one", status: "excluded" }])).toBe(false);
    expect(canPublishManifest([{ id: "one", status: "ready" }, { id: "two", status: "rejected" }])).toBe(false);
    expect(canPublishManifest([])).toBe(false);
  });
});
