import Link from "next/link";

import { ForceCurveChart } from "@/components/charts/force-curve-chart";
import { ProgressChart } from "@/components/charts/progress-chart";
import { LeaderboardFilterForm } from "@/components/leaderboard-filter-form";
import { getProgress, parseLeaderboardFilters } from "@/features/leaderboards/queries";

type Search = Record<string, string | string[] | undefined>;

export default async function ProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string; protocolId: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ groupId, protocolId }, search] = await Promise.all([params, searchParams]);
  const filters = parseLeaderboardFilters(search);
  const { progress, traces } = await getProgress({ groupId, protocolVersionId: protocolId, filters });

  return (
    <main className="app-main standalone">
      <header className="page-header">
        <p className="eyebrow">Comparable RFD</p>
        <h1>Progress.</h1>
        <p>Chronological results and normalized force curves for one immutable protocol version.</p>
        <p><Link href={`/groups/${groupId}/protocols/${protocolId}/leaderboard`}>← Leaderboard</Link></p>
      </header>

      <section className="panel" aria-labelledby="progress-filters">
        <h2 id="progress-filters">Filters</h2>
        <LeaderboardFilterForm filters={filters} mode="progress" />
        {filters.basis === "relative" && <p className="notice">Relative scores omit sessions without body weight. Comparing absolute and relative scores can reveal approximate body weight.</p>}
      </section>

      <section className="panel" aria-labelledby="progress-section-title">
        <h2 id="progress-section-title">Performance history</h2>
        <ProgressChart entries={progress} />
      </section>
      <section className="panel" aria-labelledby="curve-section-title">
        <h2 id="curve-section-title">Attempt curves</h2>
        <ForceCurveChart curves={traces} entries={progress} />
      </section>
    </main>
  );
}
