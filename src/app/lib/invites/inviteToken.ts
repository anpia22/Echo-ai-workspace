/** Server-only token helpers (uses node:crypto, so it must not be imported by client code). */

import { createHash, randomBytes } from "node:crypto";

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
