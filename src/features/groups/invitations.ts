import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyInvitationToken(token: string, expectedHash: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const actual = Buffer.from(hashInvitationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
}

export function invitationIdempotencyKey(id: string, version: number) {
  return `group-invitation/${id}/v${version}`;
}
