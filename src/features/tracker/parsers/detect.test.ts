import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectTindeqCsv } from "./detect";

const peakForceFixture = readFileSync(join(process.cwd(), "tests/fixtures/tindeq/max-force/peakforce-single.csv"), "utf8");

describe("detectTindeqCsv", () => {
  it("detects peak-force summary exports", () => {
    const result = detectTindeqCsv(peakForceFixture, "peakforce-single.csv");

    expect(result.status).toBe("detected");
    if (result.status === "detected") {
      expect(result.parsed.mode).toBe("peak_force");
      expect(result.parsed.metrics.find((metric) => metric.key === "peakForceN")).toMatchObject({
        available: true,
        unit: "N",
      });
    }
  });

  it("returns inspectable unsupported traces", () => {
    const source = "time,weight\n0,1\n1,2\n";

    const result = detectTindeqCsv(source, "trace.csv");

    expect(result.status).toBe("unsupported_trace");
    if (result.status === "unsupported_trace") {
      expect(result.parsed.mode).toBe("unsupported_trace");
      expect(result.parsed.trace.forceN).toHaveLength(2);
      expect(result.parsed.metrics.every((metric) => !metric.available)).toBe(true);
    }
  });

  it("reports malformed CSVs without throwing", () => {
    expect(detectTindeqCsv('"unterminated', "bad.csv")).toEqual({
      status: "invalid",
      filename: "bad.csv",
      error: "Unterminated CSV quote",
    });
  });
});
