import type { NormalizedForceTrace } from "../parsers/types";

export const RFD_20_80_ALGORITHM_VERSION = "rfd-20-80/v1";

export type RfdCalculationConfig = Readonly<{
  baselineForceN: number;
}>;

export type RfdCalculation = Readonly<{
  algorithmVersion: typeof RFD_20_80_ALGORITHM_VERSION;
  baselineForceN: number;
  peakCorrectedForceN: number;
  twentyPercentForceN: number;
  eightyPercentForceN: number;
  twentyPercentElapsedUs: number;
  eightyPercentElapsedUs: number;
  rfdNPerSecond: number;
}>;

export function calculateRfd2080(
  trace: NormalizedForceTrace,
  config: RfdCalculationConfig,
): RfdCalculation {
  validateTrace(trace);
  if (!Number.isFinite(config.baselineForceN)) throw new Error("RFD baseline force must be finite");

  const corrected = trace.forceN.map((force) => force - config.baselineForceN);
  let peakIndex = 0;
  for (let index = 1; index < corrected.length; index += 1) {
    if (corrected[index] > corrected[peakIndex]) peakIndex = index;
  }
  const peakCorrectedForceN = corrected[peakIndex];
  if (!(peakCorrectedForceN > 0)) throw new Error("RFD trace must have a positive peak above baseline");

  const twentyPercentForceN = peakCorrectedForceN * 0.2;
  const eightyPercentForceN = peakCorrectedForceN * 0.8;
  const twentyPercentElapsedUs = findFirstRisingCrossing(
    trace.elapsedUs,
    corrected,
    twentyPercentForceN,
    peakIndex,
  );
  const eightyPercentElapsedUs = findFirstRisingCrossing(
    trace.elapsedUs,
    corrected,
    eightyPercentForceN,
    peakIndex,
  );
  if (eightyPercentElapsedUs <= twentyPercentElapsedUs) {
    throw new Error("RFD trace does not contain a distinct 20-80 rise");
  }

  const elapsedSeconds = (eightyPercentElapsedUs - twentyPercentElapsedUs) / 1_000_000;
  return {
    algorithmVersion: RFD_20_80_ALGORITHM_VERSION,
    baselineForceN: config.baselineForceN,
    peakCorrectedForceN,
    twentyPercentForceN,
    eightyPercentForceN,
    twentyPercentElapsedUs,
    eightyPercentElapsedUs,
    rfdNPerSecond: (eightyPercentForceN - twentyPercentForceN) / elapsedSeconds,
  };
}

function validateTrace(trace: NormalizedForceTrace): void {
  if (trace.elapsedUs.length !== trace.forceN.length || trace.elapsedUs.length < 2) {
    throw new Error("RFD trace arrays must have equal cardinality and at least two samples");
  }
  let previous = -Infinity;
  for (let index = 0; index < trace.elapsedUs.length; index += 1) {
    const elapsedUs = trace.elapsedUs[index];
    const forceN = trace.forceN[index];
    if (!Number.isFinite(elapsedUs) || !Number.isFinite(forceN)) {
      throw new Error("RFD trace values must be finite");
    }
    if (!Number.isInteger(elapsedUs) || elapsedUs < 0 || elapsedUs <= previous) {
      throw new Error("RFD elapsed times must be non-negative, integer microseconds, and strictly increasing");
    }
    previous = elapsedUs;
  }
}

function findFirstRisingCrossing(
  elapsedUs: readonly number[],
  forceN: readonly number[],
  targetN: number,
  endIndex: number,
): number {
  for (let index = 1; index <= endIndex; index += 1) {
    const before = forceN[index - 1];
    const after = forceN[index];
    if (before < targetN && after >= targetN && after > before) {
      const fraction = (targetN - before) / (after - before);
      return elapsedUs[index - 1] + fraction * (elapsedUs[index] - elapsedUs[index - 1]);
    }
  }
  throw new Error(`RFD trace never reaches the ${targetN} N crossing before peak`);
}
