/**
 * TEMPORARY Phase 9.R5 / 9.R6 regression.
 * Production imports. NVIDIA is not called.
 */
process.env.NVIDIA_API_KEY =
  process.env.NVIDIA_API_KEY || "dummy-key-for-tests";
process.env.OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || "dummy-key-for-tests";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APIConnectionTimeoutError,
  APIError,
  InternalServerError,
} from "openai";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const routeSrc = readFileSync(
  join(ROOT, "src/app/api/analyze/route.ts"),
  "utf8"
).replace(/\r\n/g, "\n");
const pageSrc = readFileSync(join(ROOT, "src/app/page.tsx"), "utf8").replace(
  /\r\n/g,
  "\n"
);

const { validateActions } = await import("../src/app/api/analyze/route.ts");
const { applyCanvasActions } = await import(
  "../src/app/lib/applyCanvasActions.ts"
);
const { deduplicateActions } = await import(
  "../src/app/lib/deduplicateActions.ts"
);
const { parseMoveNodeAction } = await import("../src/app/lib/moveNodeAction.ts");
const { parseGroupNodesAction } = await import(
  "../src/app/lib/groupNodesAction.ts"
);
const {
  classifyGraphInsightIntent,
  isReadOnlyInsightRequest,
  buildGraphContext,
} = await import("../src/app/lib/graphContext.ts");

const results = [];
function assert(cat, name, ok, detail) {
  results.push({ cat, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  [${cat}] ${name}${ok ? "" : " :: " + detail}`);
}
function types(actions) {
  return actions.map((a) => a.type).join(",");
}

const canvas = {
  nodes: [
    {
      id: "sales",
      nodeType: "problem",
      title: "Sales performance",
      position: { x: 360, y: 320 },
    },
    {
      id: "lead",
      nodeType: "problem",
      title: "Poor lead quality",
      position: { x: 360, y: 40 },
    },
    {
      id: "verify",
      nodeType: "problem",
      title: "Weak lead verification",
      position: { x: 40, y: 40 },
    },
  ],
  edges: [
    {
      id: "e1",
      sourceId: "lead",
      targetId: "sales",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ],
  groups: [],
};

const empty = { nodes: [], edges: [], groups: [] };

{
  const v = validateActions(empty, [
    { type: "CREATE_NODE", nodeType: "problem", title: "A" },
  ]);
  const next = applyCanvasActions(empty, v);
  assert("actions", "CREATE_NODE valid", v.length === 1 && next.nodes[0].title === "A", types(v));
}
{
  const v = validateActions(canvas, [
    { type: "CREATE_NODE", title: "Poor lead quality", nodeType: "problem" },
  ]);
  assert("actions", "CREATE_NODE duplicate on canvas rejected", v.length === 0, types(v));
}
{
  const v = validateActions(empty, [{ type: "CREATE_NODE", nodeType: "problem" }]);
  assert("actions", "CREATE_NODE missing title rejected", v.length === 0, types(v));
}
{
  const v = validateActions(empty, [
    { type: "CREATE_NODE", title: "A", nodeType: "problem" },
    { type: "CREATE_NODE", title: "A", nodeType: "problem" },
  ]);
  assert("actions", "CREATE_NODE repeated identical deduped", types(v) === "CREATE_NODE", types(v));
}

{
  const v = validateActions(canvas, [
    {
      type: "CREATE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Weak lead verification",
      relationship: "related to",
    },
  ]);
  assert("actions", "CREATE_EDGE valid", v.length === 1, types(v));
}
{
  const v = validateActions(canvas, [
    {
      type: "CREATE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  assert("actions", "CREATE_EDGE duplicate rejected", v.length === 0, types(v));
}
{
  const v = validateActions(canvas, [
    { type: "CREATE_EDGE", targetTitle: "Sales performance", relationship: "causes" },
  ]);
  assert("actions", "CREATE_EDGE missing source rejected", v.length === 0, types(v));
}
{
  const v = validateActions(canvas, [
    { type: "CREATE_EDGE", sourceTitle: "Poor lead quality", relationship: "causes" },
  ]);
  assert("actions", "CREATE_EDGE missing target rejected", v.length === 0, types(v));
}
{
  const v = validateActions(canvas, [
    {
      type: "CREATE_EDGE",
      sourceTitle: "Missing",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  assert("actions", "CREATE_EDGE nonexistent endpoint rejected", v.length === 0, types(v));
}

{
  const v = validateActions(canvas, [
    { type: "UPDATE_NODE", targetTitle: "Poor lead quality", updates: { title: "Lead quality issues" } },
  ]);
  const next = applyCanvasActions(canvas, v);
  assert("actions", "UPDATE_NODE valid", next.nodes.find((n) => n.id === "lead")?.title === "Lead quality issues", types(v));
}
{
  const v = validateActions(canvas, [
    { type: "UPDATE_NODE", targetTitle: "Nope", updates: { title: "X" } },
  ]);
  assert("actions", "UPDATE_NODE nonexistent rejected", v.length === 0, types(v));
}
{
  const v = validateActions(canvas, [
    { type: "UPDATE_NODE", targetTitle: "Poor lead quality", updates: { title: "Sales performance" } },
  ]);
  assert("actions", "UPDATE_NODE rename collision rejected", v.length === 0, types(v));
}
{
  const v = validateActions(canvas, [
    { type: "UPDATE_NODE", targetTitle: "Poor lead quality", updates: { description: "x" } },
    { type: "UPDATE_NODE", targetTitle: "Poor lead quality", updates: { description: "x" } },
  ]);
  assert("actions", "UPDATE_NODE identical duplicate deduped", types(v) === "UPDATE_NODE", types(v));
}

{
  const v = validateActions(canvas, [{ type: "DELETE_NODE", targetTitle: "Poor lead quality" }]);
  const next = applyCanvasActions(canvas, v);
  assert(
    "actions",
    "DELETE_NODE valid + connected edges removed",
    v.length === 1 && next.nodes.length === 2 && next.edges.length === 0,
    `nodes=${next.nodes.length} edges=${next.edges.length}`
  );
}
{
  const v = validateActions(canvas, [{ type: "DELETE_NODE", targetTitle: "Nope" }]);
  assert("actions", "DELETE_NODE nonexistent rejected", v.length === 0, types(v));
}
{
  const v = validateActions(canvas, [
    { type: "DELETE_NODE", targetTitle: "Poor lead quality" },
    { type: "DELETE_NODE", targetTitle: "Poor lead quality" },
  ]);
  assert("actions", "DELETE_NODE duplicate delete", types(v) === "DELETE_NODE", types(v));
}

{
  const v = validateActions(canvas, [
    {
      type: "DELETE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  assert("actions", "DELETE_EDGE valid", v.length === 1, types(v));
}
{
  const v = validateActions(canvas, [
    {
      type: "DELETE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Weak lead verification",
      relationship: "causes",
    },
  ]);
  assert("actions", "DELETE_EDGE nonexistent rejected", v.length === 0, types(v));
}
{
  const v = validateActions(canvas, [
    {
      type: "DELETE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
    {
      type: "DELETE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  assert("actions", "DELETE_EDGE duplicate delete", types(v) === "DELETE_EDGE", types(v));
}

{
  const v = validateActions(canvas, [
    { type: "MOVE_NODE", targetTitle: "Poor lead quality", position: { x: 1, y: 2 } },
  ]);
  const next = applyCanvasActions(canvas, v);
  const moved = next.nodes.find((n) => n.id === "lead");
  assert("actions", "MOVE_NODE valid", moved.position.x === 1 && moved.position.y === 2, JSON.stringify(moved.position));
}
{
  const v = validateActions(canvas, [
    { type: "MOVE_NODE", targetTitle: "Nope", position: { x: 1, y: 2 } },
  ]);
  assert("actions", "MOVE_NODE nonexistent rejected", v.length === 0, types(v));
}
{
  const bad = { type: "MOVE_NODE", targetTitle: "Poor lead quality", position: { x: "1", y: 2 } };
  assert(
    "actions",
    "MOVE_NODE malformed rejected",
    parseMoveNodeAction(bad) === null && validateActions(canvas, [bad]).length === 0,
    "accepted"
  );
}
{
  const v = validateActions(canvas, [
    { type: "MOVE_NODE", targetTitle: "Poor lead quality", position: { x: 9, y: 9 } },
    { type: "MOVE_NODE", targetTitle: "Poor lead quality", position: { x: 9, y: 9 } },
  ]);
  assert("actions", "MOVE_NODE identical duplicate deduped", types(v) === "MOVE_NODE", types(v));
}

{
  const v = validateActions(canvas, [
    {
      type: "GROUP_NODES",
      nodeTitles: ["Poor lead quality", "Weak lead verification"],
      groupTitle: "Root Causes",
    },
  ]);
  assert("actions", "GROUP_NODES valid", v.length === 1, types(v));
}
{
  const v = validateActions(canvas, [
    {
      type: "GROUP_NODES",
      nodeTitles: ["Poor lead quality", "Weak lead verification"],
      groupTitle: "Root Causes",
    },
    {
      type: "GROUP_NODES",
      nodeTitles: ["Weak lead verification", "Poor lead quality"],
      groupTitle: "Root Causes",
    },
  ]);
  assert("actions", "GROUP_NODES identical duplicate deduped", types(v) === "GROUP_NODES", types(v));
}
{
  const dupCanvas = {
    ...canvas,
    nodes: [...canvas.nodes, { id: "dup", title: "Poor lead quality" }],
  };
  const v = validateActions(dupCanvas, [
    { type: "GROUP_NODES", nodeTitles: ["Poor lead quality"], groupTitle: "G" },
  ]);
  assert("actions", "GROUP_NODES ambiguous rejected", v.length === 0, types(v));
}
{
  const v = validateActions(canvas, [
    { type: "GROUP_NODES", nodeTitles: ["Poor lead quality", "Missing"], groupTitle: "G" },
  ]);
  assert("actions", "GROUP_NODES missing members rejected", v.length === 0, types(v));
}
{
  assert(
    "actions",
    "GROUP_NODES malformed rejected",
    parseGroupNodesAction({ type: "GROUP_NODES", nodeTitles: [], groupTitle: "G" }) === null,
    "parsed"
  );
}

{
  const v = validateActions(empty, [
    { type: "CREATE_NODE", title: "A", nodeType: "problem" },
    { type: "CREATE_NODE", title: "B", nodeType: "problem" },
    { type: "CREATE_EDGE", sourceTitle: "A", targetTitle: "B", relationship: "causes" },
  ]);
  const next = applyCanvasActions(empty, v);
  assert(
    "multi",
    "CREATE A,B then EDGE A->B",
    types(v) === "CREATE_NODE,CREATE_NODE,CREATE_EDGE" && next.nodes.length === 2 && next.edges.length === 1,
    types(v)
  );
}
{
  const v = validateActions(empty, [
    { type: "CREATE_NODE", title: "A", nodeType: "problem" },
    { type: "CREATE_NODE", title: "B", nodeType: "problem" },
    { type: "CREATE_NODE", title: "C", nodeType: "problem" },
    { type: "CREATE_EDGE", sourceTitle: "A", targetTitle: "B", relationship: "causes" },
    { type: "CREATE_EDGE", sourceTitle: "B", targetTitle: "C", relationship: "causes" },
  ]);
  assert("multi", "A-B-C chain intact", types(v) === "CREATE_NODE,CREATE_NODE,CREATE_NODE,CREATE_EDGE,CREATE_EDGE", types(v));
}
{
  const v = validateActions(canvas, [
    {
      type: "CREATE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Weak lead verification",
      relationship: "related to",
    },
    {
      type: "CREATE_EDGE",
      sourceTitle: "Weak lead verification",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  assert("multi", "two different edges kept", types(v) === "CREATE_EDGE,CREATE_EDGE", types(v));
}
{
  const v = validateActions(canvas, [
    { type: "UPDATE_NODE", targetTitle: "Poor lead quality", updates: { description: "a" } },
    { type: "UPDATE_NODE", targetTitle: "Sales performance", updates: { description: "b" } },
  ]);
  assert("multi", "two legitimate updates kept", types(v) === "UPDATE_NODE,UPDATE_NODE", types(v));
}
{
  const v = validateActions(empty, [
    { type: "CREATE_NODE", title: "A", nodeType: "problem" },
    { type: "CREATE_NODE", title: "B", nodeType: "problem" },
    { type: "CREATE_EDGE", sourceTitle: "A", targetTitle: "B", relationship: "causes" },
    { type: "UPDATE_NODE", targetTitle: "A", updates: { description: "x" } },
    { type: "MOVE_NODE", targetTitle: "B", position: { x: 4, y: 5 } },
  ]);
  assert(
    "multi",
    "CREATE UPDATE MOVE EDGE sequence",
    types(v) === "CREATE_NODE,CREATE_NODE,CREATE_EDGE,UPDATE_NODE,MOVE_NODE",
    types(v)
  );
}

{
  const d = deduplicateActions([
    { type: "CREATE_NODE", title: "A", nodeType: "problem" },
    { type: "CREATE_NODE", title: "B", nodeType: "problem" },
    { type: "CREATE_EDGE", sourceTitle: "A", targetTitle: "B", relationship: "causes" },
  ]);
  assert("dedupe", "does not break A B edge chain", d.length === 3, String(d.length));
}

{
  const ctx = buildGraphContext(canvas.nodes, canvas.edges);
  assert("graph", "graph context intact", ctx.nodes.length === 3 && ctx.edges.length === 1, String(ctx.nodes.length));
}
{
  const v = validateActions(canvas, [
    { type: "CREATE_NODE", title: "Poor lead quality", nodeType: "problem" },
  ]);
  assert("graph", "existing titles not duplicated", v.length === 0, types(v));
}
assert(
  "graph",
  "prompt still has reference/causal rules",
  routeSrc.includes("REFERENCE RESOLUTION") &&
    routeSrc.includes("this problem") &&
    routeSrc.includes("CAUSAL SIBLING RULE"),
  "prompt missing"
);

{
  const insightQs = [
    "What are the main problems?",
    "Why is sales performance declining?",
    "What do we currently have on the canvas?",
    "What should we consider next?",
  ];
  const allReadOnly = insightQs.every((q) => isReadOnlyInsightRequest(q));
  assert("readonly", "insight/recommendation questions are read-only", allReadOnly, insightQs.map((q) => classifyGraphInsightIntent(q)).join(","));
}
assert(
  "readonly",
  "mutation phrasing is not read-only",
  isReadOnlyInsightRequest("We have poor lead quality.") === false &&
    isReadOnlyInsightRequest("Add a solution for Poor lead quality") === false,
  classifyGraphInsightIntent("We have poor lead quality.")
);

assert(
  "persist",
  "conversation/canvas localStorage + switchConversation exist",
  pageSrc.includes('STORAGE_KEY = "echo-conversations"') &&
    pageSrc.includes("localStorage.setItem") &&
    pageSrc.includes("const switchConversation") &&
    pageSrc.includes("normalizeLoadedCanvas(selectedConversation.canvas)") &&
    pageSrc.includes("currentCanvas: canvas"),
  "missing persistence"
);

function tryParseJson(text) {
  return JSON.parse(text);
}
function stripMarkdownCodeFences(text) {
  let next = text.trim();
  if (!next.startsWith("```")) return next;
  next = next.replace(/^```(?:json)?\s*/i, "");
  next = next.replace(/\s*```$/i, "");
  return next.trim();
}
function extractOutermostJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
function recoverAiJson(content) {
  const trimmed = content.trim();
  const unfenced = stripMarkdownCodeFences(trimmed);
  const candidates = [trimmed, unfenced];
  const a = extractOutermostJsonObject(trimmed);
  const b = extractOutermostJsonObject(unfenced);
  if (a) candidates.push(a);
  if (b) candidates.push(b);
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    try {
      return tryParseJson(c);
    } catch {
      continue;
    }
  }
  return undefined;
}
function parseAiResponseContent(content) {
  try {
    return { ok: true, value: tryParseJson(content) };
  } catch {
    const recovered = recoverAiJson(content);
    return recovered !== undefined ? { ok: true, value: recovered } : { ok: false };
  }
}

assert("json", "valid JSON", parseAiResponseContent('{"message":"ok","actions":[]}').ok, "");
assert(
  "json",
  "fenced JSON",
  parseAiResponseContent('```json\n{"message":"f","actions":[]}\n```').value.message === "f",
  ""
);
assert(
  "json",
  "wrapped JSON",
  parseAiResponseContent('note {"message":"w","actions":[]} thanks').value.message === "w",
  ""
);
assert("json", "unrecoverable fails closed", parseAiResponseContent("{{{not json").ok === false, "");
assert(
  "json",
  "route still returns safe empty-actions message",
  routeSrc.includes("I couldn't reliably interpret that response. Please try again."),
  "missing"
);
assert(
  "json",
  "non-object parsed JSON rejected in route",
  routeSrc.includes("Array.isArray(parsed)"),
  "missing object guard"
);

assert("cfg", "timeout 60000", routeSrc.includes("const NVIDIA_REQUEST_TIMEOUT_MS = 60_000"), "");
assert("cfg", "maxRetries 0", /maxRetries:\s*0/.test(routeSrc) && !/maxRetries:\s*[1-9]/.test(routeSrc), "");
assert("cfg", "503 delay 750", routeSrc.includes("const NVIDIA_503_RETRY_DELAY_MS = 750"), "");
assert(
  "cfg",
  "model/sampling/non-stream",
  routeSrc.includes("nvidia/nemotron-3-ultra-550b-a55b") &&
    routeSrc.includes("temperature: 0.2") &&
    routeSrc.includes("top_p: 0.7") &&
    routeSrc.includes("max_tokens: 900") &&
    routeSrc.includes('reasoning_effort: "none"') &&
    !routeSrc.includes("stream: true"),
  "config drift"
);

function isTimeout(e) {
  return e instanceof APIConnectionTimeoutError;
}
function is503(e) {
  return e instanceof APIError && e.status === 503;
}
async function withSingle503Retry(attempt) {
  try {
    return await attempt();
  } catch (error) {
    if (isTimeout(error)) throw error;
    if (!is503(error)) throw error;
    await new Promise((r) => setTimeout(r, 5));
    return await attempt();
  }
}

{
  let n = 0;
  const err = new InternalServerError(503, { message: "x" }, "x", new Headers());
  const v = await withSingle503Retry(async () => {
    n += 1;
    if (n === 1) throw err;
    return "ok";
  });
  assert("rel", "503 retries once then success", n === 2 && v === "ok", String(n));
}
{
  let n = 0;
  const err = new InternalServerError(503, { message: "x" }, "x", new Headers());
  try {
    await withSingle503Retry(async () => {
      n += 1;
      throw err;
    });
  } catch {
    /* */
  }
  assert("rel", "two 503s = two attempts", n === 2, String(n));
}
{
  let n = 0;
  try {
    await withSingle503Retry(async () => {
      n += 1;
      throw new APIConnectionTimeoutError();
    });
  } catch {
    /* */
  }
  assert("rel", "timeout does not retry", n === 1, String(n));
}
{
  const statuses = [400, 401, 403, 404, 429, 500, 502, 504];
  let bad = false;
  for (const status of statuses) {
    let n = 0;
    try {
      await withSingle503Retry(async () => {
        n += 1;
        throw new APIError(status, { message: "x" }, "x", new Headers());
      });
    } catch {
      /* */
    }
    if (n !== 1) bad = true;
  }
  assert("rel", "non-503 HTTP errors do not retry", !bad, "");
}
assert(
  "rel",
  "timeout checked before 503 retry throw",
  routeSrc.indexOf("if (isNvidiaTimeoutError(error))") <
    routeSrc.indexOf("if (!isNvidiaProviderUnavailableError(error))"),
  "order"
);

assert("ux", "8s slow threshold", pageSrc.includes("const SLOW_RESPONSE_MS = 8000"), "");
assert("ux", "in-flight guard kept", pageSrc.includes("analyzeInFlightRef"), "");
assert(
  "ux",
  "thinking + still thinking + aria-live",
  pageSrc.includes("Echo is thinking...") &&
    pageSrc.includes("Echo is still thinking…") &&
    pageSrc.includes('aria-live="polite"') &&
    pageSrc.includes('aria-busy="true"'),
  "ux missing"
);
assert("ux", "Enter submit + Shift+Enter newline", pageSrc.includes("event.shiftKey") && pageSrc.includes('event.key !== "Enter"'), "");
assert("ux", "voice blocked while loading", pageSrc.includes("if (loading)") && pageSrc.includes("disabled={loading}"), "");
assert(
  "ux",
  "canvas not disabled by loading",
  /<EchoCanvas[\s\S]*?\/>/.test(pageSrc) &&
    !/<EchoCanvas[\s\S]*?\/>/.exec(pageSrc)[0].includes("disabled"),
  "canvas disabled"
);

const failed = results.filter((r) => !r.ok);
const by = {};
for (const r of results) {
  by[r.cat] ??= { p: 0, t: 0 };
  by[r.cat].t += 1;
  if (r.ok) by[r.cat].p += 1;
}
console.log("\n=== CATEGORY ===");
for (const [k, v] of Object.entries(by)) {
  console.log(`${v.p === v.t ? "PASS" : "FAIL"}  ${k}: ${v.p}/${v.t}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
if (failed.length) process.exit(1);
