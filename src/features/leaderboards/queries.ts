import { createClient } from "@/lib/supabase/server";

import { selectLeaderboard, selectProgressEntries } from "./selection";
import type {
  DateWindow,
  Hand,
  LeaderboardEntry,
  LeaderboardFilters,
  ProgressEntry,
  RankedLeaderboardEntry,
  ScoreBasis,
  TraceCurve,
  TrustFilter,
} from "./types";

type RawLeaderboardEntry = {
  session_id: string;
  group_id: string;
  owner_id: string;
  display_name: string;
  protocol_version_id: string;
  protocol_name: string;
  assessment_type: string;
  hand: Hand;
  attempt_id: string;
  metric_run_id: string;
  absolute_score: number;
  relative_score: number | null;
  authoritative_captured_at: string;
  trust_status: "self_attested" | "admin_verified";
  published_at: string;
};

type RawTraceCurve = {
  group_id: string;
  protocol_version_id: string;
  hand: Hand;
  owner_id: string;
  session_id: string;
  attempt_id: string;
  elapsed_us: number[];
  force_n: number[];
  sample_count: number;
  duration_us: number;
};

export type LeaderboardQuery = Readonly<{
  groupId: string;
  protocolVersionId: string;
  filters: LeaderboardFilters;
}>;

export async function getLeaderboard(query: LeaderboardQuery): Promise<RankedLeaderboardEntry[]> {
  const entries = await listEntries(query);
  return selectLeaderboard(entries, query.filters);
}

export async function getProgress(query: LeaderboardQuery) {
  const progress = await getProgressEntries(query);
  const traces = await listTraces(query, progress.map((entry) => entry.attemptId));
  return { progress, traces };
}

export async function getProgressEntries(query: LeaderboardQuery): Promise<ProgressEntry[]> {
  const entries = await listEntries(query);
  return selectProgressEntries(entries, query.filters);
}

export async function getRecentActivity(query: LeaderboardQuery, limit = 8): Promise<ProgressEntry[]> {
  const entries = await listEntries(query, { ascending: false, limit });
  return selectProgressEntries(entries, query.filters)
    .sort((left, right) => Date.parse(right.authoritativeCapturedAt) - Date.parse(left.authoritativeCapturedAt))
    .slice(0, limit);
}

export function parseLeaderboardFilters(search: Record<string, string | string[] | undefined>): LeaderboardFilters {
  const basis: ScoreBasis = search.basis === "relative" ? "relative" : "absolute";
  const hand: Hand = search.hand === "left" ? "left" : "right";
  const trust: TrustFilter = search.trust === "admin_verified" || search.trust === "self_attested"
    ? search.trust
    : "all";
  return { basis, hand, trust, window: parseWindow(search) };
}

async function listEntries(
  query: LeaderboardQuery,
  options: { ascending?: boolean; limit?: number } = {},
): Promise<LeaderboardEntry[]> {
  const supabase = await createClient();
  let request = supabase
    .rpc("list_leaderboard_entries", {
      target_group: query.groupId,
      target_protocol_version: query.protocolVersionId,
      target_hand: query.filters.hand ?? "right",
    });

  if (query.filters.trust && query.filters.trust !== "all") {
    request = request.eq("trust_status", query.filters.trust);
  }
  const bounds = dateBounds(query.filters.window, query.filters.now ?? new Date());
  if (bounds.from) request = request.gte("authoritative_captured_at", bounds.from);
  if (bounds.to) request = request.lte("authoritative_captured_at", bounds.to);

  if (options.limit !== undefined) {
    request = request
      .not(query.filters.basis === "absolute" ? "absolute_score" : "relative_score", "is", null)
      .limit(options.limit);
  }
  const { data, error } = await request.order("authoritative_captured_at", { ascending: options.ascending ?? true });
  if (error) throw new Error("Unable to load leaderboard entries");
  return ((data ?? []) as RawLeaderboardEntry[]).map(mapEntry);
}

async function listTraces(query: LeaderboardQuery, attemptIds: readonly string[]): Promise<TraceCurve[]> {
  if (attemptIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_trace_curves")
    .select("group_id,protocol_version_id,hand,owner_id,session_id,attempt_id,elapsed_us,force_n,sample_count,duration_us")
    .eq("group_id", query.groupId)
    .eq("protocol_version_id", query.protocolVersionId)
    .eq("hand", query.filters.hand ?? "right")
    .in("attempt_id", [...new Set(attemptIds)]);
  if (error) throw new Error("Unable to load group trace curves");
  return ((data ?? []) as RawTraceCurve[]).map(mapTrace);
}

function mapEntry(row: RawLeaderboardEntry): LeaderboardEntry {
  if (!Number.isFinite(row.absolute_score) || (row.relative_score !== null && !Number.isFinite(row.relative_score))) {
    throw new Error("Leaderboard returned a non-finite score");
  }
  return {
    sessionId: row.session_id,
    groupId: row.group_id,
    ownerId: row.owner_id,
    displayName: row.display_name,
    protocolVersionId: row.protocol_version_id,
    protocolName: row.protocol_name,
    assessmentType: row.assessment_type,
    hand: row.hand,
    attemptId: row.attempt_id,
    metricRunId: row.metric_run_id,
    absoluteScore: row.absolute_score,
    relativeScore: row.relative_score,
    authoritativeCapturedAt: row.authoritative_captured_at,
    trustStatus: row.trust_status,
    publishedAt: row.published_at,
  };
}

function mapTrace(row: RawTraceCurve): TraceCurve {
  if (
    row.elapsed_us.length !== row.force_n.length ||
    row.elapsed_us.length !== row.sample_count ||
    row.elapsed_us.some((value) => !Number.isFinite(value)) ||
    row.force_n.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("Trace view returned invalid curve data");
  }
  return {
    groupId: row.group_id,
    protocolVersionId: row.protocol_version_id,
    hand: row.hand,
    ownerId: row.owner_id,
    sessionId: row.session_id,
    attemptId: row.attempt_id,
    elapsedUs: row.elapsed_us,
    forceN: row.force_n,
    sampleCount: row.sample_count,
    durationUs: row.duration_us,
  };
}

function parseWindow(search: Record<string, string | string[] | undefined>): DateWindow {
  if (search.window === "latest") return { kind: "latest" };
  if (search.window === "30") return { kind: "days", days: 30 };
  if (search.window === "90") return { kind: "days", days: 90 };
  if (search.window === "custom" && typeof search.from === "string" && typeof search.to === "string") {
    return { kind: "custom", from: search.from, to: search.to };
  }
  return { kind: "all_time" };
}

function dateBounds(window: DateWindow, now: Date): { from?: string; to?: string } {
  if (window.kind === "days") {
    return {
      from: new Date(now.getTime() - window.days * 86_400_000).toISOString(),
      to: now.toISOString(),
    };
  }
  if (window.kind === "custom") {
    if (window.from > window.to) return { from: "9999-12-31T00:00:00.000Z", to: "0001-01-01T00:00:00.000Z" };
    return { from: `${window.from}T00:00:00.000Z`, to: `${window.to}T23:59:59.999Z` };
  }
  return {};
}
