import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRepeaterCsv } from "./repeater";

const fixture = readFileSync(join(process.cwd(), "tests/fixtures/tindeq/repeaters/partial-two-reps.csv"), "utf8");

describe("parseRepeaterCsv", () => {
  it("preserves partial repeater traces while gating unavailable averages", () => {
    const parsed = parseRepeaterCsv(fixture, "partial-two-reps.csv");

    expect(parsed.mode).toBe("repeater");
    expect(parsed.vendorMetadata.Avg).toBe("0.0");
    expect(parsed.metrics.find((metric) => metric.key === "repeaterAverageForceN")).toMatchObject({
      available: false,
      reason: "Tindeq exported Avg as zero or blank",
    });
    expect(parsed.metrics.find((metric) => metric.key === "peakForceN")).toMatchObject({ available: true });
    expect(parsed.trace.elapsedUs.length).toBeGreaterThan(2_000);
  });
});
