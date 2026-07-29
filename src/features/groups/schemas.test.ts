import { describe, expect, it } from "vitest";
import {
  invitationInputSchema,
  normalizeEmail,
  redeemInvitationSchema,
} from "@/features/groups/schemas";

describe("group input schemas", () => {
  it("normalizes invite email addresses before persistence", () => {
    expect(normalizeEmail("  Climber@Example.COM ")).toBe("climber@example.com");
    expect(invitationInputSchema.parse({ email: " Climber@Example.COM " }).email).toBe(
      "climber@example.com",
    );
  });

  it("rejects malformed invitation and redemption payloads", () => {
    expect(invitationInputSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(redeemInvitationSchema.safeParse({ token: "short" }).success).toBe(false);
  });
});
