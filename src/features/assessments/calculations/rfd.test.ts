import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateRfdCapability, isRfdRankingEnabled } from "./index";
import { calculateRfd2080, RFD_20_80_ALGORITHM_VERSION } from "./rfd";
import { parseTindeqRfdCsv, TINDEQ_RFD_PARSER_VERSION } from "../parsers/rfd";
import oracleManifest from "./rfd-oracle-manifest.json";

const fixturePath = resolve("tests/fixtures/tindeq/rfd/rfd-test-try-2.csv");
const fixtureBytes = readFileSync(fixturePath);
const fixtureText = fixtureBytes.toString("utf8");
const fixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex").toUpperCase();

describe("Tindeq RFD parser", () => {
  it("parses the real export deterministically and preserves vendor provenance", () => {
    const first = parseTindeqRfdCsv(fixtureText);
    const replay = parseTindeqRfdCsv(fixtureText);

    expect(first).toEqual(replay);
    expect(first.parserVersion).toBe(TINDEQ_RFD_PARSER_VERSION);
    expect(first.vendorMetadata.tag).toBe("try 2");
    expect(first.vendorMetadata.comment).toBe("");
    expect(first.vendorMetrics.rfd2080).toBeCloseTo(89.51395383462659, 12);
    expect(first.vendorTrace).toHaveLength(210);
    expect(first.trace.elapsedUs).toHaveLength(210);
    expect(first.trace.forceN).toHaveLength(210);
    expect(first.trace.elapsedUs[0]).toBe(0);
    expect(first.trace.forceN[0]).toBeCloseTo(5.34546422958374 * 9.80665, 10);
  });

  it("rejects non-finite samples", () => {
    expect(() => parseTindeqRfdCsv(fixtureText.replace("0.0,5.34546422958374", "0.0,NaN"))).toThrow(
      /finite/i,
    );
  });

  it("rejects non-monotonic sample times", () => {
    expect(() => parseTindeqRfdCsv(fixtureText.replace("0.011345000000000383", "0.0"))).toThrow(
      /strictly increasing/i,
    );
  });

  it("rejects times that collapse after microsecond normalization", () => {
    const collapsed = fixtureText
      .replace("0.011345000000000383", "0.0000004")
      .replace("0.022688999999999737", "0.00000049");
    expect(() => parseTindeqRfdCsv(collapsed)).toThrow(/microsecond normalization/i);
  });

  it("rejects unsupported units without guessing a conversion", () => {
    expect(() => parseTindeqRfdCsv(fixtureText.replace(",SI,200,", ",imperial,200,"))).toThrow(
      /unsupported unit/i,
    );
  });
});

describe("20-80 RFD calculation", () => {
  it("interpolates both crossings and produces a replayable result", () => {
    const input = {
      elapsedUs: [0, 100_000, 200_000, 300_000, 400_000],
      forceN: [10, 30, 50, 90, 110],
    };
    const config = { baselineForceN: 10 };

    const first = calculateRfd2080(input, config);
    const replay = calculateRfd2080(input, config);

    expect(first).toEqual(replay);
    expect(first.algorithmVersion).toBe(RFD_20_80_ALGORITHM_VERSION);
    expect(first.rfdNPerSecond).toBeCloseTo(300, 10);
    expect(first.peakCorrectedForceN).toBe(100);
  });

  it("fails when the trace never reaches a distinct 20-80 rise", () => {
    expect(() =>
      calculateRfd2080(
        { elapsedUs: [0, 100_000, 200_000], forceN: [10, 10, 10] },
        { baselineForceN: 10 },
      ),
    ).toThrow(/positive peak/i);
  });

  it("rejects mismatched trace arrays", () => {
    expect(() =>
      calculateRfd2080(
        { elapsedUs: [0, 100_000], forceN: [0] },
        { baselineForceN: 0 },
      ),
    ).toThrow(/equal cardinality/i);
  });
});

describe("RFD capability gate", () => {
  it("keeps application ranking disabled for a pending manifest", () => {
    expect(isRfdRankingEnabled(oracleManifest, TINDEQ_RFD_PARSER_VERSION, RFD_20_80_ALGORITHM_VERSION)).toBe(false);
  });
  it("keeps the real fixture unranked without an independent numeric oracle", () => {
    expect(fixtureSha256).toBe("C17BF8A1A891015519152A9FE3D85E2B6CD8DAAA1D97FA286C7F8683BCBAFC21");

    expect(
      evaluateRfdCapability({
        fixtureSha256,
        parserVersion: TINDEQ_RFD_PARSER_VERSION,
        algorithmVersion: RFD_20_80_ALGORITHM_VERSION,
      }),
    ).toEqual({ canRank: false, reason: "oracle_not_approved" });
  });

  it("fails closed when an approved oracle does not match the active versions", () => {
    expect(
      evaluateRfdCapability({
        fixtureSha256: "ACTIVE",
        parserVersion: TINDEQ_RFD_PARSER_VERSION,
        algorithmVersion: RFD_20_80_ALGORITHM_VERSION,
        oracle: {
          status: "approved",
          fixtureSha256: "OTHER",
          parserVersion: TINDEQ_RFD_PARSER_VERSION,
          algorithmVersion: RFD_20_80_ALGORITHM_VERSION,
          expectedRfdNPerSecond: 1,
          toleranceNPerSecond: 0.01,
          reviewer: "independent-reviewer",
          approvedAt: "2026-07-29",
        },
      }),
    ).toEqual({ canRank: false, reason: "oracle_mismatch" });
  });

  it("opens only for a matching independently approved oracle and candidate", () => {
    expect(
      evaluateRfdCapability({
        fixtureSha256: "SYNTHETIC-FIXTURE",
        parserVersion: TINDEQ_RFD_PARSER_VERSION,
        algorithmVersion: RFD_20_80_ALGORITHM_VERSION,
        candidateRfdNPerSecond: 300.005,
        oracle: {
          status: "approved",
          fixtureSha256: "SYNTHETIC-FIXTURE",
          parserVersion: TINDEQ_RFD_PARSER_VERSION,
          algorithmVersion: RFD_20_80_ALGORITHM_VERSION,
          expectedRfdNPerSecond: 300,
          toleranceNPerSecond: 0.01,
          reviewer: "independent-reviewer",
          approvedAt: "2026-07-29",
        },
      }),
    ).toEqual({ canRank: true, reason: "oracle_approved" });
  });
});
