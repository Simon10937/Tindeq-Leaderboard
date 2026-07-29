import { formatDate, formatScore, trustLabel } from "@/components/charts/chart-utils";
import type { RankedLeaderboardEntry } from "@/features/leaderboards/types";

export function LeaderboardTable({
  rows,
  unit,
  caption,
  emptyMessage,
  showTrust = true,
}: {
  rows: readonly RankedLeaderboardEntry[];
  unit: string;
  caption?: string;
  emptyMessage: string;
  showTrust?: boolean;
}) {
  if (rows.length === 0) return <p role="status">{emptyMessage}</p>;

  return (
    <div className="table-scroll">
      <table className="leaderboard-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Climber</th>
            <th scope="col">Score ({unit})</th>
            <th scope="col">Captured</th>
            {showTrust && <th scope="col">Trust</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.attemptId}>
              <td><span className="rank-badge">{row.rank}</span></td>
              <th scope="row">{row.displayName}</th>
              <td className="score-cell">{formatScore(row.selectedScore)}</td>
              <td><time dateTime={row.authoritativeCapturedAt}>{formatDate(row.authoritativeCapturedAt)}</time></td>
              {showTrust && <td>{trustLabel(row.trustStatus)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
