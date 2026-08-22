import { describe, expect, it } from "vitest";
import { downsampleSeries, formatCompactDate, formatMetricValue } from "./chart-utils";

describe("downsampleSeries", () => {
  it("bounds plotted values while preserving both endpoints", () => {
    const elapsedUs = Array.from({ length: 10_000 }, (_, index) => index);
    const forceN = elapsedUs.map((value) => value * 2);
    const result = downsampleSeries(elapsedUs, forceN, 100);

    expect(result.elapsedUs).toHaveLength(100);
    expect(result.elapsedUs[0]).toBe(0);
    expect(result.elapsedUs.at(-1)).toBe(9_999);
    expect(result.forceN.at(-1)).toBe(19_998);
  });
});

describe("formatMetricValue", () => {
  it("displays force metrics in kg-facing units", () => {
    expect(formatMetricValue({ key: "peakForceN", value: 19.6133, unit: "N" })).toBe("2 kg");
  });
});

describe("formatCompactDate", () => {
  it("uses short day/month labels", () => {
    expect(formatCompactDate("2026-08-22T10:00:00.000Z")).toBe("22/8");
  });

  it("keeps tracker datetime-local dates on their saved calendar day", () => {
    expect(formatCompactDate("2026-08-22T00:30")).toBe("22/8");
  });
});
