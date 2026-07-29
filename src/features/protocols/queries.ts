import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PrimaryLeaderboardVersion = { id: string; group_id: string };

export async function getPrimaryLeaderboardVersion(groupIds: string[]): Promise<PrimaryLeaderboardVersion | null> {
  if (groupIds.length === 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol_versions")
    .select("id,group_id")
    .in("group_id", groupIds)
    .in("state", ["published", "locked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Unable to find the primary leaderboard");
  return data;
}

export async function getProtocolVersionName(groupId: string, protocolVersionId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol_versions")
    .select("protocol_families(name)")
    .eq("id", protocolVersionId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) throw new Error("Unable to load protocol details");
  const family = Array.isArray(data?.protocol_families) ? data.protocol_families[0] : data?.protocol_families;
  return family?.name ?? "Protocol leaderboard";
}

export async function listProtocols(groupId: string) {
  const supabase = await createClient();
  const { data: membership } = await supabase.from("group_memberships").select("role").eq("group_id", groupId).eq("status", "active").maybeSingle();
  if (!membership) redirect("/groups");
  const [{ data: families }, { data: capability }] = await Promise.all([
    supabase.from("protocol_families")
      .select("id,name,assessment_type,protocol_versions(id,version,state,grip_type,edge_depth_mm,settings,created_at)")
      .eq("group_id", groupId).order("created_at", { ascending: false }),
    supabase.from("assessment_capabilities").select("enabled").eq("assessment_type", "rfd").maybeSingle(),
  ]);
  return { role: membership.role, families: families ?? [], rfdEnabled: capability?.enabled === true };
}
