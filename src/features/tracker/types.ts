export type TrackerMode = "endurance" | "repeater" | "unsupported_trace";

export type TrackerMetricKey =
  | "criticalForceN"
  | "repeaterAverageForceN"
  | "peakForceN";

export type MetricValue = Readonly<{
  key: TrackerMetricKey;
  label: string;
  value: number;
  unit: "N";
  available: true;
}>;

export type UnavailableMetric = Readonly<{
  key: TrackerMetricKey;
  label: string;
  available: false;
  reason: string;
}>;

export type TrackerMetric = MetricValue | UnavailableMetric;

export type TrackerTrace = Readonly<{
  elapsedUs: readonly number[];
  forceN: readonly number[];
}>;

export type ImportContext = Readonly<{
  grip: string;
  testedAt: string;
  hand?: "left" | "right" | "both";
  notes?: string;
}>;

export type ParsedTrackerCsv = Readonly<{
  mode: TrackerMode;
  parserVersion: string;
  filename: string;
  sourceSummary: string;
  vendorMetadata: Readonly<Record<string, string>>;
  metrics: readonly TrackerMetric[];
  trace: TrackerTrace;
  warnings: readonly string[];
}>;

export type TrackerSession = ParsedTrackerCsv & Readonly<{
  id: string;
  grip: string;
  testedAt: string;
  hand?: "left" | "right" | "both";
  notes?: string;
  createdAt: string;
}>;

export type ProgressPoint = Readonly<{
  sessionId: string;
  mode: TrackerMode;
  grip: string;
  hand?: "left" | "right" | "both";
  testedAt: string;
  metricKey: TrackerMetricKey;
  label: string;
  value: number;
  unit: "N";
}>;

export type ImportValidation =
  | Readonly<{ ok: true; context: ImportContext }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

export function validateImportContext(input: Partial<ImportContext>): ImportValidation {
  const errors: string[] = [];
  const grip = input.grip?.trim() ?? "";
  const testedAt = input.testedAt?.trim() ?? "";

  if (!grip) errors.push("Grip type is required.");
  if (!testedAt) {
    errors.push("Test date is required.");
  } else if (Number.isNaN(Date.parse(testedAt))) {
    errors.push("Test date must be valid.");
  }

  if (input.hand && !["left", "right", "both"].includes(input.hand)) {
    errors.push("Hand must be left, right, or both.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    context: {
      grip,
      testedAt,
      hand: input.hand,
      notes: input.notes?.trim() || undefined,
    },
  };
}

export function buildTrackerSession(
  parsed: ParsedTrackerCsv,
  context: ImportContext,
  id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
): TrackerSession {
  return {
    ...parsed,
    id,
    grip: context.grip,
    testedAt: context.testedAt,
    hand: context.hand,
    notes: context.notes,
    createdAt: new Date().toISOString(),
  };
}

export function progressPointsForSession(
  session: TrackerSession,
  selectedMetric?: TrackerMetricKey,
): ProgressPoint[] {
  return session.metrics
    .filter((metric): metric is MetricValue => metric.available)
    .filter((metric) => !selectedMetric || metric.key === selectedMetric)
    .map((metric) => ({
      sessionId: session.id,
      mode: session.mode,
      grip: session.grip,
      hand: session.hand,
      testedAt: session.testedAt,
      metricKey: metric.key,
      label: metric.label,
      value: metric.value,
      unit: metric.unit,
    }));
}
