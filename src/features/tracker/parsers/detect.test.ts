import { describe, expect, it } from "vitest";
import { detectTindeqCsv } from "./detect";

describe("detectTindeqCsv", () => {
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
