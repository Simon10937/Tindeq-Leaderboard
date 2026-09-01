export type TrackerMode = "endurance" | "repeater" | "peak_force" | "unsupported_trace";

export type TrackerMetricKey =
  | "criticalForceN"
  | "enduranceAverageForceN"
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

export type RepeaterPeakCandidate = Readonly<{
  id: string;
  parserVersion: string;
  ordinal: number;
  peakTraceIndex: number;
  peakElapsedUs: number;
  peakForceN: number;
  regionStartIndex: number;
  regionEndIndex: number;
}>;

export type RepeaterPeakReview = Readonly<{
  candidates: readonly RepeaterPeakCandidate[];
  excludedCandidateIds: readonly string[];
  warning?: string;
}>;

export type ImportContext = Readonly<{
  grip: string;
  testedAt: string;
  hand?: "left" | "right" | "both";
  notes?: string;
  tags?: readonly string[];
  referenceRole?: "healthy_hand_baseline";
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
  repeaterPeakReview?: RepeaterPeakReview;
}>;

export type TrackerSession = ParsedTrackerCsv & Readonly<{
  id: string;
  grip: string;
  testedAt: string;
  hand?: "left" | "right" | "both";
  notes?: string;
  tags?: readonly string[];
  referenceRole?: "healthy_hand_baseline";
  createdAt: string;
  updatedAt?: string;
  auditLog?: readonly TrackerSessionAuditEntry[];
}>;

export type TrackerSessionAuditEntry = Readonly<{
  id: string;
  type: "created" | "metadata_updated";
  createdAt: string;
  changes: readonly TrackerSessionAuditChange[];
}>;

export type TrackerSessionAuditChange = Readonly<{
  field: "grip" | "testedAt" | "hand" | "notes" | "tags" | "referenceRole" | "repeaterPeakExclusions";
  before?: string | readonly string[];
  after?: string | readonly string[];
}>;

export type TrackerSessionMetadataUpdate = Readonly<{
  metrics?: readonly TrackerMetric[];
  warnings?: readonly string[];
  repeaterPeakReview?: RepeaterPeakReview;
}>;

export type UpdateTrackerSessionMetadataOptions = Readonly<{
  now?: string;
  metadataUpdate?: TrackerSessionMetadataUpdate;
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
  if (input.referenceRole && input.referenceRole !== "healthy_hand_baseline") {
    errors.push("Reference role must be a healthy-hand baseline.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    context: {
      grip,
      testedAt,
      hand: input.hand,
      notes: input.notes?.trim() || undefined,
      tags: normalizeTags(input.tags),
      referenceRole: input.referenceRole,
    },
  };
}

export function buildTrackerSession(
  parsed: ParsedTrackerCsv,
  context: ImportContext,
  id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
): TrackerSession {
  const createdAt = new Date().toISOString();
  const tags = normalizeTags(context.tags);
  const repeaterPeakReview = parsed.mode === "repeater" ? normalizeRepeaterPeakReview(parsed.repeaterPeakReview) : undefined;
  return {
    ...parsed,
    ...(repeaterPeakReview ? { repeaterPeakReview } : {}),
    id,
    grip: context.grip,
    testedAt: context.testedAt,
    hand: context.hand,
    notes: context.notes,
    tags,
    referenceRole: context.referenceRole,
    createdAt,
    updatedAt: createdAt,
    auditLog: [{
      id: auditEntryId(id, createdAt, "created"),
      type: "created",
      createdAt,
      changes: [
        { field: "grip", after: context.grip },
        { field: "testedAt", after: context.testedAt },
        ...(context.hand ? [{ field: "hand" as const, after: context.hand }] : []),
        ...(context.notes ? [{ field: "notes" as const, after: context.notes }] : []),
        ...(tags.length > 0 ? [{ field: "tags" as const, after: tags }] : []),
        ...(context.referenceRole ? [{ field: "referenceRole" as const, after: context.referenceRole }] : []),
        ...(repeaterPeakReview?.excludedCandidateIds.length ? [{ field: "repeaterPeakExclusions" as const, after: repeaterPeakReview.excludedCandidateIds }] : []),
      ],
    }],
  };
}

export function updateTrackerSessionMetadata(
  session: TrackerSession,
  context: ImportContext,
  options: UpdateTrackerSessionMetadataOptions = {},
): TrackerSession {
  const metadataUpdate = options.metadataUpdate;
  const updatedAt = options.now ?? new Date().toISOString();
  const normalizedTags = normalizeTags(context.tags);
  const changes: TrackerSessionAuditChange[] = [];
  const beforeTags = normalizeTags(session.tags);
  const canUpdateRepeaterMetadata = session.mode === "repeater";
  const beforeReview = canUpdateRepeaterMetadata ? normalizeRepeaterPeakReview(session.repeaterPeakReview) : undefined;
  const afterReview = canUpdateRepeaterMetadata && metadataUpdate?.repeaterPeakReview ? normalizeRepeaterPeakReview(metadataUpdate.repeaterPeakReview) : undefined;

  if (session.grip !== context.grip) changes.push({ field: "grip", before: session.grip, after: context.grip });
  if (session.testedAt !== context.testedAt) changes.push({ field: "testedAt", before: session.testedAt, after: context.testedAt });
  if ((session.hand ?? "") !== (context.hand ?? "")) changes.push({ field: "hand", before: session.hand, after: context.hand });
  if ((session.notes ?? "") !== (context.notes ?? "")) changes.push({ field: "notes", before: session.notes, after: context.notes });
  if (!orderedStringArraysEqual(beforeTags, normalizedTags)) changes.push({ field: "tags", before: beforeTags, after: normalizedTags });
  if ((session.referenceRole ?? "") !== (context.referenceRole ?? "")) {
    changes.push({ field: "referenceRole", before: session.referenceRole, after: context.referenceRole });
  }
  if (afterReview && beforeReview && !orderedStringArraysEqual(beforeReview.excludedCandidateIds, afterReview.excludedCandidateIds)) {
    changes.push({
      field: "repeaterPeakExclusions",
      before: beforeReview.excludedCandidateIds,
      after: afterReview.excludedCandidateIds,
    });
  }

  if (changes.length === 0) return normalizeStoredTrackerSession(session);

  return {
    ...session,
    ...(canUpdateRepeaterMetadata && metadataUpdate?.metrics ? { metrics: metadataUpdate.metrics } : {}),
    ...(canUpdateRepeaterMetadata && metadataUpdate?.warnings ? { warnings: metadataUpdate.warnings } : {}),
    ...(afterReview ? { repeaterPeakReview: afterReview } : {}),
    grip: context.grip,
    testedAt: context.testedAt,
    hand: context.hand,
    notes: context.notes,
    tags: normalizedTags,
    referenceRole: context.referenceRole,
    updatedAt,
    auditLog: [
      ...normalizeAuditLog(session),
      {
        id: auditEntryId(session.id, updatedAt, "metadata_updated"),
        type: "metadata_updated",
        createdAt: updatedAt,
        changes,
      },
    ],
  };
}

export function normalizeStoredTrackerSession(session: TrackerSession): TrackerSession {
  const { repeaterPeakReview, ...storedSession } = session;
  return {
    ...storedSession,
    referenceRole: session.referenceRole === "healthy_hand_baseline" ? session.referenceRole : undefined,
    tags: normalizeTags(session.tags),
    ...(session.mode === "repeater" ? { repeaterPeakReview: normalizeRepeaterPeakReview(repeaterPeakReview) } : {}),
    updatedAt: session.updatedAt ?? session.createdAt,
    auditLog: normalizeAuditLog(session),
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

export function normalizeTags(tags: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags ?? []) {
    const next = tag.trim().replace(/\s+/g, " ").toLowerCase();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
}

function normalizeAuditLog(session: TrackerSession): readonly TrackerSessionAuditEntry[] {
  return session.auditLog ?? [];
}

export function normalizeRepeaterPeakReview(review: RepeaterPeakReview | undefined): RepeaterPeakReview {
  if (!review) return { candidates: [], excludedCandidateIds: [] };
  const candidateIds = new Set(review.candidates.map((candidate) => candidate.id));
  return {
    candidates: review.candidates,
    excludedCandidateIds: Array.from(new Set(review.excludedCandidateIds.filter((id) => candidateIds.size === 0 || candidateIds.has(id)))),
    warning: review.warning,
  };
}

export function orderedStringArraysEqual(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function auditEntryId(sessionId: string, createdAt: string, type: TrackerSessionAuditEntry["type"]) {
  return `${sessionId}-${type}-${createdAt}`;
}
