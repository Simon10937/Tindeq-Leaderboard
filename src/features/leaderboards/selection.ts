import type {
  LeaderboardEntry,
  LeaderboardFilters,
  ProgressEntry,
  RankedLeaderboardEntry,
} from "./types";

export function selectLeaderboard(
  rows: readonly LeaderboardEntry[],
  filters: LeaderboardFilters,
): RankedLeaderboardEntry[] {
  const eligible = filterEligible(rows, filters);
  const perMember = filters.window.kind === "latest"
    ? latestPerMember(eligible)
    : bestPerMember(eligible, filters.basis);

  const ranked = perMember
    .map((row) => ({ ...row, basis: filters.basis, selectedScore: scoreFor(row, filters.basis)! }))
    .sort(compareRanked);

  let previousScore: number | undefined;
  let previousRank = 0;
  return ranked.map((row, index) => {
    const rank = previousScore !== undefined && row.selectedScore === previousScore
      ? previousRank
      : index + 1;
    previousScore = row.selectedScore;
    previousRank = rank;
    return { ...row, rank };
  });
}

export function selectProgressEntries(
  rows: readonly LeaderboardEntry[],
  filters: LeaderboardFilters,
): ProgressEntry[] {
  const eligible = filterEligible(rows, filters);
  const selected = filters.window.kind === "latest" ? latestPerMember(eligible) : eligible;
  return selected
    .map((row) => ({ ...row, basis: filters.basis, selectedScore: scoreFor(row, filters.basis)! }))
    .sort((left, right) =>
      timestamp(left.authoritativeCapturedAt) - timestamp(right.authoritativeCapturedAt) ||
      left.ownerId.localeCompare(right.ownerId) ||
      left.attemptId.localeCompare(right.attemptId),
    );
}

function filterEligible(
  rows: readonly LeaderboardEntry[],
  filters: LeaderboardFilters,
): LeaderboardEntry[] {
  const now = filters.now ?? new Date();
  return rows.filter((row) => {
    if (filters.protocolVersionId && row.protocolVersionId !== filters.protocolVersionId) return false;
    if (filters.hand && row.hand !== filters.hand) return false;
    if (filters.trust && filters.trust !== "all" && row.trustStatus !== filters.trust) return false;
    if (scoreFor(row, filters.basis) === null) return false;
    return withinWindow(row.authoritativeCapturedAt, filters.window, now);
  });
}

function withinWindow(capturedAt: string, window: LeaderboardFilters["window"], now: Date): boolean {
  const captured = timestamp(capturedAt);
  if (window.kind === "all_time" || window.kind === "latest") return true;
  if (window.kind === "days") {
    return captured >= now.getTime() - window.days * 24 * 60 * 60 * 1_000 && captured <= now.getTime();
  }
  const from = timestamp(`${window.from}T00:00:00.000Z`);
  const to = timestamp(`${window.to}T23:59:59.999Z`);
  if (from > to) return false;
  return captured >= from && captured <= to;
}

function bestPerMember(rows: readonly LeaderboardEntry[], basis: LeaderboardFilters["basis"]): LeaderboardEntry[] {
  const selected = new Map<string, LeaderboardEntry>();
  for (const row of rows) {
    const current = selected.get(row.ownerId);
    if (!current || compareCandidate(row, current, basis) < 0) selected.set(row.ownerId, row);
  }
  return [...selected.values()];
}

function latestPerMember(rows: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  const selected = new Map<string, LeaderboardEntry>();
  for (const row of rows) {
    const current = selected.get(row.ownerId);
    if (
      !current ||
      timestamp(row.authoritativeCapturedAt) > timestamp(current.authoritativeCapturedAt) ||
      (timestamp(row.authoritativeCapturedAt) === timestamp(current.authoritativeCapturedAt) && row.attemptId < current.attemptId)
    ) {
      selected.set(row.ownerId, row);
    }
  }
  return [...selected.values()];
}

function compareCandidate(left: LeaderboardEntry, right: LeaderboardEntry, basis: LeaderboardFilters["basis"]): number {
  return (
    scoreFor(right, basis)! - scoreFor(left, basis)! ||
    timestamp(left.authoritativeCapturedAt) - timestamp(right.authoritativeCapturedAt) ||
    left.attemptId.localeCompare(right.attemptId)
  );
}

function compareRanked(left: ProgressEntry, right: ProgressEntry): number {
  return (
    right.selectedScore - left.selectedScore ||
    timestamp(left.authoritativeCapturedAt) - timestamp(right.authoritativeCapturedAt) ||
    left.attemptId.localeCompare(right.attemptId)
  );
}

function scoreFor(row: LeaderboardEntry, basis: LeaderboardFilters["basis"]): number | null {
  return basis === "absolute" ? row.absoluteScore : row.relativeScore;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid capture timestamp: ${value}`);
  return parsed;
}
