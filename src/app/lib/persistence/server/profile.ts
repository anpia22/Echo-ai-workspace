/**
 * Server-side profile lookups.
 *
 * Reads the display name from Supabase Auth user_metadata using the service-role
 * client, so the value comes from the verified account and is never taken from a
 * client-supplied field. Returns null for non-account actors (dev/demo fallback)
 * or when the service-role key is not configured.
 */

import { validateDisplayName } from "../../../../lib/profileName";
import { getServerSupabaseClient } from "./db";

export async function resolveProfileDisplayName(userId: string): Promise<string | null> {
  try {
    const client = getServerSupabaseClient();
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;

    const meta = data.user.user_metadata ?? {};
    const result = validateDisplayName(meta.display_name ?? meta.full_name);
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}
