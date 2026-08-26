import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  SUPABASE_SECRET_KEY: z.string().min(16).optional(),
});

export function getServerEnv() {
  return schema.parse(process.env);
}
