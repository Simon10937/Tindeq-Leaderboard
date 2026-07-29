export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DashboardActivity, DashboardLeaderboard, DashboardProgress } from "@/features/dashboard/components/dashboard-panels";
import { saveDashboardHome } from "@/features/dashboard/actions";
import { dashboardViews, resolveDashboardGroup, resolveDashboardSelection, type DashboardView } from "@/features/dashboard/preferences";
import { listGroups } from "@/features/groups/queries";
import { getLeaderboard, getProgressEntries, getRecentActivity } from "@/features/leaderboards/queries";
import type { LeaderboardFilters } from "@/features/leaderboards/types";
import { listLeaderboardProtocols } from "@/features/protocols/queries";

type Search = Record<string, string | string[] | undefined>;

const viewLabels: Record<DashboardView, string> = {
  leaderboard: "Leaderboard",
  progress: "Progress chart",
  activity: "Latest activity",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ profile, groups, preference }, search] = await Promise.all([listGroups(), searchParams]);
  if (groups.length === 0) redirect("/groups");

  const requestedGroupId = scalar(search.group);
  const groupIds = groups.map((group) => group.group_id);
  const groupId = resolveDashboardGroup(groupIds, requestedGroupId, preference?.group_id);
  if (!groupId) redirect("/groups");
  const protocols = await listLeaderboardProtocols(groupId);
  const selection = resolveDashboardSelection({
    groupId,
    protocolIds: protocols.map((protocol) => protocol.id),
    requestedProtocolId: scalar(search.protocol),
    requestedView: scalar(search.view),
    requestedHand: scalar(search.hand),
    requestedBasis: scalar(search.basis),
    preferredGroupId: preference?.group_id,
    preferredProtocolId: preference?.protocol_version_id,
    preferredView: preference?.view,
    preferredHand: preference?.hand,
    preferredBasis: preference?.score_basis,
  });
  const selectedGroup = groups.find((group) => group.group_id === groupId)!;
  const selectedProtocol = protocols.find((protocol) => protocol.id === selection.protocolId);
  const filters: LeaderboardFilters = {
    basis: selection.basis,
    hand: selection.hand,
    trust: "all",
    window: { kind: "all_time" },
  };
  const content = selectedProtocol
    ? await loadDashboardContent(selection.view, groupId, selectedProtocol.id, filters)
    : null;

  return (
    <AppShell profileName={profile.display_name} groups={groups} activeGroupId={groupId}>
      <header className="page-header dashboard-header">
        <p className="eyebrow">Your training home</p>
        <h1>{selectedGroup.groups?.name ?? "Dashboard"}.</h1>
        <p>Switch group, protocol, or chart here. Your saved home opens first on every visit.</p>
      </header>

      {scalar(search.message) && <p className="notice" role="status">{scalar(search.message)}</p>}

      <section className="dashboard-switcher" aria-label="Dashboard selection">
        <form method="get">
          <label>Group
            <select name="group" defaultValue={groupId}>
              {groups.map((group) => group.groups && <option key={group.group_id} value={group.group_id}>{group.groups.name}</option>)}
            </select>
          </label>
          <input type="hidden" name="view" value={selection.view} />
          <input type="hidden" name="hand" value={selection.hand} />
          <input type="hidden" name="basis" value={selection.basis} />
          <button className="button button-quiet">Open group</button>
        </form>

        {protocols.length > 0 && (
          <form method="get">
            <input type="hidden" name="group" value={groupId} />
            <input type="hidden" name="view" value={selection.view} />
            <label>Protocol
              <select name="protocol" defaultValue={selection.protocolId ?? undefined}>
                {protocols.map((protocol) => (
                  <option key={protocol.id} value={protocol.id}>
                    {protocol.name} · v{protocol.version} · {protocol.edgeDepthMm} mm
                  </option>
                ))}
              </select>
            </label>
            <label>Hand
              <select name="hand" defaultValue={selection.hand}>
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
            <label>Score
              <select name="basis" defaultValue={selection.basis}>
                <option value="absolute">Absolute</option>
                <option value="relative">Relative to body weight</option>
              </select>
            </label>
            <button className="button button-quiet">Show protocol</button>
          </form>
        )}
      </section>

      {selectedProtocol ? (
        <>
          <div className="dashboard-context">
            <div>
              <p className="eyebrow">Showing now</p>
              <strong>{selectedProtocol.name}</strong>
              <span>v{selectedProtocol.version} · {selectedProtocol.gripType.replaceAll("_", " ")} · {selectedProtocol.edgeDepthMm} mm · {selection.hand} hand · {selection.basis}</span>
            </div>
            <form action={saveDashboardHome}>
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="protocolId" value={selectedProtocol.id} />
              <input type="hidden" name="view" value={selection.view} />
              <input type="hidden" name="hand" value={selection.hand} />
              <input type="hidden" name="basis" value={selection.basis} />
              <button className="text-button">Make this my home</button>
            </form>
          </div>

          <nav className="dashboard-tabs" aria-label="Comparison views">
            {dashboardViews.map((view) => (
              <Link
                className={selection.view === view ? "active" : ""}
                href={dashboardHref(groupId, selectedProtocol.id, view, selection.hand, selection.basis)}
                key={view}
                aria-current={selection.view === view ? "page" : undefined}
              >
                {viewLabels[view]}
              </Link>
            ))}
          </nav>

          {content?.kind === "leaderboard" && <DashboardLeaderboard rows={content.rows} groupId={groupId} protocolId={selectedProtocol.id} hand={selection.hand} basis={selection.basis} />}
          {content?.kind === "progress" && <DashboardProgress entries={content.entries} groupId={groupId} protocolId={selectedProtocol.id} hand={selection.hand} basis={selection.basis} />}
          {content?.kind === "activity" && <DashboardActivity entries={content.entries} groupId={groupId} protocolId={selectedProtocol.id} hand={selection.hand} basis={selection.basis} />}
        </>
      ) : (
        <section className="panel dashboard-empty">
          <p className="eyebrow">No comparable protocols yet</p>
          <h2>Create or publish a protocol to start this group&apos;s dashboard.</h2>
          <Link className="button" href={`/groups/${groupId}/protocols`}>Open protocols</Link>
        </section>
      )}
    </AppShell>
  );
}

async function loadDashboardContent(
  view: DashboardView,
  groupId: string,
  protocolId: string,
  filters: LeaderboardFilters,
) {
  const query = { groupId, protocolVersionId: protocolId, filters };
  if (view === "leaderboard") return { kind: view, rows: await getLeaderboard(query) } as const;
  if (view === "activity") return { kind: view, entries: await getRecentActivity(query) } as const;
  return { kind: view, entries: await getProgressEntries(query) } as const;
}

function dashboardHref(groupId: string, protocolId: string, view: DashboardView, hand: string, basis: string) {
  return `/dashboard?group=${groupId}&protocol=${protocolId}&view=${view}&hand=${hand}&basis=${basis}`;
}

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
