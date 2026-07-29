import { z } from "zod";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const groupNameSchema = z.string().trim().min(1).max(80);
export const invitationInputSchema = z.object({
  groupId: z.uuid().optional(),
  email: z.preprocess((value) => typeof value === "string" ? normalizeEmail(value) : value, z.email()),
});
export const redeemInvitationSchema = z.object({ token: z.string().min(32).max(256) });
export const removeMemberSchema = z.object({ groupId: z.uuid(), userId: z.uuid() });
