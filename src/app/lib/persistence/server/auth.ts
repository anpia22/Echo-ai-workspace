/**
 * Phase 13.3 & 13.4 — Authenticated Actor Context & Resolution
 *
 * Represents the verified server-side caller identity.
 * CRITICAL INVARIANT: The client is NEVER trusted to supply roles or permissions.
 * Role and workspace membership are derived authoritatively from the database.
 */

import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { PersistenceError } from "./errors";
import { getServerSupabaseClient } from "./db";

export type PersistenceActor = {
  userId: string;
};

/**
 * Resolves the user from the Supabase session cookie (set by the login flow and
 * refreshed by src/proxy.ts). Browsers send this cookie automatically on
 * same-origin fetches, so no client change is needed.
 *
 * SECURITY: uses auth.getUser(), which validates the JWT with the Supabase Auth
 * server. The cookie contents are never trusted on their own (no getSession()).
 * Returns null when there is no cookie, no valid session, or config is missing.
 */
async function resolveSessionCookieUserId(req: Request): Promise<string | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return null;

  try {
    const client = createServerClient(url, anonKey, {
      cookies: {
        getAll: () =>
          parseCookieHeader(cookieHeader).map((c) => ({ name: c.name, value: c.value ?? "" })),
        // Read-only here; token refresh and cookie writes are handled by src/proxy.ts.
        setAll: () => {},
      },
    });
    const { data, error } = await client.auth.getUser();
    if (!error && data?.user?.id) {
      return data.user.id;
    }
  } catch {
    // Invalid cookie or auth service unreachable; caller falls through.
  }
  return null;
}

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
 * 2. Supabase session cookie from the login flow (verified against Supabase Auth)
 * 3. Clearly isolated development actor fallback (when in development or non-production,
 *    or in production only when ECHO_DEMO_MODE="true")
 *
 * CRITICAL SECURITY INVARIANT:
 * - Client request body or query params are NEVER trusted for userId, role, or membership.
 */
export async function resolveServerActor(req?: Request): Promise<PersistenceActor> {
  return (await resolveServerIdentity(req)).actor;
}

export type ServerIdentity = {
  actor: PersistenceActor;
  /**
   * true  = a verified Supabase identity (Bearer token or session cookie).
   * false = the shared dev/demo fallback actor, which is NOT a real account.
   */
  authenticated: boolean;
};

/**
 * Same resolution as resolveServerActor, but also reports whether the caller is a
 * verified account or the shared fallback, so callers (e.g. rate limiting) can treat
 * anonymous demo traffic differently from signed-in users.
 */
export async function resolveServerIdentity(req?: Request): Promise<ServerIdentity> {
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
            return { actor: createActor(data.user.id), authenticated: true };
          }
        } catch {
          // Token invalid or auth service unreachable; proceed to fallback check
        }
      }
    }
  }

  // 2. Session cookie (the normal path for the browser app)
  if (req) {
    const cookieUserId = await resolveSessionCookieUserId(req);
    if (cookieUserId) {
      return { actor: createActor(cookieUserId), authenticated: true };
    }
  }

  // 3. Development / Demo actor fallback.
  // In production (NODE_ENV === "production"), a verified Supabase identity (Bearer token or
  // session cookie) is strictly required unless explicitly permitted via ECHO_DEMO_MODE="true".
  if (process.env.NODE_ENV === "production" && process.env.ECHO_DEMO_MODE !== "true") {
    throw new PersistenceError("UNAUTHORIZED", "Authentication required");
  }

  // Local development / test fallback (NODE_ENV !== "production")
  const devUserId = (process.env.ECHO_DEV_USER_ID || "00000000-0000-0000-0000-000000000001").trim();
  return { actor: createActor(devUserId), authenticated: false };
}
