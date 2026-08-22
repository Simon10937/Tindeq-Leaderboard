import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_LOCAL_DEMO: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(16).optional(),
});

export type PublicEnv = {
  NEXT_PUBLIC_LOCAL_DEMO?: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
};

function readBundledPublicEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_LOCAL_DEMO: process.env.NEXT_PUBLIC_LOCAL_DEMO,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getPublicEnv(source: Record<string, string | undefined> = readBundledPublicEnv()): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success || (!result.data.NEXT_PUBLIC_LOCAL_DEMO && (!result.data.NEXT_PUBLIC_SUPABASE_URL || !result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY))) {
    throw new Error(
      `Invalid public Supabase configuration: ${result.success ? "NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  return {
    ...(result.data.NEXT_PUBLIC_LOCAL_DEMO ? { NEXT_PUBLIC_LOCAL_DEMO: result.data.NEXT_PUBLIC_LOCAL_DEMO } : {}),
    NEXT_PUBLIC_SUPABASE_URL: result.data.NEXT_PUBLIC_SUPABASE_URL ?? "https://local-demo.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_local_demo_key",
  };
}
