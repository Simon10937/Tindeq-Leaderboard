import Link from "next/link";
import { LeaderboardFilterForm } from "@/components/leaderboard-filter-form";

import { getLeaderboard, parseLeaderboardFilters } from "@/features/leaderboards/queries";

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
  const rows = await getLeaderboard({ groupId, protocolVersionId: protocolId, filters });
  const unit = filters.basis === "absolute" ? "N/s" : "%BW/s";

  return (
    <main className="app-main standalone">
      <header className="page-header">
        <p className="eyebrow">Comparable RFD</p>
        <h1>Leaderboard.</h1>
        <p>One best eligible session per member for this protocol version and hand.</p>
        <p><Link href={`/groups/${groupId}/protocols`}>← Protocols</Link> · <Link href={`/groups/${groupId}/protocols/${protocolId}/progress`}>Progress and curves</Link></p>
      </header>

      <section className="panel" aria-labelledby="leaderboard-filters">
        <h2 id="leaderboard-filters">Filters</h2>
        <LeaderboardFilterForm filters={filters} mode="leaderboard" />
        {filters.basis === "relative" && <p className="notice">Relative scores omit sessions without body weight. Comparing absolute and relative scores can reveal approximate body weight.</p>}
      </section>

      <section className="panel" aria-labelledby="rankings-title">
        <h2 id="rankings-title">Rankings</h2>
        {rows.length === 0 ? <p role="status">No eligible results match these filters.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <caption style={{ textAlign: "left", paddingBlock: 12 }}>All scores use the selected protocol version and {filters.hand} hand.</caption>
              <thead><tr><th scope="col">Rank</th><th scope="col">Climber</th><th scope="col">Score ({unit})</th><th scope="col">Captured</th><th scope="col">Trust</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.attemptId}><td>{row.rank}</td><th scope="row">{row.displayName}</th><td>{formatScore(row.selectedScore)}</td><td><time dateTime={row.authoritativeCapturedAt}>{formatDate(row.authoritativeCapturedAt)}</time></td><td>{row.trustStatus === "admin_verified" ? "Admin verified" : "Self-attested"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function formatScore(value: number) { return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)); }
