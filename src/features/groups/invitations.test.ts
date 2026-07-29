import { describe, expect, it } from "vitest";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationIdempotencyKey,
  verifyInvitationToken,
} from "@/features/groups/invitations";

describe("invitation token helpers", () => {
  it("creates an opaque token and persists only its deterministic hash", () => {
    const token = createInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(token)).not.toContain(token);
  });

  it("compares invitation tokens without accepting lookalikes", () => {
    const token = createInvitationToken();
    const hash = hashInvitationToken(token);
    expect(verifyInvitationToken(token, hash)).toBe(true);
    expect(verifyInvitationToken(`${token.slice(0, -1)}x`, hash)).toBe(false);
    expect(verifyInvitationToken(token, "bad-hash")).toBe(false);
  });

  it("uses the invitation version as the delivery idempotency boundary", () => {
    expect(invitationIdempotencyKey("invite-id", 2)).toBe("group-invitation/invite-id/v2");
  });
});
