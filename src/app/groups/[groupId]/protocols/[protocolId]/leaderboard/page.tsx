import Link from "next/link";
import { LeaderboardFilterForm } from "@/components/leaderboard-filter-form";
import { LeaderboardTable } from "@/components/leaderboard-table";
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
          <Link href={`/dashboard?group=${groupId}&protocol=${protocolId}&hand=${filters.hand}&basis=${filters.basis}`}>Dashboard</Link>
          <Link href={`/groups/${groupId}`}>Group</Link>
          <Link href={`/groups/${groupId}/protocols`}>Protocols</Link>
          <Link href={`/groups/${groupId}/protocols/${protocolId}/progress?hand=${filters.hand}&basis=${filters.basis}`}>Progress</Link>
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
        <LeaderboardTable
          rows={rows}
          unit={unit}
          caption={`All scores use this protocol version and the ${filters.hand} hand.`}
          emptyMessage="No eligible results match these filters."
        />
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
