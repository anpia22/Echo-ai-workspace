/**
 * Phase 13.3 & 13.4 — Authenticated Actor Context & Resolution
 *
 * Represents the verified server-side caller identity.
 * CRITICAL INVARIANT: The client is NEVER trusted to supply roles or permissions.
 * Role and workspace membership are derived authoritatively from the database.
 */

import { PersistenceError } from "./errors";
import { getServerSupabaseClient } from "./db";

export type PersistenceActor = {
  userId: string;
};

export function createActor(userId: string): PersistenceActor {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new PersistenceError("UNAUTHORIZED", "Valid authenticated actor userId is required");
  }
  return { userId: userId.trim() };
}

/**
 * Resolves the authenticated actor on the server.
 * Priority:
 * 1. Bearer token in request Authorization header (verified against Supabase Auth)
 * 2. Clearly isolated development actor fallback (when in development or non-production)
 *
 * CRITICAL SECURITY INVARIANT:
 * - Client request body or query params are NEVER trusted for userId, role, or membership.
 */
export async function resolveServerActor(req?: Request): Promise<PersistenceActor> {
  // 1. Check Bearer token if request is provided
  if (req) {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token) {
        try {
          const client = getServerSupabaseClient();
          const { data, error } = await client.auth.getUser(token);
          if (!error && data?.user?.id) {
            return createActor(data.user.id);
          }
        } catch {
          // Token invalid or auth service unreachable; proceed to fallback check
        }
      }
    }
  }

  // 2. Development / Demo actor fallback.
  // In production (NODE_ENV === "production"), a valid verified Supabase Bearer token is strictly required
  // unless explicitly permitted via ECHO_DEMO_MODE="true".
  if (process.env.NODE_ENV === "production" && process.env.ECHO_DEMO_MODE !== "true") {
    throw new PersistenceError("UNAUTHORIZED", "Authentication required");
  }

  // Local development / test fallback (NODE_ENV !== "production")
  const devUserId = (process.env.ECHO_DEV_USER_ID || "00000000-0000-0000-0000-000000000001").trim();
  return createActor(devUserId);
}
