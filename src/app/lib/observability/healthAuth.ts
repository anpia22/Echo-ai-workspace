/**
 * P0.3 — Auth for the detailed health endpoint (/api/health/ai).
 *
 * The endpoint is disabled unless HEALTH_CHECK_TOKEN is set (>= 16 chars), and callers
 * must send `Authorization: Bearer <token>`. Anything else is answered as if the route
 * does not exist (404), so its presence is not advertised.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_HEALTH_TOKEN_LENGTH = 16;

export function isAuthorizedHealthRequest(
  authorizationHeader: string | null,
  configuredToken: string | undefined
): boolean {
  const token = (configuredToken ?? "").trim();
  if (token.length < MIN_HEALTH_TOKEN_LENGTH) return false;
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) return false;

  const supplied = authorizationHeader.slice("Bearer ".length).trim();
  // Hash both sides so the buffers are equal length and the comparison is constant-time.
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}
