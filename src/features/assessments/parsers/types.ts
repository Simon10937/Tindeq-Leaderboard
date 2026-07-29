export type NormalizedForceTrace = Readonly<{
  elapsedUs: readonly number[];
  forceN: readonly number[];
}>;

export type VendorForceSample = Readonly<{
  timeSeconds: number;
  weightKgf: number;
}>;

export type ParsedRfdAttempt = Readonly<{
  parserVersion: string;
  vendorMetadata: Readonly<Record<string, string>>;
  vendorMetrics: Readonly<{
    intervalTimeMs: number;
    intervalThresholdKgf: number;
    rfdInterval: number;
    rfd2080: number;
  }>;
  vendorTrace: readonly VendorForceSample[];
  trace: NormalizedForceTrace;
}>;

export type RfdOracle = Readonly<{
  status: "approved";
  fixtureSha256: string;
  parserVersion: string;
  algorithmVersion: string;
  expectedRfdNPerSecond: number;
  toleranceNPerSecond: number;
  reviewer: string;
  approvedAt: string;
}>;
