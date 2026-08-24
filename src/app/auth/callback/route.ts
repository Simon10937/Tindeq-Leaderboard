import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const trackerRoutes = new Set(["/progress", "/import", "/history"]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  const nextPath = resolveAuthRedirectPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(nextPath, url.origin));
}

export function resolveAuthRedirectPath(next: string | null) {
  if (!next) return "/progress";
  if (!next.startsWith("/") || next.startsWith("//")) return "/progress";
  const path = next.split(/[?#]/, 1)[0];
  return trackerRoutes.has(path) ? path : "/progress";
}
