import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Hand } from "@/features/leaderboards/types";

export type ModerationRow = { attempt_id: string; owner_display_name: string; protocol_name: string; hand: Hand; declared_test_at: string; ingestion_status: string; moderation_status: string; trust_status: string; primary_metric: number | null; relative_metric: number | null };

export async function listModerationRows(groupId: string): Promise<ModerationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_group_moderation", { target_group: groupId });
  return error ? [] : (data ?? []) as ModerationRow[];
}
