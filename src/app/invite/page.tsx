import type { Metadata } from "next";
import { InvitationFragment } from "@/components/invitation-fragment";

export const metadata: Metadata = { title: "Group invitation · Cruxboard", referrer: "no-referrer" };
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Private invitation</p><h1>Join your group.</h1>{message && <p role="alert">{message}</p>}<InvitationFragment /></section></main>;
}
