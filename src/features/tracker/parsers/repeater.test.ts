import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRepeaterCsv } from "./repeater";

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
  });
});
