"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseProtocolDraft } from "./schemas";
import { createClient } from "@/lib/supabase/server";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const number = (form: FormData, key: string) => Number(text(form, key));
const fail = (path: string, message: string): never => redirect(`${path}?message=${encodeURIComponent(message)}`);

export async function createRfdProtocol(form: FormData) {
  const groupId = text(form, "groupId");
  const path = `/groups/${groupId}/protocols`;
  let draft;
  try {
    draft = parseProtocolDraft({
      assessmentType: "rfd",
      name: text(form, "name"),
      gripType: text(form, "gripType"),
      edgeDepthMm: number(form, "edgeDepthMm"),
      setupInstructions: text(form, "setupInstructions"),
      warmupInstructions: text(form, "warmupInstructions"),
      bodyPosition: text(form, "bodyPosition"),
      devicePlacement: text(form, "devicePlacement"),
      executionInstructions: text(form, "executionInstructions"),
      maximumAttempts: number(form, "maximumAttempts"),
      minimumRecoverySeconds: number(form, "minimumRecoverySeconds"),
      bestOf: number(form, "bestOf"),
      minimumValidDurationMs: number(form, "minimumValidDurationMs"),
      lowerPercent: 20,
      upperPercent: 80,
      minimumPeakForceN: number(form, "minimumPeakForceN"),
    });
  } catch {
    fail(path, "Complete every protocol field with valid values.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_rfd_protocol", { target_group: groupId, draft });
  if (error) fail(path, "The protocol could not be created for this group.");
  revalidatePath(path);
  redirect(`${path}?message=Draft protocol created.`);
}

export async function publishProtocol(form: FormData) {
  const groupId = text(form, "groupId");
  const versionId = text(form, "versionId");
  const path = `/groups/${groupId}/protocols`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_protocol_version", { target_version: versionId });
  if (error) fail(path, "Publishing stays disabled until the RFD oracle is independently approved.");
  revalidatePath(path);
  redirect(`${path}?message=Protocol published.`);
}

export async function cloneProtocol(form: FormData) {
  const groupId = text(form, "groupId");
  const versionId = text(form, "versionId");
  const path = `/groups/${groupId}/protocols`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("clone_protocol_version", { target_version: versionId });
  if (error) fail(path, "The protocol version could not be cloned.");
  revalidatePath(path);
  redirect(`${path}?message=Draft version cloned.`);
}

export async function archiveProtocol(form: FormData) {
  const groupId = text(form, "groupId");
  const versionId = text(form, "versionId");
  const path = `/groups/${groupId}/protocols`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_protocol_version", { target_version: versionId });
  if (error) fail(path, "The protocol version could not be archived.");
  revalidatePath(path);
  redirect(`${path}?message=Protocol archived.`);
}
