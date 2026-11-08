/**
 * Display-name rules and the small client-side cache that bridges the signed-in
 * profile (Supabase user_metadata.display_name) to synchronous code such as
 * collaboration/participant.ts.
 *
 * Pure module: no React, no Supabase, safe to import from server and client code.
 */

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;

export type DisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Normalizes and validates a user-chosen display name.
 * - collapses runs of whitespace and trims
 * - 2–30 characters (counted as Unicode code points, so emoji are not split)
 * - rejects control characters and angle brackets (names are rendered in the UI
 *   and broadcast to other users)
 */
export function validateDisplayName(raw: unknown): DisplayNameResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter a name." };
  }

  const value = raw.replace(/\s+/g, " ").trim();
  const length = Array.from(value).length;

  if (length < DISPLAY_NAME_MIN) {
    return { ok: false, error: `Name must be at least ${DISPLAY_NAME_MIN} characters.` };
  }
  if (length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Name must be ${DISPLAY_NAME_MAX} characters or fewer.` };
  }
  if (/[\p{C}<>]/u.test(value)) {
    return { ok: false, error: "Name contains characters that aren't allowed." };
  }

  return { ok: true, value };
}

/**
 * Builds a friendly default from account details (never the full email address).
 */
export function suggestDisplayName(source: {
  displayName?: unknown;
  fullName?: unknown;
  email?: unknown;
}): string {
  for (const candidate of [source.displayName, source.fullName]) {
    const result = validateDisplayName(candidate);
    if (result.ok) return result.value;
  }
  if (typeof source.email === "string") {
    const local = source.email.split("@")[0].replace(/[._-]+/g, " ");
    const result = validateDisplayName(local);
    if (result.ok) return result.value;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Client cache
// ---------------------------------------------------------------------------

export const PROFILE_NAME_CACHE_KEY = "echo.profile.displayName";
// Must match PARTICIPANT_STORAGE_KEY in collaboration/participant.ts
const PARTICIPANT_SESSION_KEY = "echo.collaboration.participant";

export function getCachedDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(PROFILE_NAME_CACHE_KEY);
    if (!stored) return null;
    const result = validateDisplayName(stored);
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

export function setCachedDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_NAME_CACHE_KEY, name);
  } catch {
    // storage disabled or full; the name still lives in the Supabase profile
  }
}

/**
 * Clears the cached profile name and the per-tab participant so the next visitor
 * on this browser does not inherit the previous user's name. Call on sign-out.
 */
export function clearProfileCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_NAME_CACHE_KEY);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(PARTICIPANT_SESSION_KEY);
  } catch {
    // ignore
  }
}
