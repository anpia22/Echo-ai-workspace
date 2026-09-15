/**
 * Phase 13.3 — Server Database Client Boundary
 *
 * Provides the authoritative server-side Supabase client for persistence operations.
 * CRITICAL INVARIANT: Server-only! Never imported in client bundles or exposed to browser.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PersistenceError } from "./errors";

// Strict runtime guard ensuring server-only execution
if (typeof window !== "undefined") {
  throw new Error("[SECURITY VIOLATION] Persistence server modules cannot be imported or executed in browser context.");
}

let serverClient: SupabaseClient | null = null;

export function getServerSupabaseConfig(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  // Server uses service role key if available, otherwise anon key for local development
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!url || !key) {
    throw new PersistenceError("DATABASE_ERROR", "Supabase server configuration missing URL or API key");
  }

  return { url, key };
}

export function getServerSupabaseClient(): SupabaseClient {
  if (!serverClient) {
    const { url, key } = getServerSupabaseConfig();
    serverClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serverClient;
}
