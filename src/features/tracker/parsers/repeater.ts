import type { ParsedTrackerCsv, TrackerMetric } from "@/features/tracker/types";
import { findTraceHeader, maxValue, parseCsvRows, parseFiniteNumber, parseTraceRows, KGF_TO_NEWTONS } from "./tindeq-shared";

export const REPEATER_PARSER_VERSION = "tindeq-repeater-csv/v1";
const ACTIVE_FORCE_THRESHOLD_RATIO = 0.5;

export function parseRepeaterCsv(source: string, filename = "repeater.csv"): ParsedTrackerCsv {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
  if (rows.length < 5) throw new Error("Repeater export is missing summary or trace rows");

  const traceHeaderIndex = findTraceHeader(rows);
  if (traceHeaderIndex === -1) throw new Error("Repeater export is missing the time,weight trace header");

  const metadata = parseRepeaterSummary(rows.slice(0, traceHeaderIndex));
  const trace = parseTraceRows(rows, traceHeaderIndex + 1);
  const metrics: TrackerMetric[] = [];
  const warnings: string[] = [];

  const exportedPeakKgf = metadata.Peak ? parseFiniteNumber(metadata.Peak, "Peak") : 0;
  const tracePeakForceN = maxValue(trace.forceN);
  const peakForceN = exportedPeakKgf > 0 ? exportedPeakKgf * KGF_TO_NEWTONS : tracePeakForceN;

  const averageKgf = metadata.Avg ? parseFiniteNumber(metadata.Avg, "Avg") : 0;
  if (averageKgf > 0) {
    metrics.push({ key: "repeaterAverageForceN", label: "Repeater average force", value: averageKgf * KGF_TO_NEWTONS, unit: "N", available: true });
  } else {
    const derivedAverageForceN = peakForceN === undefined ? undefined : averageActiveForce(trace.forceN, peakForceN);
    if (derivedAverageForceN === undefined) {
      metrics.push({ key: "repeaterAverageForceN", label: "Repeater average force", available: false, reason: "Tindeq exported Avg as zero or blank" });
      warnings.push("Repeater average force is unavailable because the exported Avg value is zero or blank.");
    } else {
      metrics.push({ key: "repeaterAverageForceN", label: "Repeater average force", value: derivedAverageForceN, unit: "N", available: true });
      warnings.push("Repeater average force is estimated from trace samples at or above 50% of peak because Tindeq exported Avg as zero or blank.");
    }
  }

  if (peakForceN === undefined) {
    metrics.push({ key: "peakForceN", label: "Peak force", available: false, reason: "No trace samples were available" });
  } else {
    metrics.push({ key: "peakForceN", label: "Peak force", value: peakForceN, unit: "N", available: true });
  }

  return {
    mode: "repeater",
    parserVersion: REPEATER_PARSER_VERSION,
    filename,
    sourceSummary: "Repeater",
    vendorMetadata: metadata,
    metrics,
    trace,
    warnings,
  };
}

function averageActiveForce(forceN: readonly number[], peakForceN: number) {
  const threshold = peakForceN * ACTIVE_FORCE_THRESHOLD_RATIO;
  const active = forceN.filter((value) => value >= threshold);
  if (active.length === 0) return undefined;
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

function parseRepeaterSummary(rows: readonly (readonly string[])[]) {
  const metadata: Record<string, string> = {};
  for (const row of rows) {
    if (row.length === 0) continue;
    if (row.length >= 2 && row[0].trim()) metadata[row[0].trim()] = row[1] ?? "";
  }
  if (!("Avg" in metadata) && !("Peak" in metadata)) {
    throw new Error("Repeater export is missing Avg or Peak summary rows");
  }
  return metadata;
}
