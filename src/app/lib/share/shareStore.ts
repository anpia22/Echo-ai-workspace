/**
 * Public share links: database operations (server only, service-role client).
 * Authorization for create / list / revoke is enforced by the routes (owner or admin).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PersistenceError } from "../persistence/server/errors";
import { generateInviteToken, hashInviteToken } from "../invites/inviteToken";
import { LIMITS, buildPublicView, evaluateShareLink, type CreateShareInput, type PublicView } from "./shareLogic";

export type ShareLinkSummary = {
  id: string;
  createdAt: string;
  expiresAt: string | null;
};

type LinkRow = {
  id: string;
  workspace_id: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

const LINK_COLUMNS = "id, workspace_id, created_at, expires_at, revoked_at";
const DAY_MS = 24 * 60 * 60_000;

function dbError(action: string, message: string) {
  return new PersistenceError("DATABASE_ERROR", `Failed to ${action}: ${message}`);
}

const toSummary = (r: LinkRow): ShareLinkSummary => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires_at });

export async function createShareLink(
  client: SupabaseClient,
  workspaceId: string,
  createdBy: string,
  input: CreateShareInput,
  now: Date = new Date()
): Promise<{ link: ShareLinkSummary; token: string }> {
  const token = generateInviteToken();
  const { data, error } = await client
    .from("workspace_public_links")
    .insert({
      workspace_id: workspaceId,
      token_hash: hashInviteToken(token),
      created_by: createdBy,
      expires_at: input.expiresInDays > 0 ? new Date(now.getTime() + input.expiresInDays * DAY_MS).toISOString() : null,
    })
    .select(LINK_COLUMNS)
    .single();
  if (error || !data) throw dbError("create share link", error?.message ?? "no row returned");
  return { link: toSummary(data as LinkRow), token };
}

export async function listActiveShareLinks(client: SupabaseClient, workspaceId: string, now: Date = new Date()): Promise<ShareLinkSummary[]> {
  const { data, error } = await client
    .from("workspace_public_links")
    .select(LINK_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw dbError("list share links", error.message);
  return ((data ?? []) as LinkRow[])
    .filter((r) => evaluateShareLink({ expiresAt: r.expires_at, revokedAt: r.revoked_at }, now).ok)
    .map(toSummary);
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
 * The public view for a token, or null when the token is unknown, revoked or expired. Callers
 * must answer all of those the same way (404) so a token's history is not revealed.
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

  const ws = link.workspace_id;
  const [workspace, nodes, edges, groups, conversations] = await Promise.all([
    client.from("workspaces").select("title, revision").eq("id", ws).maybeSingle(),
    client.from("canvas_nodes").select("id, node_type, title, description, position_x, position_y").eq("workspace_id", ws).limit(LIMITS.nodes),
    client.from("canvas_edges").select("id, source_id, target_id, relationship").eq("workspace_id", ws).limit(LIMITS.edges),
    client.from("canvas_groups").select("id, title, member_ids").eq("workspace_id", ws).limit(LIMITS.groups),
    client.from("conversations").select("id, title, updated_at").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(LIMITS.conversations),
  ]);
  for (const [name, res] of [["workspace", workspace], ["nodes", nodes], ["edges", edges], ["groups", groups], ["conversations", conversations]] as const) {
    if (res.error) throw dbError(`read ${name}`, res.error.message);
  }
  if (!workspace.data) return null;

  const conversationIds = (conversations.data ?? []).map((c) => c.id as string);
  let messages: Array<Record<string, unknown>> = [];
  if (conversationIds.length > 0) {
    const res = await client
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .eq("workspace_id", ws)
      .in("conversation_id", conversationIds)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(LIMITS.messages);
    if (res.error) throw dbError("read messages", res.error.message);
    messages = res.data ?? [];
  }

  const view = buildPublicView({
    workspace: workspace.data,
    nodes: nodes.data ?? [],
    edges: edges.data ?? [],
    groups: groups.data ?? [],
    conversations: conversations.data ?? [],
    messages,
    now,
  });

  if (cache.size >= CACHE_MAX) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(hash, { at: now.getTime(), linkId: link.id, expiresAt: link.expires_at, view });
  return view;
}
