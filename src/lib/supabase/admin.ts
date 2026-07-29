import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/server-env";

export function createAdminClient() {
  const secret = getServerEnv().SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is required for privileged server operations.");
  return createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
