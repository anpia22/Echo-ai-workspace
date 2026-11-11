/**
 * Public share links. Pure logic (no I/O): what is allowed in the public view, and how a link
 * is judged. The public view is built by an explicit allow-list mapper, so a column added to the
 * database later can never leak into it by accident.
 *
 * A link covers ONE conversation: its messages and its own canvas (the one the app shows when
 * that conversation is open), never the workspace-wide canvas, which merges every conversation.
 */

export const SHARE_EXPIRY_OPTIONS = [0, 7, 30, 90] as const; // 0 = never expires
export const DEFAULT_SHARE_EXPIRY_DAYS = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateShareInput = { conversationId: string; expiresInDays: number };

export function parseCreateShare(body: unknown): { ok: true; value: CreateShareInput } | { ok: false; message: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  if (typeof b.conversationId !== "string" || !UUID_RE.test(b.conversationId)) {
    return { ok: false, message: "conversationId is required: choose the conversation to share" };
  }

  const days = b.expiresInDays ?? DEFAULT_SHARE_EXPIRY_DAYS;
  if (typeof days !== "number" || !(SHARE_EXPIRY_OPTIONS as readonly number[]).includes(days)) {
    return { ok: false, message: `expiresInDays must be one of ${SHARE_EXPIRY_OPTIONS.join(", ")} (0 = never)` };
  }
  return { ok: true, value: { conversationId: b.conversationId, expiresInDays: days } };
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

export type PublicView = {
  /** The conversation's title. The workspace's name is deliberately not included. */
  title: string;
  etag: string;
  canvas: { nodes: PublicNode[]; edges: PublicEdge[]; groups: PublicGroup[] };
  conversation: { id: string; updatedAt: string; messages: PublicMessage[] };
  generatedAt: string;
};

type Row = Record<string, unknown>;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Turns a conversation's saved canvas (the app's own shape) into the public canvas. Anything
 * unexpected is dropped; edges to missing nodes and group members that are not nodes are removed.
 */
export function sanitizeCanvas(raw: unknown): PublicView["canvas"] {
  const src = isObj(raw) ? raw : {};
  const nodes: PublicNode[] = (Array.isArray(src.nodes) ? src.nodes : [])
    .filter(isObj)
    .slice(0, LIMITS.nodes)
    .map((n) => {
      const pos = isObj(n.position) ? n.position : {};
      const description = typeof n.description === "string" && n.description ? n.description.slice(0, LIMITS.messageChars) : undefined;
      return {
        id: str(n.id, 64),
        nodeType: str(n.nodeType, 40),
        title: str(n.title, LIMITS.titleChars),
        ...(description ? { description } : {}),
        position: { x: num(pos.x), y: num(pos.y) },
      };
    })
    .filter((n) => n.id !== "");

  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: PublicEdge[] = (Array.isArray(src.edges) ? src.edges : [])
    .filter(isObj)
    .slice(0, LIMITS.edges)
    .map((e) => ({
      id: str(e.id, 64),
      sourceId: str(e.sourceId, 64),
      targetId: str(e.targetId, 64),
      ...(typeof e.relationship === "string" && e.relationship ? { relationship: e.relationship.slice(0, 80) } : {}),
    }))
    .filter((e) => e.id !== "" && nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

  const groups: PublicGroup[] = (Array.isArray(src.groups) ? src.groups : [])
    .filter(isObj)
    .slice(0, LIMITS.groups)
    .map((g) => ({
      id: str(g.id, 64),
      title: str(g.title, LIMITS.titleChars),
      memberIds: Array.isArray(g.memberIds) ? g.memberIds.filter((m): m is string => typeof m === "string" && nodeIds.has(m)) : [],
    }))
    .filter((g) => g.id !== "");

  return { nodes, edges, groups };
}

/** Builds the public view from raw database rows. Only the fields named here can ever be exposed. */
export function buildPublicView(input: { conversation: Row; messages: Row[]; now: Date }): PublicView {
  const conversationId = str(input.conversation.id, 64);
  const metadata = isObj(input.conversation.metadata) ? input.conversation.metadata : {};

  const messages: PublicMessage[] = input.messages
    .slice(0, LIMITS.messages)
    .filter((m) => (m.role === "user" || m.role === "assistant") && str(m.conversation_id, 64) === conversationId) // never system messages, never another conversation
    .map((m) => ({
      id: str(m.id, 64),
      role: m.role as "user" | "assistant",
      content: str(m.content, LIMITS.messageChars),
      createdAt: str(m.created_at, 40),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const content = {
    title: str(input.conversation.title, LIMITS.titleChars),
    canvas: sanitizeCanvas(metadata.canvas),
    conversation: { id: conversationId, updatedAt: str(input.conversation.updated_at, 40), messages },
  };

  return { ...content, etag: computeEtag(content), generatedAt: input.now.toISOString() };
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
