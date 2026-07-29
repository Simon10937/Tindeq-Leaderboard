import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toOne } from "@/lib/supabase/relations";
import type { GripType } from "./types";

export type DashboardProtocol = {
  id: string;
  name: string;
  version: number;
  gripType: GripType;
  edgeDepthMm: number;
};

export async function getProtocolVersionName(groupId: string, protocolVersionId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol_versions")
    .select("protocol_families(name)")
    .eq("id", protocolVersionId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) throw new Error("Unable to load protocol details");
  const family = toOne(data?.protocol_families);
  return family?.name ?? "Protocol leaderboard";
}

export async function listLeaderboardProtocols(groupId: string): Promise<DashboardProtocol[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol_versions")
    .select("id,version,grip_type,edge_depth_mm,protocol_families!inner(name)")
    .eq("group_id", groupId)
    .in("state", ["published", "locked"])
    .order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load leaderboard protocols");
  return (data ?? []).map((protocol) => {
    const family = toOne(protocol.protocol_families)!;
    return {
      id: protocol.id,
      name: family.name,
      version: protocol.version,
      gripType: protocol.grip_type as GripType,
      edgeDepthMm: protocol.edge_depth_mm,
    };
  });
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
