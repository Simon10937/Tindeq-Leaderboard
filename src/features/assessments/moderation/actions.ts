"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const moderationPath = (groupId: string) => `/groups/${groupId}/moderation`;
const fail = (groupId: string, message: string): never => redirect(`${moderationPath(groupId)}?message=${encodeURIComponent(message)}`);

export async function reviewEvidence(form: FormData) {
  const groupId = text(form, "groupId");
  const attemptId = text(form, "attemptId");
  const reason = text(form, "reason");
  if (!uuid.test(groupId) || !uuid.test(attemptId) || reason.length < 8 || reason.length > 500) fail(groupId, "Give a specific review reason of at least 8 characters.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_source_review", { target_attempt: attemptId, review_reason: reason });
  if (error || !data) fail(groupId, "The source file is not available for review.");
  redirect(`/api/evidence/${data}`);
}

export async function moderateAttempt(form: FormData) {
  const groupId = text(form, "groupId");
  const attemptId = text(form, "attemptId");
  const action = text(form, "moderationAction");
  const reason = text(form, "reason");
  if (!uuid.test(groupId) || !uuid.test(attemptId) || !["invalidate", "restore", "verify"].includes(action)) fail(groupId, "That moderation request is invalid.");
  if (reason.length < 8 || reason.length > 500) fail(groupId, "Give a specific reason of at least 8 characters.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_attempt", { target_attempt: attemptId, action, action_reason: reason });
  if (error) fail(groupId, action === "verify" ? "Review this attempt's evidence first, then verify it." : "The moderation change could not be applied.");
  revalidatePath(moderationPath(groupId));
  revalidatePath(`/groups/${groupId}/leaderboard`);
  redirect(`${moderationPath(groupId)}?message=${encodeURIComponent("Moderation updated.")}`);
}
