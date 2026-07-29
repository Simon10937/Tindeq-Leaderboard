import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type GroupRole = "owner" | "admin" | "member";
export type MembershipStatus = "active" | "left" | "removed";
export type GroupSummary = { group_id: string; role: GroupRole; groups: { id: string; name: string } | null };
export type GroupMember = { user_id: string; role: GroupRole; status: MembershipStatus; profiles: { display_name: string } | null };

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function requireAccount() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("id,display_name,status").eq("id", claims.claims.sub).maybeSingle();
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    redirect("/sign-in?message=This account is not available.");
  }
  return { supabase, profile };
}

export async function listGroups() {
  const { supabase, profile } = await requireAccount();
  const { data } = await supabase
    .from("group_memberships")
    .select("role,group_id,groups(id,name)")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .order("joined_at");
  const groups: GroupSummary[] = (data ?? []).map((row) => ({ ...row, role: row.role as GroupRole, groups: one(row.groups) }));
  return { profile, groups };
}

export async function getGroup(groupId: string) {
  const { supabase, profile } = await requireAccount();
  const { data: membership } = await supabase
    .from("group_memberships")
    .select("role,groups(id,name),group_id")
    .eq("group_id", groupId)
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/groups");
  const { data: members } = await supabase
    .from("group_memberships")
    .select("user_id,role,status,profiles(display_name)")
    .eq("group_id", groupId)
    .eq("status", "active")
    .order("joined_at");
  const normalizedMembership = { ...membership, groups: one(membership.groups) };
  const normalizedMembers: GroupMember[] = (members ?? []).map((member) => ({
    ...member,
    role: member.role as GroupRole,
    status: member.status as MembershipStatus,
    profiles: one(member.profiles),
  }));
  return { profile, membership: normalizedMembership, members: normalizedMembers };
}
