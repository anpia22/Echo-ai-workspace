/**
 * P1.6 — Who is an admin.
 *
 * Admins are listed in server-side environment variables; there is no user-editable admin
 * flag. A person matches by Supabase user id (ADMIN_USER_IDS) or by a *confirmed* email
 * (ADMIN_EMAILS). Both are comma-separated. With neither set, nobody is an admin.
 */

export type AdminCandidate = {
  id: string;
  email?: string | null;
  emailConfirmed?: boolean;
};

export type AdminEnv = {
  ADMIN_USER_IDS?: string;
  ADMIN_EMAILS?: string;
};

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(candidate: AdminCandidate | null | undefined, env: AdminEnv): boolean {
  if (!candidate || !candidate.id) return false;

  if (list(env.ADMIN_USER_IDS).includes(candidate.id.toLowerCase())) return true;

  // Email only counts once the address is confirmed, so nobody can claim an admin address
  // by signing up with it.
  const email = candidate.email?.trim().toLowerCase();
  if (email && candidate.emailConfirmed === true && list(env.ADMIN_EMAILS).includes(email)) return true;

  return false;
}
