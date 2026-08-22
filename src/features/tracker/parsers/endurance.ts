import type { ParsedTrackerCsv } from "@/features/tracker/types";
import { findTraceHeader, maxValue, parseCsvRows, parseFiniteNumber, parseTraceRows, readKeyValueRow, KGF_TO_NEWTONS } from "./tindeq-shared";

export const ENDURANCE_PARSER_VERSION = "tindeq-endurance-csv/v1";

export function parseEnduranceCsv(source: string, filename = "endurance.csv"): ParsedTrackerCsv {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
  if (rows.length < 5) throw new Error("Endurance export is missing metadata or trace rows");

  const metadata = readKeyValueRow(rows[0], rows[1]);
  if (!("critical force" in metadata)) throw new Error("Endurance export is missing critical force");
  if (metadata.unit !== "SI") throw new Error(`Unsupported unit ${metadata.unit || "(blank)"}`);

  const traceHeaderIndex = findTraceHeader(rows);
  if (traceHeaderIndex === -1) throw new Error("Endurance export is missing the time,weight trace header");

  const trace = parseTraceRows(rows, traceHeaderIndex + 1);
  const criticalForceN = parseFiniteNumber(metadata["critical force"], "critical force") * KGF_TO_NEWTONS;
  const peakForce = maxValue(trace.forceN);

  return {
    mode: "endurance",
    parserVersion: ENDURANCE_PARSER_VERSION,
    filename,
    sourceSummary: "Endurance",
    vendorMetadata: metadata,
    metrics: [
      { key: "criticalForceN", label: "Critical force", value: criticalForceN, unit: "N", available: true },
      peakForce === undefined
        ? { key: "peakForceN", label: "Peak force", available: false, reason: "No trace samples were available" }
        : { key: "peakForceN", label: "Peak force", value: peakForce, unit: "N", available: true },
    ],
    trace,
    warnings: [],
  };
}
