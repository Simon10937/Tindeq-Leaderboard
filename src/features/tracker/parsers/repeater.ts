import type { ParsedTrackerCsv, RepeaterPeakCandidate, RepeaterPeakReview, TrackerMetric, TrackerSession, TrackerTrace } from "@/features/tracker/types";
import { findTraceHeader, maxValue, mergeMetrics, parseCsvRows, parseFiniteNumber, parseTraceRows, validForceSamples, KGF_TO_NEWTONS } from "./tindeq-shared";

export const REPEATER_PARSER_VERSION = "tindeq-repeater-csv/v1";
const ACTIVE_FORCE_THRESHOLD_RATIO = 0.5;
const ALL_PEAKS_EXCLUDED_REASON = "Keep at least one rep included to calculate repeater stats";
const EXCLUDED_PEAKS_WARNING_PATTERN = /^Excluded \d+ repeater peak(?:s)? from calculated statistics\.$/;

export function parseRepeaterCsv(source: string, filename = "repeater.csv"): ParsedTrackerCsv {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
  if (rows.length < 5) throw new Error("Repeater export is missing summary or trace rows");

  const traceHeaderIndex = findTraceHeader(rows);
  if (traceHeaderIndex === -1) throw new Error("Repeater export is missing the time,weight trace header");

  const metadata = parseRepeaterSummary(rows.slice(0, traceHeaderIndex));
  const trace = parseTraceRows(rows, traceHeaderIndex + 1);
  const candidates = repeaterPeakCandidatesFromTrace(trace);
  const { metrics, warnings } = repeaterMetricsFromTrace(metadata, trace.forceN);

  return {
    mode: "repeater",
    parserVersion: REPEATER_PARSER_VERSION,
    filename,
    sourceSummary: "Repeater",
    vendorMetadata: metadata,
    metrics,
    trace,
    warnings,
    repeaterPeakReview: { candidates, excludedCandidateIds: [] },
  };
}

export function augmentStoredRepeaterMetrics(session: TrackerSession): { session: TrackerSession; changed: boolean; needsReimport: boolean } {
  if (session.mode !== "repeater") return { session, changed: false, needsReimport: false };

  const hasAverage = session.metrics.some((metric) => metric.key === "repeaterAverageForceN" && metric.available);
  const hasPeak = session.metrics.some((metric) => metric.key === "peakForceN" && metric.available);
  if (hasAverage && hasPeak) return { session, changed: false, needsReimport: false };

  const { metrics, warnings, repeaterPeakReview } = applyRepeaterPeakExclusions(session, []);
  const average = metrics.find((metric) => metric.key === "repeaterAverageForceN");
  const peak = metrics.find((metric) => metric.key === "peakForceN");
  const canAugment = average?.available || peak?.available;
  if (!canAugment) return { session, changed: false, needsReimport: true };

  const merged = mergeMetrics(session.metrics, metrics);
  return {
    session: {
      ...session,
      metrics: merged,
      warnings: mergeWarnings(session.warnings, warnings),
      repeaterPeakReview,
    },
    changed: true,
    needsReimport: false,
  };
}

export function applyRepeaterPeakExclusions(
  session: Pick<ParsedTrackerCsv, "vendorMetadata" | "metrics" | "trace" | "warnings" | "repeaterPeakReview">,
  excludedCandidateIds: readonly string[],
) {
  const candidates = session.repeaterPeakReview?.candidates.length
    ? session.repeaterPeakReview.candidates
    : repeaterPeakCandidatesFromTrace(session.trace);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const excludedIds = Array.from(new Set(excludedCandidateIds.filter((id) => candidateIds.has(id))));
  const review: RepeaterPeakReview = {
    candidates,
    excludedCandidateIds: excludedIds,
  };
  const stableWarnings = withoutRepeaterExclusionWarnings(session.warnings);

  if (excludedIds.length === 0) {
    const { metrics, warnings } = repeaterMetricsFromTrace(session.vendorMetadata, session.trace.forceN);
    return { metrics, warnings: mergeWarnings(stableWarnings, warnings), repeaterPeakReview: review };
  }

  const excludedIdSet = new Set(excludedIds);
  const includedCandidates = candidates.filter((candidate) => !excludedIdSet.has(candidate.id));
  if (includedCandidates.length === 0) {
    return {
      metrics: unavailableRepeaterMetrics(ALL_PEAKS_EXCLUDED_REASON),
      warnings: mergeWarnings(stableWarnings, [ALL_PEAKS_EXCLUDED_REASON]),
      repeaterPeakReview: { ...review, warning: ALL_PEAKS_EXCLUDED_REASON },
    };
  }

  const metrics = metricsFromIncludedRepeaterCandidates(includedCandidates, session.trace.forceN);
  const warnings = mergeWarnings(stableWarnings, [`Excluded ${excludedIds.length} repeater peak${excludedIds.length === 1 ? "" : "s"} from calculated statistics.`]);
  return { metrics, warnings, repeaterPeakReview: review };
}

export function repeaterPeakCandidatesFromTrace(trace: TrackerTrace): RepeaterPeakCandidate[] {
  const peakForceN = maxValue(validForceSamples(trace.forceN));
  if (peakForceN === undefined || peakForceN <= 0) return [];

  const threshold = robustActiveForceThreshold(trace.forceN);
  const regions: Array<{ start: number; end: number }> = [];
  let start: number | undefined;
  for (const [index, force] of trace.forceN.entries()) {
    const active = Number.isFinite(force) && force >= threshold;
    if (active && start === undefined) start = index;
    if ((!active || index === trace.forceN.length - 1) && start !== undefined) {
      const end = active && index === trace.forceN.length - 1 ? index : index - 1;
      regions.push({ start, end });
      start = undefined;
    }
  }

  return regions.map((region, index) => {
    let peakTraceIndex = region.start;
    for (let cursor = region.start; cursor <= region.end; cursor += 1) {
      if ((trace.forceN[cursor] ?? -Infinity) > (trace.forceN[peakTraceIndex] ?? -Infinity)) peakTraceIndex = cursor;
    }
    return {
      id: `${REPEATER_PARSER_VERSION}:peak:${peakTraceIndex}`,
      parserVersion: REPEATER_PARSER_VERSION,
      ordinal: index + 1,
      peakTraceIndex,
      peakElapsedUs: trace.elapsedUs[peakTraceIndex] ?? 0,
      peakForceN: trace.forceN[peakTraceIndex] ?? 0,
      regionStartIndex: region.start,
      regionEndIndex: region.end,
    };
  });
}

function repeaterMetricsFromTrace(metadata: Readonly<Record<string, string>>, forceN: readonly number[]) {
  const metrics: TrackerMetric[] = [];
  const warnings: string[] = [];

  const exportedPeakKgf = metadata.Peak ? parseFiniteNumber(metadata.Peak, "Peak") : 0;
  const tracePeakForceN = maxValue(validForceSamples(forceN));
  const peakForceN = exportedPeakKgf > 0 ? exportedPeakKgf * KGF_TO_NEWTONS : tracePeakForceN;

  const averageKgf = metadata.Avg ? parseFiniteNumber(metadata.Avg, "Avg") : 0;
  if (averageKgf > 0) {
    metrics.push({ key: "repeaterAverageForceN", label: "Repeater average force", value: averageKgf * KGF_TO_NEWTONS, unit: "N", available: true });
  } else {
    const derivedAverageForceN = peakForceN === undefined ? undefined : averageActiveForce(forceN, peakForceN);
    if (derivedAverageForceN === undefined) {
      metrics.push({ key: "repeaterAverageForceN", label: "Estimated avg repeater force", available: false, reason: "Tindeq exported Avg as zero or blank and no active trace samples were available" });
      warnings.push("Repeater average force is unavailable because the exported Avg value is zero or blank.");
    } else {
      metrics.push({ key: "repeaterAverageForceN", label: "Estimated avg repeater force", value: derivedAverageForceN, unit: "N", available: true });
      warnings.push("Repeater average force is estimated from trace samples at or above 50% of peak because Tindeq exported Avg as zero or blank.");
    }
  }

  if (peakForceN === undefined) {
    metrics.push({ key: "peakForceN", label: "Peak force", available: false, reason: "No trace samples were available" });
  } else {
    metrics.push({ key: "peakForceN", label: "Peak force", value: peakForceN, unit: "N", available: true });
  }

  return { metrics, warnings };
}

function metricsFromIncludedRepeaterCandidates(candidates: readonly RepeaterPeakCandidate[], forceN: readonly number[]): TrackerMetric[] {
  let peakForceN: number | undefined;
  let forceSum = 0;
  let forceCount = 0;

  for (const candidate of candidates) {
    if (Number.isFinite(candidate.peakForceN) && candidate.peakForceN >= 0) {
      peakForceN = peakForceN === undefined ? candidate.peakForceN : Math.max(peakForceN, candidate.peakForceN);
    }

    for (let index = candidate.regionStartIndex; index <= candidate.regionEndIndex; index += 1) {
      const value = forceN[index];
      if (!Number.isFinite(value) || value < 0) continue;
      forceSum += value;
      forceCount += 1;
    }
  }

  const averageForceN = forceCount > 0 ? forceSum / forceCount : undefined;

  return [
    averageForceN === undefined
      ? { key: "repeaterAverageForceN", label: "Estimated avg repeater force", available: false, reason: "No included repeater samples were available" }
      : { key: "repeaterAverageForceN", label: "Estimated avg repeater force", value: averageForceN, unit: "N", available: true },
    peakForceN === undefined
      ? { key: "peakForceN", label: "Peak force", available: false, reason: "No included repeater peaks were available" }
      : { key: "peakForceN", label: "Peak force", value: peakForceN, unit: "N", available: true },
  ];
}

function unavailableRepeaterMetrics(reason: string): TrackerMetric[] {
  return [
    { key: "repeaterAverageForceN", label: "Estimated avg repeater force", available: false, reason },
    { key: "peakForceN", label: "Peak force", available: false, reason },
  ];
}

function mergeWarnings(existing: readonly string[], warnings: readonly string[]) {
  return Array.from(new Set([...existing, ...warnings]));
}

function withoutRepeaterExclusionWarnings(warnings: readonly string[]) {
  return warnings.filter((warning) => warning !== ALL_PEAKS_EXCLUDED_REASON && !EXCLUDED_PEAKS_WARNING_PATTERN.test(warning));
}

function robustActiveForceThreshold(forceN: readonly number[]) {
  const samples = validForceSamples(forceN).filter((value) => value > 0).sort((a, b) => a - b);
  if (samples.length === 0) return 0;
  const robustPeakIndex = Math.max(0, Math.floor((samples.length - 1) * 0.95));
  return samples[robustPeakIndex] * ACTIVE_FORCE_THRESHOLD_RATIO;
}

function averageActiveForce(forceN: readonly number[], peakForceN: number) {
  const threshold = peakForceN * ACTIVE_FORCE_THRESHOLD_RATIO;
  const active = validForceSamples(forceN).filter((value) => value >= threshold);
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
