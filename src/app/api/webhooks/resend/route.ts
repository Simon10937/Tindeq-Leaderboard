import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/server-env";

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY || !env.RESEND_WEBHOOK_SECRET) return new NextResponse("Unavailable", { status: 503 });
  const payload = await request.text();
  const resend = new Resend(env.RESEND_API_KEY);
  let event: { type: string; data?: { email_id?: string } };
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    }) as typeof event;
  } catch {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const deliveryStatus: Record<string, string> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.failed": "failed",
    "email.bounced": "bounced",
  };
  const providerId = event.data?.email_id;
  if (providerId && deliveryStatus[event.type]) {
    await createAdminClient()
      .from("group_invitations")
      .update({ delivery_status: deliveryStatus[event.type], updated_at: new Date().toISOString() })
      .eq("provider_email_id", providerId);
  }
  return NextResponse.json({ received: true });
}
