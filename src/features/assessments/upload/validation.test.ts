import { describe, expect, it } from "vitest";
import { MAX_CSV_BYTES, MAX_SESSION_FILES, sessionUploadSchema, validateCsvFiles } from "@/features/assessments/upload/validation";

const csv = (overrides: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "attempt.csv",
  type: "text/csv",
  size: 100,
  ...overrides,
});

describe("upload validation", () => {
  it("accepts bounded CSV exports including browsers with an empty MIME", () => {
    expect(validateCsvFiles([csv()])).toEqual([]);
    expect(validateCsvFiles([csv({ name: "ATTEMPT.CSV", type: "" })])).toEqual([]);
  });

  it("rejects unsupported names, MIME types, sizes, and session counts", () => {
    expect(validateCsvFiles([csv({ name: "attempt.txt" })])).toContain("attempt.txt must use a .csv filename.");
    expect(validateCsvFiles([csv({ type: "application/pdf" })])).toContain("attempt.csv has an unsupported file type.");
    expect(validateCsvFiles([csv({ size: MAX_CSV_BYTES + 1 })])).toContain("attempt.csv exceeds the 5 MiB limit.");
    expect(validateCsvFiles(Array.from({ length: MAX_SESSION_FILES + 1 }, (_, index) => csv({ name: `${index}.csv` })))).toContain("A session can contain at most 10 files.");
  });

  it("requires comparison hand, declared instant, and adherence with optional positive weight", () => {
    const valid = { hand: "left", declaredAt: "2026-07-29T10:00:00Z", protocolAdherence: true };
    expect(sessionUploadSchema.safeParse(valid).success).toBe(true);
    expect(sessionUploadSchema.safeParse({ ...valid, hand: "both" }).success).toBe(false);
    expect(sessionUploadSchema.safeParse({ ...valid, bodyWeightKg: 0 }).success).toBe(false);
    expect(sessionUploadSchema.safeParse({ ...valid, declaredAt: "2026-07-29 10:00" }).success).toBe(false);
    expect(sessionUploadSchema.safeParse({ ...valid, protocolAdherence: false }).success).toBe(false);
  });
});
