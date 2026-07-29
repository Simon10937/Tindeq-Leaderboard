import type { ParsedRfdAttempt, VendorForceSample } from "./types";
import { KGF_TO_NEWTONS, parseCsvRows, parseFiniteNumber } from "./tindeq";

export const TINDEQ_RFD_PARSER_VERSION = "tindeq-rfd-csv/v1";

const REQUIRED_METADATA_FIELDS = [
  "date",
  "tag",
  "comment",
  "unit",
  "intervalTime (ms)",
  "IntervalThreshold",
  "rfdInterval",
  "rfd2080",
] as const;

export function parseTindeqRfdCsv(source: string): ParsedRfdAttempt {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
  if (rows.length < 5) throw new Error("RFD export is missing metadata or trace rows");

  const metadataHeaders = rows[0];
  const metadataValues = rows[1];
  if (metadataHeaders.length !== metadataValues.length) {
    throw new Error("RFD metadata header and value counts differ");
  }
  if (new Set(metadataHeaders).size !== metadataHeaders.length) {
    throw new Error("RFD metadata contains duplicate fields");
  }

  const vendorMetadata = Object.fromEntries(
    metadataHeaders.map((header, index) => [header, metadataValues[index] ?? ""]),
  );
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!(field in vendorMetadata)) throw new Error(`RFD metadata is missing ${field}`);
  }
  if (vendorMetadata.unit !== "SI") {
    throw new Error(`Unsupported unit ${vendorMetadata.unit || "(blank)"}`);
  }

  const traceHeaderIndex = rows.findIndex(
    (row, index) => index >= 2 && row.length === 2 && row[0] === "time" && row[1] === "weight",
  );
  if (traceHeaderIndex === -1) throw new Error("RFD export is missing the time,weight trace header");

  const vendorTrace: VendorForceSample[] = [];
  const elapsedUs: number[] = [];
  const forceN: number[] = [];
  let previousTimeSeconds = -Infinity;
  let previousElapsedUs = -Infinity;

  for (const [offset, row] of rows.slice(traceHeaderIndex + 1).entries()) {
    if (row.length === 1 && row[0].trim() === "") continue;
    if (row.length !== 2) throw new Error(`RFD trace row ${offset + 1} must contain time and weight`);

    const timeSeconds = parseFiniteNumber(row[0], `trace time at row ${offset + 1}`);
    const weightKgf = parseFiniteNumber(row[1], `trace weight at row ${offset + 1}`);
    if (timeSeconds < 0) throw new Error("RFD trace time cannot be negative");
    if (timeSeconds <= previousTimeSeconds) throw new Error("RFD trace times must be strictly increasing");

    const normalizedElapsedUs = Math.round(timeSeconds * 1_000_000);
    if (normalizedElapsedUs <= previousElapsedUs) {
      throw new Error("RFD trace times must remain strictly increasing after microsecond normalization");
    }

    vendorTrace.push({ timeSeconds, weightKgf });
    elapsedUs.push(normalizedElapsedUs);
    forceN.push(weightKgf * KGF_TO_NEWTONS);
    previousTimeSeconds = timeSeconds;
    previousElapsedUs = normalizedElapsedUs;
  }

  if (vendorTrace.length < 2) throw new Error("RFD trace must contain at least two samples");

  return {
    parserVersion: TINDEQ_RFD_PARSER_VERSION,
    vendorMetadata,
    vendorMetrics: {
      intervalTimeMs: parseFiniteNumber(vendorMetadata["intervalTime (ms)"], "intervalTime (ms)"),
      intervalThresholdKgf: parseFiniteNumber(vendorMetadata.IntervalThreshold, "IntervalThreshold"),
      rfdInterval: parseFiniteNumber(vendorMetadata.rfdInterval, "rfdInterval"),
      rfd2080: parseFiniteNumber(vendorMetadata.rfd2080, "rfd2080"),
    },
    vendorTrace,
    trace: { elapsedUs, forceN },
  };
}
