import { describe, expect, it } from "vitest";
import { createMemoryTrackerStore } from "./local-store";
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
});
