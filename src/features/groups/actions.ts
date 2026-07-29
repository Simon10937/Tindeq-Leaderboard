"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/server-env";
import { groupInvitationEmail } from "@/features/email/invitation";
import { createInvitationToken, hashInvitationToken, invitationIdempotencyKey } from "@/features/groups/invitations";
import { groupNameSchema, invitationInputSchema, redeemInvitationSchema, removeMemberSchema } from "@/features/groups/schemas";

const value = (form: FormData, name: string) => String(form.get(name) ?? "");
const fail = (path: string, message: string): never => redirect(`${path}?message=${encodeURIComponent(message)}`);

export async function createGroup(form: FormData) {
  const parsed = groupNameSchema.safeParse(value(form, "name"));
  if (!parsed.success) fail("/groups", "Group names must be between 1 and 80 characters.");
  const groupName = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group", { group_name: groupName });
  if (error || !data) fail("/groups", "The group could not be created.");
  redirect(`/groups/${data}`);
}

export async function inviteMember(form: FormData) {
  const parsed = invitationInputSchema.safeParse({ groupId: value(form, "groupId"), email: value(form, "email") });
  const returnPath = `/groups/${value(form, "groupId")}`;
  if (!parsed.success) fail(returnPath, "Enter a valid email address.");
  const input = parsed.data!;
  const groupId = input.groupId;
  if (!groupId) fail(returnPath, "Enter a valid group.");
  const token = createInvitationToken();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group_invitation", {
    target_group: groupId,
    invite_email: input.email,
    invite_token_hash: hashInvitationToken(token),
  });
  const invitation = Array.isArray(data) ? data[0] : null;
  if (error || !invitation) fail(returnPath, "You are not allowed to invite members to this group.");
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) fail(returnPath, "Invitation saved, but email delivery is not configured.");
  const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/invite#${token}`;
  const email = groupInvitationEmail(invitation.group_name, inviteUrl);
  const resend = new Resend(env.RESEND_API_KEY);
  const sent = await resend.emails.send(
    { from: env.RESEND_FROM_EMAIL, to: [input.email], ...email },
    { idempotencyKey: invitationIdempotencyKey(invitation.invitation_id, invitation.invitation_version) },
  );
  await supabase.rpc("record_invitation_delivery", {
    target_invitation: invitation.invitation_id,
    new_status: sent.error ? "failed" : "sent",
    external_email_id: sent.data?.id ?? null,
  });
  if (sent.error) fail(returnPath, "Invitation saved, but delivery failed. Retry from group settings.");
  revalidatePath(returnPath);
  redirect(`${returnPath}?message=Invitation sent.`);
}

export async function redeemInvitation(form: FormData) {
  const parsed = redeemInvitationSchema.safeParse({ token: value(form, "token") });
  if (!parsed.success) fail("/invite", "This invitation is invalid.");
  const input = parsed.data!;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_group_invitation", { raw_token: input.token });
  if (error || !data) fail("/invite", "The invitation is expired, used, or belongs to another account.");
  redirect(`/groups/${data}?message=You joined the group.`);
}

export async function leaveGroup(form: FormData) {
  const groupId = value(form, "groupId");
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_group", { target_group: groupId });
  if (error) fail(`/groups/${groupId}`, "Owners must transfer or delete their group before leaving.");
  redirect("/groups?message=You left the group.");
}

export async function removeMember(form: FormData) {
  const parsed = removeMemberSchema.safeParse({ groupId: value(form, "groupId"), userId: value(form, "userId") });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc("remove_group_member", { target_group: parsed.data.groupId, target_user: parsed.data.userId });
  revalidatePath(`/groups/${parsed.data.groupId}`);
}

export async function changeMemberRole(form: FormData) {
  const groupId = value(form, "groupId");
  const userId = value(form, "userId");
  const role = value(form, "role");
  if (!/^[0-9a-f-]{36}$/i.test(groupId) || !/^[0-9a-f-]{36}$/i.test(userId) || !["admin", "member"].includes(role)) return;
  const supabase = await createClient();
  await supabase.rpc("change_group_member_role", { target_group: groupId, target_user: userId, new_role: role });
  revalidatePath(`/groups/${groupId}`);
}

export async function transferOwnership(form: FormData) {
  const groupId = value(form, "groupId");
  const userId = value(form, "userId");
  if (!/^[0-9a-f-]{36}$/i.test(groupId) || !/^[0-9a-f-]{36}$/i.test(userId)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_group_ownership", { target_group: groupId, target_user: userId });
  if (error) fail(`/groups/${groupId}`, "Ownership could not be transferred.");
  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}?message=Ownership transferred.`);
}

export async function requestAccountDeletion() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) fail("/groups", "Transfer or delete every group you own before deleting your account.");
  await supabase.auth.signOut({ scope: "global" });
  redirect("/?message=Account deletion has started.");
}
