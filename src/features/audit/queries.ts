import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AuditEvent = { id: number; group_id: string; actor_reference: string | null; event_type: string; target_type: string; target_id: string | null; occurred_at: string };

export async function listGroupAuditEvents(groupId: string): Promise<AuditEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("group_audit_events").select("id,group_id,actor_reference,event_type,target_type,target_id,occurred_at").eq("group_id", groupId).order("occurred_at", { ascending: false }).limit(100);
  return error ? [] : (data ?? []) as AuditEvent[];
}
