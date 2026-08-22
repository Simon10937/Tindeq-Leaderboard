import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import type { TrackerSession } from "@/features/tracker/types";
import type { TrackerStore } from "./local-store";

type TrackerSessionRow = Readonly<{
  id: string;
  session: TrackerSession;
}>;

export type TrackerAuthState = Readonly<{
  status: "local" | "checking" | "signed-out" | "signed-in";
  user?: User;
}>;

export function createTrackerSupabaseClient() {
  if (process.env.NEXT_PUBLIC_LOCAL_DEMO === "true") return undefined;
  return createClient();
}

export async function readTrackerAuthState(client: SupabaseClient | undefined): Promise<TrackerAuthState> {
  if (!client) return { status: "local" };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { status: "signed-out" };
  return { status: "signed-in", user: data.user };
}

export function createSupabaseTrackerStore(client: SupabaseClient, userId: string): TrackerStore {
  return {
    async save(session) {
      const { error } = await client.from("tracker_sessions").upsert(trackerSessionToSupabaseRow(session, userId));
      if (error) throw new Error(error.message);
      return session;
    },
    async list() {
      const { data, error } = await client
        .from("tracker_sessions")
        .select("id, session")
        .order("tested_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as TrackerSessionRow[]).map((row) => row.session);
    },
    async get(id) {
      const { data, error } = await client
        .from("tracker_sessions")
        .select("id, session")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as TrackerSessionRow | null)?.session;
    },
    async delete(id) {
      const { error } = await client.from("tracker_sessions").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async clear() {
      const { error } = await client.from("tracker_sessions").delete().eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
  };
}

export function trackerSessionToSupabaseRow(session: TrackerSession, userId: string) {
  return {
    id: session.id,
    user_id: userId,
    session,
    mode: session.mode,
    grip: session.grip,
    tested_at: session.testedAt,
    updated_at: new Date().toISOString(),
  };
}
