import { describe, expect, it } from "vitest";
import { parseProtocolDraft } from "./schemas";

const validRfd = {
  assessmentType: "rfd",
  name: "20 mm half crimp RFD",
  gripType: "half_crimp",
  edgeDepthMm: 20,
  setupInstructions: "Warm up, then stand square to the fixed edge.",
  warmupInstructions: "Complete three progressive pulls.",
  bodyPosition: "Shoulder neutral, elbow extended, feet grounded.",
  devicePlacement: "Tindeq inline below the edge.",
  executionInstructions: "Pull as fast and hard as possible without a countermovement.",
  maximumAttempts: 3,
  minimumRecoverySeconds: 120,
  bestOf: 3,
  minimumValidDurationMs: 500,
  lowerPercent: 20,
  upperPercent: 80,
  minimumPeakForceN: 50,
};

describe("parseProtocolDraft", () => {
  it("accepts a complete RFD protocol", () => {
    expect(parseProtocolDraft(validRfd).assessmentType).toBe("rfd");
  });

  it("rejects a protocol whose best-of exceeds maximum attempts", () => {
    expect(() => parseProtocolDraft({ ...validRfd, bestOf: 4 })).toThrow(/bestOf/i);
  });

  it("rejects missing physical execution instructions", () => {
    expect(() => parseProtocolDraft({ ...validRfd, bodyPosition: "" })).toThrow();
  });

  it.each(["max_pull", "critical_force", "repeaters"])(
    "keeps %s disabled until its adapter gate passes",
    (assessmentType) => {
      expect(() => parseProtocolDraft({ ...validRfd, assessmentType })).toThrow(/not enabled/i);
    },
  );
});
