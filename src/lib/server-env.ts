import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(3).default("Cruxboard <onboarding@resend.dev>"),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(32).optional(),
});

export function getServerEnv() {
  return schema.parse(process.env);
}
