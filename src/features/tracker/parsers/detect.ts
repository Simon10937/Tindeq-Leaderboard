import type { ParsedTrackerCsv } from "@/features/tracker/types";
import { parseCsvRows, findTraceHeader, parseTraceRows } from "./tindeq-shared";
import { parseEnduranceCsv } from "./endurance";
import { parsePeakForceCsv } from "./peak-force";
import { parseRepeaterCsv } from "./repeater";

export type DetectionResult =
  | Readonly<{ status: "detected"; parsed: ParsedTrackerCsv }>
  | Readonly<{ status: "unsupported_trace"; parsed: ParsedTrackerCsv }>
  | Readonly<{ status: "invalid"; filename: string; error: string }>;

export function detectTindeqCsv(source: string, filename = "attempt.csv"): DetectionResult {
  try {
    const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
    const firstRow = rows[0] ?? [];
    const hasCriticalForce = firstRow.includes("critical force");
    const hasPeakForceSummary = firstRow.includes("max weight");
    const hasRepeaterSummary = rows.some((row) => row[0] === "Avg" || row[0] === "Peak");

    if (hasCriticalForce) return { status: "detected", parsed: parseEnduranceCsv(source, filename) };
    if (hasPeakForceSummary) return { status: "detected", parsed: parsePeakForceCsv(source, filename) };
    if (hasRepeaterSummary) return { status: "detected", parsed: parseRepeaterCsv(source, filename) };

    const traceHeaderIndex = findTraceHeader(rows);
    if (traceHeaderIndex !== -1) {
      return {
        status: "unsupported_trace",
        parsed: {
          mode: "unsupported_trace",
          parserVersion: "tindeq-unsupported-trace/v1",
          filename,
          sourceSummary: "Unsupported trace",
          vendorMetadata: {},
          metrics: [
            { key: "criticalForceN", label: "Critical force", available: false, reason: "Unsupported CSV shape" },
            { key: "repeaterAverageForceN", label: "Repeater average force", available: false, reason: "Unsupported CSV shape" },
          ],
          trace: parseTraceRows(rows, traceHeaderIndex + 1),
          warnings: ["This CSV has a readable trace but no supported Endurance or Repeater summary."],
        },
      };
    }

    return { status: "invalid", filename, error: "Unsupported Tindeq CSV shape" };
  } catch (error) {
    return { status: "invalid", filename, error: error instanceof Error ? error.message : "Could not parse CSV" };
  }
}
