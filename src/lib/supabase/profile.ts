import type { User } from "@supabase/supabase-js";
import { createClient } from "./client";
import {
  setCachedDisplayName,
  suggestDisplayName,
  validateDisplayName,
} from "../profileName";

/** True once the user has confirmed their name in onboarding. */
export function isOnboarded(user: User): boolean {
  return user.user_metadata?.onboarded === true;
}

/** The name to prefill: saved display name, OAuth full name, or the email prefix. */
export function getSuggestedName(user: User): string {
  return suggestDisplayName({
    displayName: user.user_metadata?.display_name,
    fullName: user.user_metadata?.full_name,
    email: user.email,
  });
}

/** Makes the saved profile name available to synchronous collaboration code. */
export function cacheProfileName(user: User): void {
  const result = validateDisplayName(user.user_metadata?.display_name);
  if (result.ok) {
    setCachedDisplayName(result.value);
  }
}

export type SaveProfileResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

/**
 * Validates and saves the display name to the Supabase profile, marks the user as
 * onboarded, refreshes the local cache and syncs it onto workspace memberships.
 */
export async function saveProfile(rawName: string): Promise<SaveProfileResult> {
  const validated = validateDisplayName(rawName);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({
    data: { display_name: validated.value, onboarded: true },
  });
  if (error) {
    return { ok: false, error: error.message || "Could not save your name. Please try again." };
  }

  setCachedDisplayName(validated.value);

  // Best effort: the name is already saved to the account; member lists catch up.
  try {
    await fetch("/api/profile/sync", { method: "POST" });
  } catch {
    // ignore network errors
  }

  return { ok: true, name: validated.value };
}
