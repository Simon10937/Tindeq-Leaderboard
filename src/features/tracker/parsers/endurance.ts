import type { ParsedTrackerCsv, TrackerMetric, TrackerSession } from "@/features/tracker/types";
import { findTraceHeader, mergeMetrics, parseCsvRows, parseFiniteNumber, parseTraceRows, readKeyValueRow, KGF_TO_NEWTONS } from "./tindeq-shared";

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
  const traceMetrics = enduranceTraceMetrics(trace.forceN);

  return {
    mode: "endurance",
    parserVersion: ENDURANCE_PARSER_VERSION,
    filename,
    sourceSummary: "Endurance",
    vendorMetadata: metadata,
    metrics: [
      { key: "criticalForceN", label: "Critical force", value: criticalForceN, unit: "N", available: true },
      ...traceMetrics,
    ],
    trace,
    warnings: [],
  };
}

export function augmentStoredEnduranceMetrics(session: TrackerSession): { session: TrackerSession; changed: boolean; needsReimport: boolean } {
  if (session.mode !== "endurance" && !isStoredEnduranceTrace(session)) return { session, changed: false, needsReimport: false };

  const hasAverage = session.metrics.some((metric) => metric.key === "enduranceAverageForceN" && metric.available);
  const hasPeak = session.metrics.some((metric) => metric.key === "peakForceN" && metric.available);
  const normalizedSession = session.mode === "endurance" ? session : {
    ...session,
    mode: "endurance" as const,
    sourceSummary: "Endurance",
    parserVersion: `${session.parserVersion}+endurance-trace-backfill`,
    warnings: session.warnings.filter((warning) => !warning.toLowerCase().includes("unsupported")),
  };
  if (hasAverage && hasPeak && normalizedSession === session) return { session, changed: false, needsReimport: false };

  const metrics = enduranceTraceMetrics(normalizedSession.trace.forceN);
  if (!metrics.some((metric) => metric.available)) return { session: normalizedSession, changed: normalizedSession !== session, needsReimport: true };

  return {
    session: {
      ...normalizedSession,
      metrics: mergeMetrics(normalizedSession.metrics, metrics),
    },
    changed: true,
    needsReimport: false,
  };
}

function isStoredEnduranceTrace(session: TrackerSession) {
  if (session.mode !== "unsupported_trace") return false;
  const text = `${session.filename} ${session.sourceSummary} ${Object.values(session.vendorMetadata).join(" ")} ${session.tags?.join(" ") ?? ""}`.toLowerCase();
  return text.includes("endurance");
}

function enduranceTraceMetrics(forceN: readonly number[]): TrackerMetric[] {
  const stats = forceStats(forceN);

  return [
    stats === undefined
      ? { key: "enduranceAverageForceN", label: "Endurance avg force", available: false, reason: "No trace samples were available" }
      : { key: "enduranceAverageForceN", label: "Endurance avg force", value: stats.average, unit: "N", available: true },
    stats === undefined
      ? { key: "peakForceN", label: "Max force", available: false, reason: "No trace samples were available" }
      : { key: "peakForceN", label: "Max force", value: stats.max, unit: "N", available: true },
  ];
}

function forceStats(forceN: readonly number[]) {
  let count = 0;
  let sum = 0;
  let max = -Infinity;
  for (const value of forceN) {
    if (!Number.isFinite(value) || value < 0) continue;
    count += 1;
    sum += value;
    max = Math.max(max, value);
  }
  if (count === 0) return undefined;
  return { average: sum / count, max };
}
