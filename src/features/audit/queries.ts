import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AuditEvent = { id: number; group_id: string; actor_reference: string | null; event_type: string; target_type: string; target_id: string | null; occurred_at: string };

export async function listGroupAuditEvents(groupId: string): Promise<AuditEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_group_audit_events", { target_group: groupId });
  return error ? [] : (data ?? []) as AuditEvent[];
}
