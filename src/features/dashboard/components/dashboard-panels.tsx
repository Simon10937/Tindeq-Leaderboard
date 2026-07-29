import Link from "next/link";

import { ProgressChart } from "@/components/charts/progress-chart";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { formatDate, formatScore, trustLabel } from "@/components/charts/chart-utils";
import type { Hand, ProgressEntry, RankedLeaderboardEntry, ScoreBasis } from "@/features/leaderboards/types";

type Destination = { groupId: string; protocolId: string; hand: Hand; basis: ScoreBasis };

export function DashboardLeaderboard({
  rows,
  groupId,
  protocolId,
  hand,
  basis,
}: Destination & { rows: readonly RankedLeaderboardEntry[] }) {
  const unit = scoreUnit(basis);
  return (
    <section className="leaderboard-rankings dashboard-feature" aria-labelledby="dashboard-rankings">
      <div className="rankings-heading">
        <div><p className="eyebrow">Immediate comparison</p><h2 id="dashboard-rankings">Best results</h2></div>
        <Link href={comparisonHref(groupId, protocolId, "leaderboard", hand, basis)}>Full leaderboard →</Link>
      </div>
      <LeaderboardTable rows={rows} unit={unit} emptyMessage={`No eligible ${hand}-hand results yet.`} showTrust={false} />
    </section>
  );
}

export function DashboardProgress({
  entries,
  groupId,
  protocolId,
  hand,
  basis,
}: Destination & { entries: readonly ProgressEntry[] }) {
  return (
    <section className="panel dashboard-feature" aria-labelledby="dashboard-progress">
      <div className="dashboard-panel-heading">
        <div><p className="eyebrow">Group trajectory</p><h2 id="dashboard-progress">Progress over time</h2></div>
        <Link href={comparisonHref(groupId, protocolId, "progress", hand, basis)}>Full charts →</Link>
      </div>
      <ProgressChart entries={entries} />
    </section>
  );
}

export function DashboardActivity({
  entries,
  groupId,
  protocolId,
  hand,
  basis,
}: Destination & { entries: readonly ProgressEntry[] }) {
  const unit = scoreUnit(basis);
  return (
    <section className="panel dashboard-feature" aria-labelledby="dashboard-activity">
      <div className="dashboard-panel-heading">
        <div><p className="eyebrow">Most recent first</p><h2 id="dashboard-activity">Latest activity</h2></div>
        <Link href={`${comparisonHref(groupId, protocolId, "progress", hand, basis)}&window=latest`}>Latest comparison →</Link>
      </div>
      {entries.length === 0 ? <p role="status">No recent activity for this protocol yet.</p> : (
        <ol className="activity-list">
          {entries.map((entry) => (
            <li key={entry.attemptId}>
              <div><strong>{entry.displayName}</strong><span>{trustLabel(entry.trustStatus)} · {entry.hand} hand</span></div>
              <strong>{formatScore(entry.selectedScore)} <small>{unit}</small></strong>
              <time dateTime={entry.authoritativeCapturedAt}>{formatDate(entry.authoritativeCapturedAt)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function comparisonHref(groupId: string, protocolId: string, page: "leaderboard" | "progress", hand: Hand, basis: ScoreBasis) {
  return `/groups/${groupId}/protocols/${protocolId}/${page}?hand=${hand}&basis=${basis}`;
}

function scoreUnit(basis: ScoreBasis) {
  return basis === "absolute" ? "N/s" : "%BW/s";
}
