import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
