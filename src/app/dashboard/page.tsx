export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { listGroups } from "@/features/groups/queries";
import { getPrimaryLeaderboardVersion } from "@/features/protocols/queries";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const [{ groups }, search] = await Promise.all([listGroups(), searchParams]);
  if (groups.length === 0) redirect("/groups");

  const preferred = groups.find((group) => group.group_id === search.group);
  const candidateGroups = preferred ? [preferred] : groups;
  const version = await getPrimaryLeaderboardVersion(candidateGroups.map((group) => group.group_id));

  if (version) redirect(`/groups/${version.group_id}/protocols/${version.id}/leaderboard`);
  redirect(`/groups/${candidateGroups[0].group_id}/protocols`);
}
