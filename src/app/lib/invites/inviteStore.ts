/**
 * P0.1 — Invite and member database operations (server only, service-role client).
 * Authorization is enforced by callers via requireWorkspaceRole before these run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PersistenceError } from "../persistence/server/errors";
import type { WorkspaceMemberRole } from "../persistence/workspaceTypes";
import {
  INVITE_PROBLEM_MESSAGES,
  computeExpiry,
  evaluateInvite,
  type CreateInviteInput,
  type InvitableRole,
} from "./inviteLogic";
import { generateInviteToken, hashInviteToken } from "./inviteToken";

export type InviteSummary = {
  id: string;
  role: InvitableRole;
  createdAt: string;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
};

export type MemberSummary = {
  userId: string;
  displayName: string;
  role: WorkspaceMemberRole;
  color: string;
};

type InviteRow = {
  id: string;
  workspace_id: string;
  role: InvitableRole;
  created_at: string;
  expires_at: string;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
};

const INVITE_COLUMNS = "id, workspace_id, role, created_at, expires_at, max_uses, use_count, revoked_at";
const MEMBER_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function toSummary(row: InviteRow): InviteSummary {
  return {
    id: row.id,
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    revokedAt: row.revoked_at,
  };
}

function dbError(action: string, message: string): PersistenceError {
  return new PersistenceError("DATABASE_ERROR", `Failed to ${action}: ${message}`);
}

export async function createInvite(
  client: SupabaseClient,
  workspaceId: string,
  createdBy: string,
  input: CreateInviteInput,
  now: Date = new Date()
): Promise<{ invite: InviteSummary; token: string }> {
  const token = generateInviteToken();
  const { data, error } = await client
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      token_hash: hashInviteToken(token),
      role: input.role,
      created_by: createdBy,
      expires_at: computeExpiry(now, input.expiresInDays).toISOString(),
      max_uses: input.maxUses,
    })
    .select(INVITE_COLUMNS)
    .single();
  if (error || !data) throw dbError("create invite", error?.message ?? "no row returned");
  return { invite: toSummary(data as InviteRow), token };
}

/** Active (not revoked, not expired) invites, newest first. Never returns tokens or hashes. */
export async function listActiveInvites(
  client: SupabaseClient,
  workspaceId: string,
  now: Date = new Date()
): Promise<InviteSummary[]> {
  const { data, error } = await client
    .from("workspace_invites")
    .select(INVITE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false });
  if (error) throw dbError("list invites", error.message);
  return ((data ?? []) as InviteRow[]).map(toSummary);
}

export async function revokeInvite(
  client: SupabaseClient,
  workspaceId: string,
  inviteId: string,
  now: Date = new Date()
): Promise<void> {
  const { data, error } = await client
    .from("workspace_invites")
    .update({ revoked_at: now.toISOString() })
    .eq("id", inviteId)
    .eq("workspace_id", workspaceId)
    .select("id");
  if (error) throw dbError("revoke invite", error.message);
  if (!data || data.length === 0) throw new PersistenceError("NOT_FOUND", "Invite not found");
}

export async function listMembers(client: SupabaseClient, workspaceId: string): Promise<MemberSummary[]> {
  const { data, error } = await client
    .from("workspace_members")
    .select("user_id, display_name, role, color, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw dbError("list members", error.message);
  return (data ?? []).map((r) => ({
    userId: r.user_id as string,
    displayName: r.display_name as string,
    role: r.role as WorkspaceMemberRole,
    color: r.color as string,
  }));
}

export async function getMemberRole(
  client: SupabaseClient,
  workspaceId: string,
  userId: string
): Promise<WorkspaceMemberRole | null> {
  const { data, error } = await client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw dbError("read member", error.message);
  return data ? (data.role as WorkspaceMemberRole) : null;
}

export async function setMemberRole(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
  role: InvitableRole
): Promise<void> {
  const { data, error } = await client
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw dbError("change role", error.message);
  if (!data || data.length === 0) throw new PersistenceError("NOT_FOUND", "Member not found");
}

export async function removeMember(client: SupabaseClient, workspaceId: string, userId: string): Promise<void> {
  const { error } = await client
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw dbError("remove member", error.message);
}

/**
 * Redeems an invite token for `userId`. Existing members keep their current role (an invite never
 * downgrades or upgrades anyone) and do not consume a use. The use is claimed with a conditional
 * update on the previous use_count, so two simultaneous redemptions cannot exceed max_uses.
 */
export async function acceptInvite(
  client: SupabaseClient,
  token: string,
  userId: string,
  displayName: string,
  now: Date = new Date()
): Promise<{ workspaceId: string; role: WorkspaceMemberRole; alreadyMember: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await client
      .from("workspace_invites")
      .select(INVITE_COLUMNS)
      .eq("token_hash", hashInviteToken(token))
      .maybeSingle();
    if (error) throw dbError("read invite", error.message);
    if (!data) throw new PersistenceError("NOT_FOUND", "This invite link is not valid.");
    const invite = data as InviteRow;

    const existing = await getMemberRole(client, invite.workspace_id, userId);
    if (existing) return { workspaceId: invite.workspace_id, role: existing, alreadyMember: true };

    const verdict = evaluateInvite(
      { expiresAt: invite.expires_at, maxUses: invite.max_uses, useCount: invite.use_count, revokedAt: invite.revoked_at },
      now
    );
    if (!verdict.ok) throw new PersistenceError("FORBIDDEN", INVITE_PROBLEM_MESSAGES[verdict.reason]);

    const { data: claimed, error: claimError } = await client
      .from("workspace_invites")
      .update({ use_count: invite.use_count + 1 })
      .eq("id", invite.id)
      .eq("use_count", invite.use_count)
      .select("id");
    if (claimError) throw dbError("claim invite", claimError.message);
    if (!claimed || claimed.length === 0) continue; // someone else redeemed first: re-read and re-check

    const color = MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)];
    const { error: insertError } = await client.from("workspace_members").insert({
      workspace_id: invite.workspace_id,
      user_id: userId,
      display_name: displayName,
      role: invite.role,
      color,
    });
    if (insertError) {
      // Give the use back; a duplicate row means a parallel request already joined this user.
      await client.from("workspace_invites").update({ use_count: invite.use_count }).eq("id", invite.id);
      const joined = await getMemberRole(client, invite.workspace_id, userId);
      if (joined) return { workspaceId: invite.workspace_id, role: joined, alreadyMember: true };
      throw dbError("join workspace", insertError.message);
    }
    return { workspaceId: invite.workspace_id, role: invite.role, alreadyMember: false };
  }
  throw new PersistenceError("CONFLICT", "The invite is busy; please try again.");
}
