import type { ParsedTrackerCsv, TrackerMetric, TrackerSession } from "@/features/tracker/types";
import { KGF_TO_NEWTONS, mergeMetrics, parseCsvRows, parseFiniteNumber, readKeyValueRow } from "./tindeq-shared";

export const PEAK_FORCE_PARSER_VERSION = "tindeq-peak-force-csv/v1";

export function parsePeakForceCsv(source: string, filename = "peak-force.csv"): ParsedTrackerCsv {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("Peak force export is missing metadata rows");

  const metadata = readKeyValueRow(rows[0], rows[1]);
  if (!("max weight" in metadata)) throw new Error("Peak force export is missing max weight");
  if (metadata.unit !== "SI") throw new Error(`Unsupported unit ${metadata.unit || "(blank)"}`);

  const maxWeightN = parseFiniteNumber(metadata["max weight"], "max weight") * KGF_TO_NEWTONS;

  return {
    mode: "peak_force",
    parserVersion: PEAK_FORCE_PARSER_VERSION,
    filename,
    sourceSummary: "Peak force",
    vendorMetadata: metadata,
    metrics: [{ key: "peakForceN", label: "Max force", value: maxWeightN, unit: "N", available: true }],
    trace: { elapsedUs: [], forceN: [] },
    warnings: [],
  };
}

export function augmentStoredPeakForceMetrics(session: TrackerSession): { session: TrackerSession; changed: boolean; needsReimport: boolean } {
  if (session.mode !== "unsupported_trace" && session.mode !== "peak_force") return { session, changed: false, needsReimport: false };

  const existingPeak = session.metrics.some((metric) => metric.key === "peakForceN" && metric.available);
  if (session.mode === "peak_force" && existingPeak) return { session, changed: false, needsReimport: false };

  const maxWeight = session.vendorMetadata["max weight"];
  const canInferPeakForce = session.mode === "peak_force" || looksLikePeakForce(session);
  if (!maxWeight || !canInferPeakForce) return { session, changed: false, needsReimport: false };

  const metric: TrackerMetric = { key: "peakForceN", label: "Max force", value: parseFiniteNumber(maxWeight, "max weight") * KGF_TO_NEWTONS, unit: "N", available: true };
  return {
    session: {
      ...session,
      mode: "peak_force",
      sourceSummary: "Peak force",
      parserVersion: session.parserVersion.includes("peak-force") ? session.parserVersion : `${session.parserVersion}+peak-force-backfill`,
      metrics: mergeMetrics(session.metrics, [metric]),
      warnings: session.warnings.filter((warning) => !warning.toLowerCase().includes("unsupported")),
    },
    changed: true,
    needsReimport: false,
  };
}

function looksLikePeakForce(session: TrackerSession) {
  const text = `${session.filename} ${session.sourceSummary} ${Object.values(session.vendorMetadata).join(" ")} ${session.tags?.join(" ") ?? ""}`.toLowerCase();
  return text.includes("peak force") || text.includes("max force") || text.includes("max weight");
}
