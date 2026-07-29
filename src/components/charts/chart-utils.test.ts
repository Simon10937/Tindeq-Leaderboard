import { describe, expect, it } from "vitest";
import { downsampleSeries } from "./chart-utils";

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
