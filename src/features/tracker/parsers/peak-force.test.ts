import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { augmentStoredPeakForceMetrics, parsePeakForceCsv } from "./peak-force";
import type { TrackerSession } from "@/features/tracker/types";

const fixture = readFileSync(join(process.cwd(), "tests/fixtures/tindeq/max-force/peakforce-single.csv"), "utf8");

describe("parsePeakForceCsv", () => {
  it("parses Tindeq max-force summary exports as peak-force sessions", () => {
    const parsed = parsePeakForceCsv(fixture, "peakforce-single.csv");

    expect(parsed).toMatchObject({
      mode: "peak_force",
      sourceSummary: "Peak force",
      vendorMetadata: {
        date: "2026-29-07 09:31:55",
        tag: "max force test ",
        unit: "SI",
        type: "single",
      },
      trace: { elapsedUs: [], forceN: [] },
    });
    expect(parsed.metrics).toEqual([
      expect.objectContaining({
        key: "peakForceN",
        label: "Max force",
        available: true,
        unit: "N",
        value: 10.3841515 * 9.80665,
      }),
    ]);
  });

  it("rejects unsupported units", () => {
    expect(() => parsePeakForceCsv(fixture.replace(",SI,", ",imperial,"))).toThrow(/unsupported unit/i);
  });

  it("backfills stored peak-force metadata from older unsupported imports", () => {
    const storedSession: TrackerSession = {
      id: "legacy-peak",
      mode: "unsupported_trace",
      parserVersion: "tindeq-generic-trace/v1",
      filename: "peakforce-single.csv",
      sourceSummary: "Unsupported trace",
      vendorMetadata: { "max weight": "10.3841515", tag: "max force test" },
      metrics: [],
      trace: { elapsedUs: [], forceN: [] },
      warnings: ["Unsupported CSV shape"],
      grip: "half crimp",
      testedAt: "2026-07-29T09:31",
      createdAt: "2026-07-29T09:32:00.000Z",
    };

    const result = augmentStoredPeakForceMetrics(storedSession);

    expect(result.changed).toBe(true);
    expect(result.needsReimport).toBe(false);
    expect(result.session.mode).toBe("peak_force");
    expect(result.session.sourceSummary).toBe("Peak force");
    expect(result.session.metrics).toEqual([
      expect.objectContaining({
        key: "peakForceN",
        available: true,
        value: 10.3841515 * 9.80665,
      }),
    ]);
    expect(result.session.warnings).toEqual([]);
  });
});
