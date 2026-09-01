import { describe, expect, it } from "vitest";
import { buildTrackerSession, normalizeStoredTrackerSession, normalizeTags, progressPointsForSession, updateTrackerSessionMetadata, validateImportContext, type ParsedTrackerCsv } from "./types";

const parsed: ParsedTrackerCsv = {
  mode: "endurance",
  parserVersion: "test",
  filename: "endurance.csv",
  sourceSummary: "Endurance",
  vendorMetadata: {},
  metrics: [
    { key: "criticalForceN", label: "Critical force", value: 101.5, unit: "N", available: true },
    { key: "enduranceAverageForceN", label: "Endurance avg force", value: 88, unit: "N", available: true },
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
    expect(validateImportContext({ grip: " 20mm edge ", testedAt: "2026-08-22T10:00", hand: "right", notes: " warm ", tags: [" Rehab ", "rehab", "High effort"], referenceRole: "healthy_hand_baseline" })).toEqual({
      ok: true,
      context: { grip: "20mm edge", testedAt: "2026-08-22T10:00", hand: "right", notes: "warm", tags: ["rehab", "high effort"], referenceRole: "healthy_hand_baseline" },
    });
  });

  it("rejects unknown reference roles", () => {
    expect(validateImportContext({ grip: "20mm edge", testedAt: "2026-08-22T10:00", referenceRole: "baseline" as never })).toEqual({
      ok: false,
      errors: ["Reference role must be a healthy-hand baseline."],
    });
  });
});

describe("normalizeTags", () => {
  it("trims, lowercases, and deduplicates tags", () => {
    expect(normalizeTags([" Rehab ", "rehab", "", "Skin   OK"])).toEqual(["rehab", "skin ok"]);
  });
});

describe("tracker sessions", () => {
  it("builds local sessions without remote ownership fields", () => {
    const session = buildTrackerSession(parsed, { grip: "jug", testedAt: "2026-08-22T10:00", tags: ["rehab"], referenceRole: "healthy_hand_baseline" }, "local-1");

    expect(session).toMatchObject({ id: "local-1", grip: "jug", testedAt: "2026-08-22T10:00", tags: ["rehab"], referenceRole: "healthy_hand_baseline" });
    expect(session.updatedAt).toBe(session.createdAt);
    expect(session.auditLog?.[0]).toMatchObject({
      type: "created",
      changes: expect.arrayContaining([{ field: "tags", after: ["rehab"] }, { field: "referenceRole", after: "healthy_hand_baseline" }]),
    });
    expect(session).not.toHaveProperty("groupId");
    expect(session).not.toHaveProperty("ownerId");
  });

  it("builds repeater sessions with exclusion metadata and creation audit", () => {
    const repeaterParsed: ParsedTrackerCsv = {
      ...parsed,
      mode: "repeater",
      repeaterPeakReview: {
        candidates: [{
          id: "peak-1",
          parserVersion: "test",
          ordinal: 1,
          peakTraceIndex: 2,
          peakElapsedUs: 2_000_000,
          peakForceN: 120,
          regionStartIndex: 1,
          regionEndIndex: 3,
        }],
        excludedCandidateIds: ["peak-1"],
      },
    };

    const session = buildTrackerSession(repeaterParsed, { grip: "jug", testedAt: "2026-08-22T10:00" }, "local-1");

    expect(session.repeaterPeakReview?.excludedCandidateIds).toEqual(["peak-1"]);
    expect(session.auditLog?.[0].changes).toContainEqual({ field: "repeaterPeakExclusions", after: ["peak-1"] });
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
      {
        sessionId: "local-1",
        mode: "endurance",
        grip: "jug",
        hand: "right",
        testedAt: "2026-08-22T10:00",
        metricKey: "enduranceAverageForceN",
        label: "Endurance avg force",
        value: 88,
        unit: "N",
      },
    ]);
  });

  it("omits unavailable repeater metrics from progress points", () => {
    const session = buildTrackerSession({
      ...parsed,
      mode: "repeater",
      metrics: [
        { key: "repeaterAverageForceN", label: "Estimated avg repeater force", available: false, reason: "Keep at least one rep included to calculate repeater stats" },
        { key: "peakForceN", label: "Peak force", available: false, reason: "Keep at least one rep included to calculate repeater stats" },
      ],
      repeaterPeakReview: { candidates: [], excludedCandidateIds: ["peak-1"] },
    }, { grip: "jug", testedAt: "2026-08-22T10:00", hand: "right" }, "local-1");

    expect(progressPointsForSession(session)).toEqual([]);
  });

  it("updates session metadata and records changed fields", () => {
    const session = buildTrackerSession(parsed, { grip: "jug", testedAt: "2026-08-22T10:00", hand: "left", tags: ["rehab"] }, "local-1");

    const updated = updateTrackerSessionMetadata(session, {
      grip: "half crimp",
      testedAt: "2026-08-22T11:00",
      hand: "right",
      notes: "felt strong",
      tags: ["rehab", "high effort"],
      referenceRole: "healthy_hand_baseline",
    }, { now: "2026-08-23T10:00:00.000Z" });

    expect(updated.id).toBe("local-1");
    expect(updated).toMatchObject({
      grip: "half crimp",
      testedAt: "2026-08-22T11:00",
      hand: "right",
      notes: "felt strong",
      tags: ["rehab", "high effort"],
      referenceRole: "healthy_hand_baseline",
      updatedAt: "2026-08-23T10:00:00.000Z",
    });
    expect(updated.auditLog).toHaveLength(2);
    expect(updated.auditLog?.[1]).toMatchObject({
      type: "metadata_updated",
      changes: expect.arrayContaining([
        { field: "grip", before: "jug", after: "half crimp" },
        { field: "hand", before: "left", after: "right" },
        { field: "tags", before: ["rehab"], after: ["rehab", "high effort"] },
        { field: "referenceRole", before: undefined, after: "healthy_hand_baseline" },
      ]),
    });
  });

  it("updates repeater exclusions and records the changed peak IDs", () => {
    const session = buildTrackerSession({
      ...parsed,
      mode: "repeater",
      repeaterPeakReview: {
        candidates: [
          { id: "peak-1", parserVersion: "test", ordinal: 1, peakTraceIndex: 2, peakElapsedUs: 2_000_000, peakForceN: 120, regionStartIndex: 1, regionEndIndex: 3 },
          { id: "peak-2", parserVersion: "test", ordinal: 2, peakTraceIndex: 5, peakElapsedUs: 5_000_000, peakForceN: 140, regionStartIndex: 4, regionEndIndex: 6 },
        ],
        excludedCandidateIds: ["peak-1"],
      },
    }, { grip: "jug", testedAt: "2026-08-22T10:00" }, "local-1");

    const updated = updateTrackerSessionMetadata(session, {
      grip: "jug",
      testedAt: "2026-08-22T10:00",
    }, {
      metadataUpdate: {
        metrics: [{ key: "peakForceN", label: "Peak force", value: 140, unit: "N", available: true }],
        warnings: [],
        repeaterPeakReview: {
          candidates: session.repeaterPeakReview?.candidates ?? [],
          excludedCandidateIds: ["peak-2"],
        },
      },
      now: "2026-08-23T10:00:00.000Z",
    });

    expect(updated.metrics).toEqual([{ key: "peakForceN", label: "Peak force", value: 140, unit: "N", available: true }]);
    expect(updated.repeaterPeakReview?.excludedCandidateIds).toEqual(["peak-2"]);
    expect(updated.auditLog?.[1].changes).toEqual([
      { field: "repeaterPeakExclusions", before: ["peak-1"], after: ["peak-2"] },
    ]);
  });

  it("ignores repeater exclusion metadata on non-repeater sessions", () => {
    const session = buildTrackerSession(parsed, { grip: "jug", testedAt: "2026-08-22T10:00" }, "local-1");

    const updated = updateTrackerSessionMetadata(session, {
      grip: "half crimp",
      testedAt: "2026-08-22T10:00",
    }, {
      metadataUpdate: {
        metrics: [{ key: "peakForceN", label: "Peak force", value: 140, unit: "N", available: true }],
        warnings: ["Excluded 1 repeater peak from calculated statistics."],
        repeaterPeakReview: {
          candidates: [],
          excludedCandidateIds: ["peak-2"],
        },
      },
      now: "2026-08-23T10:00:00.000Z",
    });

    expect(updated.repeaterPeakReview).toBeUndefined();
    expect(updated.metrics).toBe(session.metrics);
    expect(updated.warnings).toBe(session.warnings);
    expect(updated.auditLog?.[1].changes).toEqual([
      { field: "grip", before: "jug", after: "half crimp" },
    ]);
  });

  it("removes reference role metadata and records the change", () => {
    const session = buildTrackerSession(parsed, { grip: "jug", testedAt: "2026-08-22T10:00", referenceRole: "healthy_hand_baseline" }, "local-1");

    const updated = updateTrackerSessionMetadata(session, {
      grip: "jug",
      testedAt: "2026-08-22T10:00",
    }, { now: "2026-08-23T10:00:00.000Z" });

    expect(updated.referenceRole).toBeUndefined();
    expect(updated.auditLog?.[1].changes).toEqual([
      { field: "referenceRole", before: "healthy_hand_baseline", after: undefined },
    ]);
  });

  it("normalizes old non-repeater sessions without audit metadata", () => {
    const session = buildTrackerSession(parsed, { grip: "jug", testedAt: "2026-08-22T10:00" }, "local-1");
    const oldSession = { ...session, tags: undefined, updatedAt: undefined, auditLog: undefined };
    const normalized = normalizeStoredTrackerSession(oldSession);

    expect(normalized).toMatchObject({
      tags: [],
      updatedAt: session.createdAt,
      auditLog: [],
    });
    expect(normalized.repeaterPeakReview).toBeUndefined();
  });

  it("normalizes old repeater sessions with empty peak review metadata", () => {
    const session = buildTrackerSession({ ...parsed, mode: "repeater" }, { grip: "jug", testedAt: "2026-08-22T10:00" }, "local-1");
    const oldSession = { ...session, repeaterPeakReview: undefined, tags: undefined, updatedAt: undefined, auditLog: undefined };

    expect(normalizeStoredTrackerSession(oldSession)).toMatchObject({
      tags: [],
      repeaterPeakReview: { candidates: [], excludedCandidateIds: [] },
      updatedAt: session.createdAt,
      auditLog: [],
    });
  });
});
