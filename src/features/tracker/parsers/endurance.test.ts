import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { augmentStoredEnduranceMetrics, parseEnduranceCsv } from "./endurance";
import type { TrackerSession } from "@/features/tracker/types";

const fixture = readFileSync(join(process.cwd(), "tests/fixtures/tindeq/critical-force/critical-force.csv"), "utf8");

describe("parseEnduranceCsv", () => {
  it("parses critical force metadata and trace samples", () => {
    const parsed = parseEnduranceCsv(fixture, "critical-force.csv");

    expect(parsed.mode).toBe("endurance");
    expect(parsed.vendorMetadata.reps).toBe("24");
    expect(parsed.vendorMetadata["Work time"]).toBe("7");
    expect(parsed.metrics.find((metric) => metric.key === "criticalForceN")).toMatchObject({
      available: true,
      value: expect.closeTo(101.46, 2),
    });
    expect(parsed.metrics.find((metric) => metric.key === "enduranceAverageForceN")).toMatchObject({
      available: true,
      unit: "N",
    });
    expect(parsed.metrics.find((metric) => metric.key === "peakForceN")).toMatchObject({
      available: true,
      unit: "N",
    });
    expect(parsed.trace.elapsedUs.length).toBeGreaterThan(2_000);
    expect(parsed.trace.forceN[0]).toBeCloseTo(26.19, 2);
  });

  it("rejects unsupported units", () => {
    expect(() => parseEnduranceCsv(fixture.replace(",SI,", ",imperial,"))).toThrow(/unsupported unit/i);
  });

  it("adds missing endurance average and max metrics from stored traces", () => {
    const session: TrackerSession = {
      id: "old-endurance",
      mode: "endurance",
      parserVersion: "tindeq-endurance-csv/v1",
      filename: "old.csv",
      sourceSummary: "Endurance",
      vendorMetadata: {},
      metrics: [{ key: "criticalForceN", label: "Critical force", value: 100, unit: "N", available: true }],
      trace: { elapsedUs: [0, 1_000_000, 2_000_000], forceN: [10, 20, 30] },
      warnings: [],
      grip: "half crimp",
      testedAt: "2026-08-22T10:00",
      createdAt: "2026-08-22T10:00",
    };

    const augmented = augmentStoredEnduranceMetrics(session);

    expect(augmented.changed).toBe(true);
    expect(augmented.session.metrics.find((metric) => metric.key === "enduranceAverageForceN")).toMatchObject({
      available: true,
      value: 20,
    });
    expect(augmented.session.metrics.find((metric) => metric.key === "peakForceN")).toMatchObject({
      available: true,
      value: 30,
    });
  });
});
