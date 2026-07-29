import type { RfdOracle } from "../parsers/types";

export type RfdCapabilityResult =
  | Readonly<{ canRank: true; reason: "oracle_approved" }>
  | Readonly<{
      canRank: false;
      reason: "oracle_not_approved" | "oracle_mismatch" | "metric_outside_tolerance";
    }>;

export function evaluateRfdCapability(input: Readonly<{
  fixtureSha256: string;
  parserVersion: string;
  algorithmVersion: string;
  candidateRfdNPerSecond?: number;
  oracle?: RfdOracle;
}>): RfdCapabilityResult {
  const oracle = input.oracle;
  if (!oracle || oracle.status !== "approved") {
    return { canRank: false, reason: "oracle_not_approved" };
  }

  if (
    normalizeHash(oracle.fixtureSha256) !== normalizeHash(input.fixtureSha256) ||
    oracle.parserVersion !== input.parserVersion ||
    oracle.algorithmVersion !== input.algorithmVersion ||
    !oracle.reviewer.trim() ||
    !/^\d{4}-\d{2}-\d{2}/.test(oracle.approvedAt) ||
    !Number.isFinite(oracle.expectedRfdNPerSecond) ||
    !Number.isFinite(oracle.toleranceNPerSecond) ||
    oracle.toleranceNPerSecond <= 0
  ) {
    return { canRank: false, reason: "oracle_mismatch" };
  }

  if (
    !Number.isFinite(input.candidateRfdNPerSecond) ||
    Math.abs(input.candidateRfdNPerSecond! - oracle.expectedRfdNPerSecond) > oracle.toleranceNPerSecond
  ) {
    return { canRank: false, reason: "metric_outside_tolerance" };
  }

  return { canRank: true, reason: "oracle_approved" };
}

function normalizeHash(hash: string): string {
  return hash.trim().toUpperCase();
}

export function isRfdRankingEnabled(oracle: unknown, parserVersion: string, algorithmVersion: string): boolean {
  if (!oracle || typeof oracle !== "object") return false;
  const candidate = oracle as Partial<RfdOracle>;
  return candidate.status === "approved" && candidate.parserVersion === parserVersion &&
    candidate.algorithmVersion === algorithmVersion && typeof candidate.fixtureSha256 === "string" &&
    /^[A-Fa-f0-9]{64}$/.test(candidate.fixtureSha256) && typeof candidate.expectedRfdNPerSecond === "number" &&
    Number.isFinite(candidate.expectedRfdNPerSecond) && typeof candidate.toleranceNPerSecond === "number" &&
    candidate.toleranceNPerSecond > 0 && typeof candidate.reviewer === "string" && candidate.reviewer.trim().length > 0 &&
    typeof candidate.approvedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(candidate.approvedAt);
}
