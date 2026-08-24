import { describe, expect, it } from "vitest";
import { createMemoryTrackerStore } from "./local-store";
import { augmentStoredRepeaterMetrics } from "@/features/tracker/parsers/repeater";
import type { TrackerSession } from "@/features/tracker/types";

function session(id: string, testedAt: string): TrackerSession {
  return {
    id,
    mode: "endurance",
    parserVersion: "test",
    filename: `${id}.csv`,
    sourceSummary: "Endurance",
    vendorMetadata: {},
    metrics: [{ key: "criticalForceN", label: "Critical force", value: 100, unit: "N", available: true }],
    trace: { elapsedUs: [0, 1_000_000], forceN: [10, 20] },
    warnings: [],
    grip: "20mm",
    testedAt,
    createdAt: testedAt,
  };
}

describe("createMemoryTrackerStore", () => {
  it("saves and lists sessions in descending test date order", async () => {
    const store = createMemoryTrackerStore();

    await store.save(session("older", "2026-08-20T10:00:00.000Z"));
    await store.save(session("newer", "2026-08-22T10:00:00.000Z"));

    await expect(store.list()).resolves.toMatchObject([{ id: "newer" }, { id: "older" }]);
  });

  it("reads, deletes, and clears sessions", async () => {
    const store = createMemoryTrackerStore([session("one", "2026-08-22T10:00:00.000Z")]);

    await expect(store.get("one")).resolves.toMatchObject({ id: "one" });
    await store.delete("one");
    await expect(store.get("one")).resolves.toBeUndefined();
    await store.save(session("two", "2026-08-22T11:00:00.000Z"));
    await store.clear();
    await expect(store.list()).resolves.toEqual([]);
  });

  it("updates an existing session by id", async () => {
    const store = createMemoryTrackerStore();

    await store.save(session("one", "2026-08-22T10:00:00.000Z"));
    await store.save({ ...session("one", "2026-08-23T10:00:00.000Z"), grip: "half crimp", tags: ["rehab"] });

    await expect(store.list()).resolves.toMatchObject([
      { id: "one", grip: "half crimp", tags: ["rehab"], testedAt: "2026-08-23T10:00:00.000Z" },
    ]);
  });
});

describe("augmentStoredRepeaterMetrics", () => {
  it("adds missing derived repeater metrics from stored traces", () => {
    const oldSession: TrackerSession = {
      ...session("repeater-old", "2026-08-22T10:00:00.000Z"),
      mode: "repeater",
      parserVersion: "tindeq-repeater-csv/v1",
      sourceSummary: "Repeater",
      vendorMetadata: { Avg: "0.0", Peak: "0.0" },
      metrics: [
        { key: "repeaterAverageForceN", label: "Repeater average force", available: false, reason: "Tindeq exported Avg as zero or blank" },
      ],
      trace: { elapsedUs: [0, 1_000_000, 2_000_000], forceN: [0, 10, 20] },
    };

    const augmented = augmentStoredRepeaterMetrics(oldSession);

    expect(augmented.changed).toBe(true);
    expect(augmented.session.metrics.find((metric) => metric.key === "repeaterAverageForceN")).toMatchObject({
      available: true,
      unit: "N",
      value: 15,
    });
    expect(augmented.session.metrics.find((metric) => metric.key === "peakForceN")).toMatchObject({
      available: true,
      unit: "N",
      value: 20,
    });
  });

  it("asks for re-import when stored repeater traces cannot derive metrics", () => {
    const oldSession: TrackerSession = {
      ...session("repeater-empty", "2026-08-22T10:00:00.000Z"),
      mode: "repeater",
      parserVersion: "tindeq-repeater-csv/v1",
      sourceSummary: "Repeater",
      vendorMetadata: { Avg: "0.0", Peak: "0.0" },
      metrics: [
        { key: "repeaterAverageForceN", label: "Repeater average force", available: false, reason: "Tindeq exported Avg as zero or blank" },
      ],
      trace: { elapsedUs: [], forceN: [] },
    };

    const augmented = augmentStoredRepeaterMetrics(oldSession);

    expect(augmented.changed).toBe(false);
    expect(augmented.needsReimport).toBe(true);
    expect(augmented.session).toBe(oldSession);
  });
});
