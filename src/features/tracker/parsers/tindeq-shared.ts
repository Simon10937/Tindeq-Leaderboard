import type { TrackerMetric } from "@/features/tracker/types";

export const KGF_TO_NEWTONS = 9.80665;

export type CsvRow = readonly string[];

export function parseCsvRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) throw new Error("Malformed CSV quote");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("Unterminated CSV quote");
  if (field.length > 0 || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }

  return rows;
}

export function parseFiniteNumber(value: string, fieldName: string): number {
  if (value.trim() === "") throw new Error(`${fieldName} must be present`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be finite`);
  return parsed;
}

export function readKeyValueRow(headers: CsvRow, values: CsvRow): Record<string, string> {
  if (headers.length !== values.length) throw new Error("Metadata header and value counts differ");
  if (new Set(headers).size !== headers.length) throw new Error("Metadata contains duplicate fields");
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
}

export function findTraceHeader(rows: readonly CsvRow[]): number {
  return rows.findIndex((row) => row.length === 2 && row[0] === "time" && row[1] === "weight");
}

export function parseTraceRows(rows: readonly CsvRow[], startIndex: number) {
  const elapsedUs: number[] = [];
  const forceN: number[] = [];
  let previousTimeSeconds = -Infinity;
  let previousElapsedUs = -Infinity;

  for (const [offset, row] of rows.slice(startIndex).entries()) {
    if (row.length === 1 && row[0].trim() === "") continue;
    if (row.length !== 2) throw new Error(`Trace row ${offset + 1} must contain time and weight`);

    const timeSeconds = parseFiniteNumber(row[0], `trace time at row ${offset + 1}`);
    const weightKgf = parseFiniteNumber(row[1], `trace weight at row ${offset + 1}`);
    if (timeSeconds < 0) throw new Error("Trace time cannot be negative");
    if (timeSeconds <= previousTimeSeconds) throw new Error("Trace times must be strictly increasing");

    const normalizedElapsedUs = Math.round(timeSeconds * 1_000_000);
    if (normalizedElapsedUs <= previousElapsedUs) {
      throw new Error("Trace times must remain strictly increasing after microsecond normalization");
    }

    elapsedUs.push(normalizedElapsedUs);
    forceN.push(weightKgf * KGF_TO_NEWTONS);
    previousTimeSeconds = timeSeconds;
    previousElapsedUs = normalizedElapsedUs;
  }

  if (elapsedUs.length < 2) throw new Error("Trace must contain at least two samples");
  return { elapsedUs, forceN };
}

export function maxValue(values: readonly number[]) {
  if (values.length === 0) return undefined;
  return Math.max(...values);
}

export function mergeMetrics(existing: readonly TrackerMetric[], replacements: readonly TrackerMetric[]) {
  const replacementKeys = new Set(replacements.map((metric) => metric.key));
  return [
    ...existing.filter((metric) => !replacementKeys.has(metric.key)),
    ...replacements,
  ];
}

export function validForceSamples(forceN: readonly number[]) {
  return forceN.filter((value) => Number.isFinite(value) && value >= 0);
}
