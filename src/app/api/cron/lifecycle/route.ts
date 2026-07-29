import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/server-env";
import { runLifecycleBatch } from "@/features/lifecycle/worker";

function authorized(request: NextRequest) {
  const secret = getServerEnv().CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runLifecycleBatch({ limit: 5 }), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { jobId?: string };
  if (!body.jobId || !/^[0-9a-f-]{36}$/i.test(body.jobId)) return NextResponse.json({ error: "A valid jobId is required." }, { status: 400 });
  return NextResponse.json(await runLifecycleBatch({ limit: 1, replayJobId: body.jobId }), { headers: { "Cache-Control": "no-store" } });
}
