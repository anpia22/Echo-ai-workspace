/**
 * P0.1 — Invite and role rules. Pure functions only (no I/O) so they are unit-testable.
 *
 * Roles: owner > admin > editor/member > viewer. Invites can only grant editor or viewer.
 * Owners and admins manage invites and members; only an owner may change an admin;
 * nobody can change or remove an owner.
 */

import type { WorkspaceMemberRole } from "../persistence/workspaceTypes";

export type InvitableRole = "editor" | "viewer";
export const INVITABLE_ROLES: readonly InvitableRole[] = ["editor", "viewer"];

export const INVITE_EXPIRY_DAYS_OPTIONS = [1, 7, 30] as const;
export const DEFAULT_INVITE_EXPIRY_DAYS = 7;
export const MAX_INVITE_USES = 1000;

const MANAGER_ROLES: readonly WorkspaceMemberRole[] = ["owner", "admin"];

export function isInvitableRole(value: unknown): value is InvitableRole {
  return value === "editor" || value === "viewer";
}

export function canManageMembers(role: WorkspaceMemberRole): boolean {
  return MANAGER_ROLES.includes(role);
}

/** Roles that may write to a workspace (matches the database write helpers). */
export function canEditWorkspace(role: WorkspaceMemberRole): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

/** Tokens are 32 url-safe chars; reject anything else before touching the database. */
export function isPlausibleInviteToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(token);
}

export function computeExpiry(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export type CreateInviteInput = { role: InvitableRole; expiresInDays: number; maxUses: number | null };

export function parseCreateInvite(body: unknown):
  | { ok: true; value: CreateInviteInput }
  | { ok: false; message: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const role = b.role ?? "editor";
  if (!isInvitableRole(role)) {
    return { ok: false, message: "role must be 'editor' or 'viewer'" };
  }

  const days = b.expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS;
  if (typeof days !== "number" || !(INVITE_EXPIRY_DAYS_OPTIONS as readonly number[]).includes(days)) {
    return { ok: false, message: `expiresInDays must be one of ${INVITE_EXPIRY_DAYS_OPTIONS.join(", ")}` };
  }

  let maxUses: number | null = null;
  if (b.maxUses !== undefined && b.maxUses !== null) {
    if (typeof b.maxUses !== "number" || !Number.isInteger(b.maxUses) || b.maxUses < 1 || b.maxUses > MAX_INVITE_USES) {
      return { ok: false, message: `maxUses must be a whole number from 1 to ${MAX_INVITE_USES}` };
    }
    maxUses = b.maxUses;
  }

  return { ok: true, value: { role, expiresInDays: days, maxUses } };
}

export type InviteState = {
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
};

export type InviteProblem = "revoked" | "expired" | "used_up";

export function evaluateInvite(invite: InviteState, now: Date): { ok: true } | { ok: false; reason: InviteProblem } {
  if (invite.revokedAt) return { ok: false, reason: "revoked" };
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) return { ok: false, reason: "used_up" };
  return { ok: true };
}

export const INVITE_PROBLEM_MESSAGES: Record<InviteProblem, string> = {
  revoked: "This invite link was cancelled.",
  expired: "This invite link has expired.",
  used_up: "This invite link has reached its use limit.",
};

export type RoleChangeDecision = { ok: true } | { ok: false; message: string };

/** May `actor` set `target` (currently `targetRole`) to `newRole`? Self-changes are never allowed. */
export function decideRoleChange(args: {
  actorRole: WorkspaceMemberRole;
  actorUserId: string;
  targetUserId: string;
  targetRole: WorkspaceMemberRole;
  newRole: unknown;
}): RoleChangeDecision {
  if (!canManageMembers(args.actorRole)) return { ok: false, message: "Only owners and admins can change roles" };
  if (!isInvitableRole(args.newRole)) return { ok: false, message: "role must be 'editor' or 'viewer'" };
  if (args.actorUserId === args.targetUserId) return { ok: false, message: "You cannot change your own role" };
  if (args.targetRole === "owner") return { ok: false, message: "The owner's role cannot be changed" };
  if (args.targetRole === "admin" && args.actorRole !== "owner") {
    return { ok: false, message: "Only the owner can change an admin" };
  }
  return { ok: true };
}

/** May `actor` remove `target` from the workspace? Anyone except the owner may leave. */
export function decideRemoval(args: {
  actorRole: WorkspaceMemberRole;
  actorUserId: string;
  targetUserId: string;
  targetRole: WorkspaceMemberRole;
}): RoleChangeDecision {
  if (args.targetRole === "owner") return { ok: false, message: "The owner cannot be removed or leave" };
  if (args.actorUserId === args.targetUserId) return { ok: true };
  if (!canManageMembers(args.actorRole)) return { ok: false, message: "Only owners and admins can remove members" };
  if (args.targetRole === "admin" && args.actorRole !== "owner") {
    return { ok: false, message: "Only the owner can remove an admin" };
  }
  return { ok: true };
}
