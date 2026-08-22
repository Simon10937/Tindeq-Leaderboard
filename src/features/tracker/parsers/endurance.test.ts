import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnduranceCsv } from "./endurance";

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
    expect(parsed.trace.elapsedUs.length).toBeGreaterThan(2_000);
    expect(parsed.trace.forceN[0]).toBeCloseTo(26.19, 2);
  });

  it("rejects unsupported units", () => {
    expect(() => parseEnduranceCsv(fixture.replace(",SI,", ",imperial,"))).toThrow(/unsupported unit/i);
  });
});
