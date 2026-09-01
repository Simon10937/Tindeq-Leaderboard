import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyRepeaterPeakExclusions, parseRepeaterCsv, repeaterPeakCandidatesFromTrace } from "./repeater";

const fixture = readFileSync(join(process.cwd(), "tests/fixtures/tindeq/repeaters/partial-two-reps.csv"), "utf8");

describe("parseRepeaterCsv", () => {
  it("derives repeater average and peak force from traces when Tindeq exports zeros", () => {
    const parsed = parseRepeaterCsv(fixture, "partial-two-reps.csv");

    expect(parsed.mode).toBe("repeater");
    expect(parsed.vendorMetadata.Avg).toBe("0.0");
    expect(parsed.metrics.find((metric) => metric.key === "repeaterAverageForceN")).toMatchObject({
      available: true,
      unit: "N",
    });
    expect(parsed.metrics.find((metric) => metric.key === "peakForceN")).toMatchObject({ available: true });
    expect(parsed.warnings).toContain("Repeater average force is estimated from trace samples at or above 50% of peak because Tindeq exported Avg as zero or blank.");
    expect(parsed.trace.elapsedUs.length).toBeGreaterThan(2_000);
    expect(parsed.repeaterPeakReview?.candidates.length).toBeGreaterThan(0);
  });

  it("detects stable repeater peak candidates from the force trace", () => {
    const trace = {
      elapsedUs: [0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000],
      forceN: [2, 80, 100, 4, 85, 130, 3],
    };

    expect(repeaterPeakCandidatesFromTrace(trace)).toEqual([
      expect.objectContaining({ id: "tindeq-repeater-csv/v1:peak:2", ordinal: 1, peakTraceIndex: 2, peakForceN: 100, regionStartIndex: 1, regionEndIndex: 2 }),
      expect.objectContaining({ id: "tindeq-repeater-csv/v1:peak:5", ordinal: 2, peakTraceIndex: 5, peakForceN: 130, regionStartIndex: 4, regionEndIndex: 5 }),
    ]);
  });

  it("keeps real rep candidates selectable when one spurious outlier is much higher", () => {
    const trace = {
      elapsedUs: [0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000, 8_000_000],
      forceN: [2, 80, 100, 4, 85, 105, 3, 300, 2],
    };

    expect(repeaterPeakCandidatesFromTrace(trace)).toEqual([
      expect.objectContaining({ ordinal: 1, peakTraceIndex: 2, peakForceN: 100, regionStartIndex: 1, regionEndIndex: 2 }),
      expect.objectContaining({ ordinal: 2, peakTraceIndex: 5, peakForceN: 105, regionStartIndex: 4, regionEndIndex: 5 }),
      expect.objectContaining({ ordinal: 3, peakTraceIndex: 7, peakForceN: 300, regionStartIndex: 7, regionEndIndex: 7 }),
    ]);
  });

  it("recalculates repeater metrics from included rep windows when a peak is excluded", () => {
    const parsed = parseRepeaterCsv([
      ",Overall Avg",
      "Avg,0.0",
      "Peak,0.0",
      ",",
      "time,weight",
      "0,0.2",
      "1,8",
      "2,10",
      "3,0.4",
      "4,8.5",
      "5,13",
      "6,0.3",
    ].join("\n"));
    const highestPeak = parsed.repeaterPeakReview?.candidates.find((candidate) => candidate.peakTraceIndex === 5);

    const result = applyRepeaterPeakExclusions(parsed, highestPeak ? [highestPeak.id] : []);

    expect(parsed.trace.forceN).toHaveLength(7);
    expect(result.repeaterPeakReview.excludedCandidateIds).toEqual([highestPeak?.id]);
    expect(result.metrics.find((metric) => metric.key === "peakForceN")).toMatchObject({
      available: true,
      value: 10 * 9.80665,
    });
    expect(result.metrics.find((metric) => metric.key === "repeaterAverageForceN")).toMatchObject({
      available: true,
      value: 9 * 9.80665,
    });
  });

  it("returns unavailable repeater metrics when every candidate is excluded", () => {
    const parsed = parseRepeaterCsv([
      ",Overall Avg",
      "Avg,0.0",
      "Peak,0.0",
      ",",
      "time,weight",
      "0,0.2",
      "1,8",
      "2,10",
      "3,0.4",
      "4,8.5",
      "5,13",
      "6,0.3",
    ].join("\n"));

    const result = applyRepeaterPeakExclusions(parsed, parsed.repeaterPeakReview?.candidates.map((candidate) => candidate.id) ?? []);

    expect(result.metrics).toEqual([
      { key: "repeaterAverageForceN", label: "Estimated avg repeater force", available: false, reason: "Keep at least one rep included to calculate repeater stats" },
      { key: "peakForceN", label: "Peak force", available: false, reason: "Keep at least one rep included to calculate repeater stats" },
    ]);
  });

  it("removes exclusion-owned warnings when peaks are restored", () => {
    const parsed = parseRepeaterCsv([
      ",Overall Avg",
      "Avg,0.0",
      "Peak,0.0",
      ",",
      "time,weight",
      "0,0.2",
      "1,8",
      "2,10",
      "3,0.4",
    ].join("\n"));
    const excluded = applyRepeaterPeakExclusions(parsed, parsed.repeaterPeakReview?.candidates.map((candidate) => candidate.id) ?? []);

    const restored = applyRepeaterPeakExclusions({
      ...parsed,
      warnings: excluded.warnings,
      repeaterPeakReview: excluded.repeaterPeakReview,
    }, []);

    expect(restored.warnings).not.toContain("Keep at least one rep included to calculate repeater stats");
    expect(restored.warnings.some((warning) => warning.includes("Excluded"))).toBe(false);
  });
});
