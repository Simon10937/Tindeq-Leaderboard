"use server";

import { redirect } from "next/navigation";

import { requireAccount } from "@/features/groups/queries";
import type { Hand, ScoreBasis } from "@/features/leaderboards/types";
import { isDashboardView } from "./preferences";

export async function saveDashboardHome(formData: FormData) {
  const groupId = String(formData.get("groupId") ?? "");
  const protocolId = String(formData.get("protocolId") ?? "");
  const requestedView = String(formData.get("view") ?? "");
  const view = isDashboardView(requestedView) ? requestedView : "leaderboard";
  const hand: Hand = formData.get("hand") === "left" ? "left" : "right";
  const scoreBasis: ScoreBasis = formData.get("basis") === "relative" ? "relative" : "absolute";
  const { supabase, profile } = await requireAccount();

  const membershipRequest = supabase
    .from("group_memberships")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  const protocolRequest = supabase
    .from("protocol_versions")
    .select("id")
    .eq("id", protocolId)
    .eq("group_id", groupId)
    .in("state", ["published", "locked"])
    .maybeSingle();
  const [membershipResult, protocolResult] = await Promise.all([membershipRequest, protocolRequest]);
  if (membershipResult.error || protocolResult.error) {
    redirect("/dashboard?message=Unable+to+save+your+home.");
  }
  const membership = membershipResult.data;
  const protocol = protocolResult.data;
  if (!membership) redirect("/dashboard?message=Choose+a+group+you+belong+to.");

  if (!protocol) redirect(`/dashboard?group=${groupId}&message=Choose+an+available+protocol.`);

  const { error } = await supabase
    .from("dashboard_preferences")
    .upsert({ user_id: profile.id, group_id: groupId, protocol_version_id: protocolId, view, hand, score_basis: scoreBasis });
  if (error) redirect(`/dashboard?group=${groupId}&protocol=${protocolId}&view=${view}&hand=${hand}&basis=${scoreBasis}&message=Unable+to+save+your+home.`);

  redirect(`/dashboard?group=${groupId}&protocol=${protocolId}&view=${view}&hand=${hand}&basis=${scoreBasis}&message=Home+view+saved.`);
}
