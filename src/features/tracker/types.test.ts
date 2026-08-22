import { describe, expect, it } from "vitest";
import { buildTrackerSession, progressPointsForSession, validateImportContext, type ParsedTrackerCsv } from "./types";

const parsed: ParsedTrackerCsv = {
  mode: "endurance",
  parserVersion: "test",
  filename: "endurance.csv",
  sourceSummary: "Endurance",
  vendorMetadata: {},
  metrics: [
    { key: "criticalForceN", label: "Critical force", value: 101.5, unit: "N", available: true },
    { key: "repeaterAverageForceN", label: "Repeater average force", available: false, reason: "Not a repeater test" },
  ],
  trace: { elapsedUs: [0, 1_000_000], forceN: [10, 20] },
  warnings: [],
};

describe("validateImportContext", () => {
  it("requires grip and date before storing local records", () => {
    expect(validateImportContext({ grip: "", testedAt: "" })).toEqual({
      ok: false,
      errors: ["Grip type is required.", "Test date is required."],
    });
  });

  it("normalizes optional context for a valid import", () => {
    expect(validateImportContext({ grip: " 20mm edge ", testedAt: "2026-08-22T10:00", hand: "right", notes: " warm " })).toEqual({
      ok: true,
      context: { grip: "20mm edge", testedAt: "2026-08-22T10:00", hand: "right", notes: "warm" },
    });
  });
});

describe("tracker sessions", () => {
  it("builds local sessions without remote ownership fields", () => {
    const session = buildTrackerSession(parsed, { grip: "jug", testedAt: "2026-08-22T10:00" }, "local-1");

    expect(session).toMatchObject({ id: "local-1", grip: "jug", testedAt: "2026-08-22T10:00" });
    expect(session).not.toHaveProperty("groupId");
    expect(session).not.toHaveProperty("ownerId");
  });

  it("creates progress points only for available metrics", () => {
    const session = buildTrackerSession(parsed, { grip: "jug", testedAt: "2026-08-22T10:00", hand: "right" }, "local-1");

    expect(progressPointsForSession(session)).toEqual([
      {
        sessionId: "local-1",
        mode: "endurance",
        grip: "jug",
        hand: "right",
        testedAt: "2026-08-22T10:00",
        metricKey: "criticalForceN",
        label: "Critical force",
        value: 101.5,
        unit: "N",
      },
    ]);
  });
});
