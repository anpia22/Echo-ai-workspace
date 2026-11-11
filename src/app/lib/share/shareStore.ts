/**
 * Public share links: database operations (server only, service-role client).
 * Authorization for create / list / revoke is enforced by the routes (owner or admin).
 * A link belongs to one conversation of one workspace.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PersistenceError } from "../persistence/server/errors";
import { generateInviteToken, hashInviteToken } from "../invites/inviteToken";
import { LIMITS, buildPublicView, evaluateShareLink, type CreateShareInput, type PublicView } from "./shareLogic";

export type ShareLinkSummary = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  createdAt: string;
  expiresAt: string | null;
};

export type ShareableConversation = { id: string; title: string };

type LinkRow = {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

const LINK_COLUMNS = "id, workspace_id, conversation_id, created_at, expires_at, revoked_at";
const DAY_MS = 24 * 60 * 60_000;

function dbError(action: string, message: string) {
  return new PersistenceError("DATABASE_ERROR", `Failed to ${action}: ${message}`);
}

/** Conversations the owner can choose to share (id and title only), newest first. */
export async function listShareableConversations(client: SupabaseClient, workspaceId: string): Promise<ShareableConversation[]> {
  const { data, error } = await client
    .from("conversations")
    .select("id, title")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw dbError("list conversations", error.message);
  return (data ?? []).map((c) => ({ id: c.id as string, title: String(c.title ?? "") }));
}

export async function createShareLink(
  client: SupabaseClient,
  workspaceId: string,
  createdBy: string,
  input: CreateShareInput,
  now: Date = new Date()
): Promise<{ link: ShareLinkSummary; token: string }> {
  // The conversation must belong to this workspace: an owner can only publish their own.
  const { data: conversation, error: cError } = await client
    .from("conversations")
    .select("id, title")
    .eq("id", input.conversationId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (cError) throw dbError("read conversation", cError.message);
  if (!conversation) throw new PersistenceError("NOT_FOUND", "Conversation not found");

  const token = generateInviteToken();
  const { data, error } = await client
    .from("workspace_public_links")
    .insert({
      workspace_id: workspaceId,
      conversation_id: input.conversationId,
      token_hash: hashInviteToken(token),
      created_by: createdBy,
      expires_at: input.expiresInDays > 0 ? new Date(now.getTime() + input.expiresInDays * DAY_MS).toISOString() : null,
    })
    .select(LINK_COLUMNS)
    .single();
  if (error || !data) throw dbError("create share link", error?.message ?? "no row returned");
  const row = data as LinkRow;
  return {
    link: {
      id: row.id,
      conversationId: input.conversationId,
      conversationTitle: String(conversation.title ?? ""),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    },
    token,
  };
}

export async function listActiveShareLinks(client: SupabaseClient, workspaceId: string, now: Date = new Date()): Promise<ShareLinkSummary[]> {
  const { data, error } = await client
    .from("workspace_public_links")
    .select(LINK_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw dbError("list share links", error.message);

  const rows = ((data ?? []) as LinkRow[]).filter(
    (r) => r.conversation_id && evaluateShareLink({ expiresAt: r.expires_at, revokedAt: r.revoked_at }, now).ok
  );
  if (rows.length === 0) return [];

  const titles = new Map((await listShareableConversations(client, workspaceId)).map((c) => [c.id, c.title]));
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id as string,
    conversationTitle: titles.get(r.conversation_id as string) ?? "(deleted conversation)",
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

export async function revokeShareLink(client: SupabaseClient, workspaceId: string, linkId: string, now: Date = new Date()): Promise<void> {
  const { data, error } = await client
    .from("workspace_public_links")
    .update({ revoked_at: now.toISOString() })
    .eq("id", linkId)
    .eq("workspace_id", workspaceId)
    .select("id");
  if (error) throw dbError("revoke share link", error.message);
  if (!data || data.length === 0) throw new PersistenceError("NOT_FOUND", "Share link not found");
  clearShareCache(linkId);
}

// ---------------------------------------------------------------------------
// Public view, with a short cache so many viewers cost one database read per few seconds.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 4_000;
const CACHE_MAX = 200;
type CacheEntry = { at: number; linkId: string; expiresAt: string | null; view: PublicView };
const cache = new Map<string, CacheEntry>();

export function clearShareCache(linkId?: string): void {
  if (!linkId) {
    cache.clear();
    return;
  }
  for (const [key, entry] of cache) if (entry.linkId === linkId) cache.delete(key);
}

/**
 * The public view for a token, or null when the token is unknown, revoked, expired, or an old
 * workspace-wide link. Callers must answer all of those the same way (404).
 */
export async function loadPublicView(client: SupabaseClient, token: string, now: Date = new Date()): Promise<PublicView | null> {
  const hash = hashInviteToken(token);

  const hit = cache.get(hash);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS && evaluateShareLink({ expiresAt: hit.expiresAt, revokedAt: null }, now).ok) {
    return hit.view;
  }
  if (hit) cache.delete(hash);

  const { data: linkData, error: linkError } = await client
    .from("workspace_public_links")
    .select(LINK_COLUMNS)
    .eq("token_hash", hash)
    .maybeSingle();
  if (linkError) throw dbError("read share link", linkError.message);
  if (!linkData) return null;
  const link = linkData as LinkRow;
  if (!evaluateShareLink({ expiresAt: link.expires_at, revokedAt: link.revoked_at }, now).ok) return null;
  if (!link.conversation_id) return null; // old workspace-wide links never serve anything

  // Both reads are pinned to this link's workspace AND conversation.
  const [conversation, messages] = await Promise.all([
    client
      .from("conversations")
      .select("id, title, updated_at, metadata")
      .eq("id", link.conversation_id)
      .eq("workspace_id", link.workspace_id)
      .maybeSingle(),
    client
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .eq("workspace_id", link.workspace_id)
      .eq("conversation_id", link.conversation_id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(LIMITS.messages),
  ]);
  if (conversation.error) throw dbError("read conversation", conversation.error.message);
  if (messages.error) throw dbError("read messages", messages.error.message);
  if (!conversation.data) return null; // the conversation was deleted

  const view = buildPublicView({ conversation: conversation.data, messages: messages.data ?? [], now });

  if (cache.size >= CACHE_MAX) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(hash, { at: now.getTime(), linkId: link.id, expiresAt: link.expires_at, view });
  return view;
}
