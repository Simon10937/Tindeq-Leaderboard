import Link from "next/link";
import { LeaderboardFilterForm } from "@/components/leaderboard-filter-form";
import { getLeaderboard, parseLeaderboardFilters } from "@/features/leaderboards/queries";
import { getProtocolVersionName } from "@/features/protocols/queries";

type Search = Record<string, string | string[] | undefined>;

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string; protocolId: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ groupId, protocolId }, search] = await Promise.all([params, searchParams]);
  const filters = parseLeaderboardFilters(search);
  const [rows, protocolName] = await Promise.all([
    getLeaderboard({ groupId, protocolVersionId: protocolId, filters }),
    getProtocolVersionName(groupId, protocolId),
  ]);
  const unit = filters.basis === "absolute" ? "N/s" : "%BW/s";

  return (
    <main className="app-main standalone leaderboard-page">
      <nav className="leaderboard-nav" aria-label="Leaderboard navigation">
        <Link className="brand" href="/dashboard">Cruxboard</Link>
        <div>
          <Link href={`/groups/${groupId}`}>Group</Link>
          <Link href={`/groups/${groupId}/protocols`}>Protocols</Link>
          <Link href={`/groups/${groupId}/protocols/${protocolId}/progress`}>Progress</Link>
        </div>
      </nav>

      <header className="page-header leaderboard-header">
        <p className="eyebrow">{protocolName} · {filters.hand} hand</p>
        <h1>Leaderboard.</h1>
        <p>Every climber&apos;s best comparable result, ranked immediately.</p>
      </header>

      <section className="leaderboard-rankings" aria-labelledby="rankings-title">
        <div className="rankings-heading">
          <div><p className="eyebrow">Current standings</p><h2 id="rankings-title">{filters.window.kind === "latest" ? "Latest results" : "Best results"}</h2></div>
          <span>{rows.length} climbers · {unit}</span>
        </div>
        {rows.length === 0 ? <p role="status">No eligible results match these filters.</p> : (
          <div className="table-scroll">
            <table className="leaderboard-table">
              <caption>All scores use this protocol version and the {filters.hand} hand.</caption>
              <thead><tr><th scope="col">Rank</th><th scope="col">Climber</th><th scope="col">Score ({unit})</th><th scope="col">Captured</th><th scope="col">Trust</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.attemptId}><td><span className="rank-badge">{row.rank}</span></td><th scope="row">{row.displayName}</th><td className="score-cell">{formatScore(row.selectedScore)}</td><td><time dateTime={row.authoritativeCapturedAt}>{formatDate(row.authoritativeCapturedAt)}</time></td><td>{row.trustStatus === "admin_verified" ? "Admin verified" : "Self-attested"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <details className="leaderboard-filters">
        <summary>Filter leaderboard</summary>
        <div className="filter-content">
          <LeaderboardFilterForm filters={filters} mode="leaderboard" />
          {filters.basis === "relative" && <p className="notice">Relative scores omit sessions without body weight. Comparing absolute and relative scores can reveal approximate body weight.</p>}
        </div>
      </details>
    </main>
  );
}

function formatScore(value: number) { return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)); }
