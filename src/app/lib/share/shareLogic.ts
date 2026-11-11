/**
 * Public share links. Pure logic (no I/O): what is allowed in the public view, and how a link
 * is judged. The public view is built by an explicit allow-list mapper, so a column added to the
 * database later can never leak into it by accident.
 */

export const SHARE_EXPIRY_OPTIONS = [0, 7, 30, 90] as const; // 0 = never expires
export const DEFAULT_SHARE_EXPIRY_DAYS = 30;

export type CreateShareInput = { expiresInDays: number };

export function parseCreateShare(body: unknown): { ok: true; value: CreateShareInput } | { ok: false; message: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const days = b.expiresInDays ?? DEFAULT_SHARE_EXPIRY_DAYS;
  if (typeof days !== "number" || !(SHARE_EXPIRY_OPTIONS as readonly number[]).includes(days)) {
    return { ok: false, message: `expiresInDays must be one of ${SHARE_EXPIRY_OPTIONS.join(", ")} (0 = never)` };
  }
  return { ok: true, value: { expiresInDays: days } };
}

export type ShareLinkState = { expiresAt: string | null; revokedAt: string | null };

export function evaluateShareLink(link: ShareLinkState, now: Date): { ok: true } | { ok: false; reason: "revoked" | "expired" } {
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The public view (everything an anonymous visitor can receive)
// ---------------------------------------------------------------------------

export const LIMITS = {
  conversations: 30,
  messages: 1500,
  nodes: 1000,
  edges: 2000,
  groups: 200,
  messageChars: 8000,
  titleChars: 300,
} as const;

export type PublicNode = { id: string; nodeType: string; title: string; description?: string; position: { x: number; y: number } };
export type PublicEdge = { id: string; sourceId: string; targetId: string; relationship?: string };
export type PublicGroup = { id: string; title: string; memberIds: string[] };
export type PublicMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
export type PublicConversation = { id: string; title: string; updatedAt: string; messages: PublicMessage[] };

export type PublicView = {
  workspace: { title: string };
  revision: number;
  etag: string;
  canvas: { nodes: PublicNode[]; edges: PublicEdge[]; groups: PublicGroup[] };
  conversations: PublicConversation[];
  generatedAt: string;
};

type Row = Record<string, unknown>;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Builds the public view from raw database rows. Only the fields named here can ever be exposed. */
export function buildPublicView(input: {
  workspace: Row;
  nodes: Row[];
  edges: Row[];
  groups: Row[];
  conversations: Row[];
  messages: Row[];
  now: Date;
}): PublicView {
  const nodes: PublicNode[] = input.nodes.slice(0, LIMITS.nodes).map((r) => ({
    id: str(r.id, 64),
    nodeType: str(r.node_type, 40),
    title: str(r.title, LIMITS.titleChars),
    ...(typeof r.description === "string" && r.description ? { description: r.description.slice(0, LIMITS.messageChars) } : {}),
    position: { x: num(r.position_x), y: num(r.position_y) },
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: PublicEdge[] = input.edges
    .slice(0, LIMITS.edges)
    .map((r) => ({
      id: str(r.id, 64),
      sourceId: str(r.source_id, 64),
      targetId: str(r.target_id, 64),
      ...(typeof r.relationship === "string" && r.relationship ? { relationship: r.relationship.slice(0, 80) } : {}),
    }))
    .filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

  const groups: PublicGroup[] = input.groups.slice(0, LIMITS.groups).map((r) => ({
    id: str(r.id, 64),
    title: str(r.title, LIMITS.titleChars),
    memberIds: Array.isArray(r.member_ids) ? r.member_ids.filter((m): m is string => typeof m === "string" && nodeIds.has(m)) : [],
  }));

  const byConversation = new Map<string, PublicMessage[]>();
  for (const m of input.messages.slice(0, LIMITS.messages)) {
    if (m.role !== "user" && m.role !== "assistant") continue; // never system messages
    const list = byConversation.get(str(m.conversation_id, 64)) ?? [];
    list.push({
      id: str(m.id, 64),
      role: m.role,
      content: str(m.content, LIMITS.messageChars),
      createdAt: str(m.created_at, 40),
    });
    byConversation.set(str(m.conversation_id, 64), list);
  }

  const conversations: PublicConversation[] = input.conversations.slice(0, LIMITS.conversations).map((c) => ({
    id: str(c.id, 64),
    title: str(c.title, LIMITS.titleChars),
    updatedAt: str(c.updated_at, 40),
    messages: (byConversation.get(str(c.id, 64)) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));

  const content = {
    workspace: { title: str(input.workspace.title, LIMITS.titleChars) },
    revision: num(input.workspace.revision),
    canvas: { nodes, edges, groups },
    conversations,
  };

  return {
    ...content,
    etag: computeEtag(content),
    generatedAt: input.now.toISOString(),
  };
}

/**
 * Content tag: changes whenever something visible changes (used so polling can skip unchanged
 * views). A small pure hash (cyrb53); it is not security-sensitive and must stay free of
 * node-only imports because this file is also used by browser code.
 */
export function computeEtag(content: unknown): string {
  const text = JSON.stringify(content);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
