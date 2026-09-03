/**
 * TEMPORARY Phase 9 reliability regression audit.
 * Imports production validateActions / apply / graph helpers.
 * NVIDIA is not called.
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

const { validateActions } = await import(
  "../src/app/api/analyze/route.ts"
);
const { applyCanvasActions } = await import(
  "../src/app/lib/applyCanvasActions.ts"
);
const { parseMoveNodeAction } = await import(
  "../src/app/lib/moveNodeAction.ts"
);
const {
  parseGroupNodesAction,
  resolveGroupMemberIds,
} = await import("../src/app/lib/groupNodesAction.ts");
const {
  classifyGraphInsightIntent,
  isReadOnlyInsightRequest,
  isRecommendationIntent,
  buildGraphContext,
} = await import("../src/app/lib/graphContext.ts");

function readRouteSource() {
  return readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../src/app/api/analyze/route.ts"
    ),
    "utf8"
  ).replace(/\r\n/g, "\n");
}

const results = [];

function assert(category, name, ok, detail) {
  results.push({ category, name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  [${category}] ${name}${
      ok ? "" : " :: " + detail
    }`
  );
}

function typesOf(actions) {
  return actions.map((a) => a.type).join(",");
}

const canvas = {
  nodes: [
    {
      id: "sales",
      nodeType: "problem",
      title: "Sales performance",
      description: "Declining",
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
    {
      id: "e2",
      sourceId: "verify",
      targetId: "sales",
      sourceTitle: "Weak lead verification",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ],
  groups: [],
};

// --- Supported actions ---
{
  const empty = { nodes: [], edges: [], groups: [] };
  const validated = validateActions(empty, [
    {
      type: "CREATE_NODE",
      nodeType: "problem",
      title: "Sales performance",
      description: "Decline",
    },
  ]);
  const next = applyCanvasActions(empty, validated);
  assert(
    "actions",
    "CREATE_NODE",
    validated.length === 1 &&
      next.nodes.length === 1 &&
      next.nodes[0].title === "Sales performance",
    typesOf(validated)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "CREATE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Weak lead verification",
      relationship: "related to",
    },
  ]);
  const next = applyCanvasActions(canvas, validated);
  assert(
    "actions",
    "CREATE_EDGE",
    validated.length === 1 && next.edges.length === 3,
    typesOf(validated)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "UPDATE_NODE",
      targetTitle: "Poor lead quality",
      updates: { title: "Lead quality issues" },
    },
  ]);
  const next = applyCanvasActions(canvas, validated);
  assert(
    "actions",
    "UPDATE_NODE",
    validated.length === 1 &&
      next.nodes.find((n) => n.id === "lead")?.title ===
        "Lead quality issues",
    typesOf(validated)
  );
}

{
  const validated = validateActions(canvas, [
    { type: "DELETE_NODE", targetTitle: "Poor lead quality" },
  ]);
  const next = applyCanvasActions(canvas, validated);
  assert(
    "actions",
    "DELETE_NODE",
    validated.length === 1 &&
      next.nodes.length === 2 &&
      !next.nodes.some((n) => n.id === "lead") &&
      next.edges.length === 1,
    `nodes=${next.nodes.length} edges=${next.edges.length}`
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "DELETE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  const next = applyCanvasActions(canvas, validated);
  assert(
    "actions",
    "DELETE_EDGE",
    validated.length === 1 && next.edges.length === 1,
    String(next.edges.length)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "MOVE_NODE",
      targetTitle: "Poor lead quality",
      position: { x: 400, y: 80 },
    },
  ]);
  const next = applyCanvasActions(canvas, validated);
  const moved = next.nodes.find((n) => n.id === "lead");
  assert(
    "actions",
    "MOVE_NODE",
    validated.length === 1 &&
      moved.position.x === 400 &&
      moved.position.y === 80 &&
      moved.title === "Poor lead quality",
    JSON.stringify(moved?.position)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "GROUP_NODES",
      nodeTitles: ["Poor lead quality", "Weak lead verification"],
      groupTitle: "Root Causes",
    },
  ]);
  const next = applyCanvasActions(canvas, validated);
  assert(
    "actions",
    "GROUP_NODES",
    validated.length === 1 &&
      next.groups.length === 1 &&
      next.groups[0].title === "Root Causes" &&
      next.nodes.length === 3,
    JSON.stringify(next.groups[0]?.memberIds)
  );
}

// --- Multi-action ---
{
  const start = {
    nodes: [
      {
        id: "sales",
        nodeType: "problem",
        title: "Sales performance",
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
    groups: [],
  };
  const validated = validateActions(start, [
    {
      type: "CREATE_NODE",
      nodeType: "problem",
      title: "Poor lead quality",
      description: "Cause",
    },
    {
      type: "CREATE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  const next = applyCanvasActions(start, validated);
  assert(
    "multi-action",
    "CREATE_NODE then CREATE_EDGE",
    typesOf(validated) === "CREATE_NODE,CREATE_EDGE" &&
      next.nodes.length === 2 &&
      next.edges.length === 1,
    typesOf(validated)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "UPDATE_NODE",
      targetTitle: "Poor lead quality",
      updates: { description: "Updated" },
    },
    {
      type: "MOVE_NODE",
      targetTitle: "Sales performance",
      position: { x: 9, y: 9 },
    },
  ]);
  const next = applyCanvasActions(canvas, validated);
  assert(
    "multi-action",
    "multiple valid actions in one response",
    typesOf(validated) === "UPDATE_NODE,MOVE_NODE" &&
      next.nodes.find((n) => n.id === "lead")?.description ===
        "Updated" &&
      next.nodes.find((n) => n.id === "sales")?.position.x === 9,
    typesOf(validated)
  );
}

// --- Safety ---
{
  const validated = validateActions(canvas, [
    {
      type: "CREATE_NODE",
      title: "Poor lead quality",
      nodeType: "problem",
    },
  ]);
  assert(
    "safety",
    "duplicate CREATE_NODE rejected",
    validated.length === 0,
    String(validated.length)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "CREATE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  assert(
    "safety",
    "duplicate CREATE_EDGE rejected",
    validated.length === 0,
    String(validated.length)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "CREATE_EDGE",
      sourceTitle: "Missing node",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  assert(
    "safety",
    "nonexistent CREATE_EDGE endpoints rejected",
    validated.length === 0,
    String(validated.length)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "UPDATE_NODE",
      targetTitle: "Does not exist",
      updates: { title: "X" },
    },
  ]);
  assert(
    "safety",
    "nonexistent UPDATE_NODE rejected",
    validated.length === 0,
    String(validated.length)
  );
}

{
  const validated = validateActions(canvas, [
    { type: "DELETE_NODE", targetTitle: "Does not exist" },
  ]);
  assert(
    "safety",
    "nonexistent DELETE_NODE rejected",
    validated.length === 0,
    String(validated.length)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "DELETE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Weak lead verification",
      relationship: "causes",
    },
  ]);
  assert(
    "safety",
    "nonexistent DELETE_EDGE rejected",
    validated.length === 0,
    String(validated.length)
  );
}

{
  const malformedMove = {
    type: "MOVE_NODE",
    targetTitle: "Poor lead quality",
    position: { x: "400", y: 80 },
  };
  assert(
    "safety",
    "malformed MOVE_NODE rejected",
    parseMoveNodeAction(malformedMove) === null &&
      validateActions(canvas, [malformedMove]).length === 0,
    "accepted"
  );
}

{
  const malformedGroup = {
    type: "GROUP_NODES",
    nodeTitles: [],
    groupTitle: "Root Causes",
  };
  assert(
    "safety",
    "malformed GROUP_NODES rejected",
    parseGroupNodesAction(malformedGroup) === null &&
      validateActions(canvas, [malformedGroup]).length === 0,
    "accepted"
  );
}

{
  const missing = {
    type: "GROUP_NODES",
    nodeTitles: ["Poor lead quality", "Missing"],
    groupTitle: "Root Causes",
  };
  const dupCanvas = {
    ...canvas,
    nodes: [
      ...canvas.nodes,
      { id: "dup", title: "Poor lead quality" },
    ],
  };
  const ambiguous = {
    type: "GROUP_NODES",
    nodeTitles: ["Poor lead quality"],
    groupTitle: "Dup",
  };
  assert(
    "safety",
    "ambiguous/missing GROUP_NODES members rejected",
    resolveGroupMemberIds(canvas.nodes, ["Missing"]) === null &&
      validateActions(canvas, [missing]).length === 0 &&
      resolveGroupMemberIds(dupCanvas.nodes, ["Poor lead quality"]) ===
        null &&
      validateActions(dupCanvas, [ambiguous]).length === 0,
    "accepted"
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "UPDATE_NODE",
      targetTitle: "Poor lead quality",
      updates: { title: "Sales performance" },
    },
  ]);
  assert(
    "safety",
    "rename collision rejected",
    validated.length === 0,
    String(validated.length)
  );
}

{
  const validated = validateActions(canvas, [
    { type: "DELETE_NODE", targetTitle: "Poor lead quality" },
    {
      type: "CREATE_EDGE",
      sourceTitle: "Weak lead verification",
      targetTitle: "Poor lead quality",
      relationship: "related to",
    },
  ]);
  assert(
    "safety",
    "deleting a node removes connected temporary edges",
    typesOf(validated) === "DELETE_NODE" &&
      !validated.some((a) => a.type === "CREATE_EDGE"),
    typesOf(validated)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "UPDATE_NODE",
      targetTitle: "Poor lead quality",
      updates: { title: "Lead quality issues" },
    },
    {
      type: "DELETE_EDGE",
      sourceTitle: "Lead quality issues",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  assert(
    "safety",
    "renaming a node updates temporary edge references",
    typesOf(validated) === "UPDATE_NODE,DELETE_EDGE",
    typesOf(validated)
  );
}

// --- Graph / conversation intelligence ---
{
  const ctx = buildGraphContext(canvas.nodes, canvas.edges);
  const titles = ctx.nodes.map((n) => n.title).sort();
  assert(
    "graph",
    "graph context remains intact",
    titles.join(",") ===
      "Poor lead quality,Sales performance,Weak lead verification" &&
      ctx.edges.length === 2,
    JSON.stringify(titles)
  );
}

{
  const validated = validateActions(canvas, [
    {
      type: "CREATE_NODE",
      title: "Poor lead quality",
      nodeType: "problem",
    },
    {
      type: "CREATE_EDGE",
      sourceTitle: "Poor lead quality",
      targetTitle: "Sales performance",
      relationship: "causes",
    },
  ]);
  assert(
    "graph",
    "existing canvas nodes reused / titles not duplicated",
    validated.length === 0,
    typesOf(validated)
  );
}

{
  const routeSrc = readRouteSource();
  assert(
    "graph",
    'prompt still resolves "it" / "that" / "this problem"',
    routeSrc.includes('"it"') &&
      routeSrc.includes("this problem") &&
      routeSrc.includes("REFERENCE RESOLUTION"),
    "prompt missing reference resolution"
  );
}

{
  const insight = "What are the main problems?";
  const rec = "What should we focus on next?";
  const explicit = "Add a solution for Poor lead quality";
  const insightActions = isReadOnlyInsightRequest(insight)
    ? []
    : [{ type: "CREATE_NODE", title: "X" }];
  const recActions = isReadOnlyInsightRequest(rec)
    ? []
    : [{ type: "CREATE_NODE", title: "X" }];
  const explicitReadOnly = isReadOnlyInsightRequest(explicit);
  assert(
    "graph",
    "read-only insight cannot mutate canvas",
    isReadOnlyInsightRequest(insight) === true &&
      classifyGraphInsightIntent(insight) === "main_problems" &&
      insightActions.length === 0,
    classifyGraphInsightIntent(insight)
  );
  assert(
    "graph",
    "recommendation does not keep actions unless explicit mutate intent",
    isRecommendationIntent(classifyGraphInsightIntent(rec)) &&
      isReadOnlyInsightRequest(rec) &&
      recActions.length === 0 &&
      explicitReadOnly === false,
    classifyGraphInsightIntent(rec)
  );
}

// --- Reliability: JSON recovery (production helpers, inlined to match route.ts) ---
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
    if (ch === "{") {
      depth += 1;
      continue;
    }
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
  const extractedFromTrimmed = extractOutermostJsonObject(trimmed);
  const extractedFromUnfenced = extractOutermostJsonObject(unfenced);
  if (extractedFromTrimmed) candidates.push(extractedFromTrimmed);
  if (extractedFromUnfenced) candidates.push(extractedFromUnfenced);
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return tryParseJson(candidate);
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
    if (recovered !== undefined) return { ok: true, value: recovered };
    return { ok: false };
  }
}

{
  const src = readRouteSource();
  assert(
    "reliability",
    "route still contains parseAiResponseContent + recoverAiJson",
    src.includes("function parseAiResponseContent") &&
      src.includes("function recoverAiJson") &&
      src.includes("I couldn't reliably interpret that response. Please try again."),
    "helpers missing"
  );
}

{
  const valid = parseAiResponseContent(
    '{"message":"ok","actions":[{"type":"CREATE_NODE","title":"A"}]}'
  );
  assert(
    "reliability",
    "valid JSON → normal pipeline object",
    valid.ok &&
      valid.value.message === "ok" &&
      valid.value.actions[0].type === "CREATE_NODE",
    JSON.stringify(valid)
  );
}

{
  const fenced = parseAiResponseContent(
    '```json\n{"message":"fenced","actions":[]}\n```'
  );
  const wrapped = parseAiResponseContent(
    'Sure.\n{"message":"wrapped","actions":[]}\nThanks'
  );
  assert(
    "reliability",
    "fenced/wrapped JSON recovered",
    fenced.ok &&
      fenced.value.message === "fenced" &&
      wrapped.ok &&
      wrapped.value.message === "wrapped",
    JSON.stringify({ fenced, wrapped })
  );
}

{
  const bad = parseAiResponseContent("not json at all {{{");
  assert(
    "reliability",
    "unrecoverable JSON fails closed (route maps to HTTP 200 empty actions)",
    bad.ok === false,
    JSON.stringify(bad)
  );
}

function isNvidiaTimeoutError(error) {
  return error instanceof APIConnectionTimeoutError;
}
function isNvidiaProviderUnavailableError(error) {
  return error instanceof APIError && error.status === 503;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSingle503Retry(attempt) {
  try {
    return await attempt();
  } catch (error) {
    if (isNvidiaTimeoutError(error)) throw error;
    if (!isNvidiaProviderUnavailableError(error)) throw error;
    await wait(10);
    return await attempt();
  }
}

{
  const src = readRouteSource();
  const maxRetriesMatches = [
    ...src.matchAll(/maxRetries:\s*(\d+)/g),
  ].map((m) => m[1]);
  assert(
    "reliability",
    "maxRetries remains 0",
    maxRetriesMatches.length === 1 && maxRetriesMatches[0] === "0",
    JSON.stringify(maxRetriesMatches)
  );
  assert(
    "reliability",
    "60-second timeout constant",
    src.includes("const NVIDIA_REQUEST_TIMEOUT_MS = 60_000") &&
      src.includes("timeout: NVIDIA_REQUEST_TIMEOUT_MS"),
    "timeout missing"
  );
  const timeoutIdx = src.indexOf("if (isNvidiaTimeoutError(error))");
  const unavailableIdx = src.indexOf(
    "if (isNvidiaProviderUnavailableError(error))"
  );
  const retryTimeoutFirst = src.includes(
    `if (isNvidiaTimeoutError(error)) {
      throw error;
    }`
  );
  assert(
    "reliability",
    "timeout detected before 503 handling; timeout never retries",
    timeoutIdx !== -1 &&
      unavailableIdx !== -1 &&
      timeoutIdx < unavailableIdx &&
      retryTimeoutFirst,
    `timeout@${timeoutIdx} 503@${unavailableIdx}`
  );
}

{
  let attempts = 0;
  const err503 = new InternalServerError(
    503,
    { message: "unavailable" },
    "unavailable",
    new Headers()
  );
  const value = await withSingle503Retry(async () => {
    attempts += 1;
    if (attempts === 1) throw err503;
    return "ok";
  });
  assert(
    "reliability",
    "first 503 → exactly one retry",
    attempts === 2 && value === "ok",
    `attempts=${attempts}`
  );
}

{
  let attempts = 0;
  const err503 = new InternalServerError(
    503,
    { message: "unavailable" },
    "unavailable",
    new Headers()
  );
  let threw = null;
  try {
    await withSingle503Retry(async () => {
      attempts += 1;
      throw err503;
    });
  } catch (e) {
    threw = e;
  }
  assert(
    "reliability",
    "second 503 rethrows provider unavailable (route maps to HTTP 200)",
    attempts === 2 && isNvidiaProviderUnavailableError(threw),
    `attempts=${attempts}`
  );
}

{
  let attempts = 0;
  let threw = null;
  try {
    await withSingle503Retry(async () => {
      attempts += 1;
      throw new APIConnectionTimeoutError();
    });
  } catch (e) {
    threw = e;
  }
  assert(
    "reliability",
    "timeout never triggers retry",
    attempts === 1 && isNvidiaTimeoutError(threw),
    `attempts=${attempts}`
  );
}

{
  const cases = [400, 401, 403, 404, 429, 500, 502, 504];
  const outcomes = [];
  for (const status of cases) {
    let attempts = 0;
    const err = new APIError(
      status,
      { message: "x" },
      "x",
      new Headers()
    );
    try {
      await withSingle503Retry(async () => {
        attempts += 1;
        throw err;
      });
    } catch {
      /* expected */
    }
    outcomes.push({ status, attempts });
  }
  assert(
    "reliability",
    "non-503 errors never trigger retry",
    outcomes.every((o) => o.attempts === 1),
    JSON.stringify(outcomes)
  );
}

{
  const src = readRouteSource();
  assert(
    "accidental-change",
    "model / sampling / prompts unchanged",
    src.includes('model:\n            "nvidia/nemotron-3-ultra-550b-a55b"') &&
      src.includes("temperature: 0.2") &&
      src.includes("top_p: 0.7") &&
      src.includes("max_tokens: 900") &&
      src.includes('reasoning_effort: "none"') &&
      src.includes("You are Echo, a conversational AI collaborative workspace partner") &&
      src.includes("GROUP_NODES") &&
      src.includes("MOVE_NODE"),
    "model or prompt drift"
  );
}

const failed = results.filter((r) => !r.ok);
const byCat = {};
for (const r of results) {
  byCat[r.category] ??= { pass: 0, fail: 0, total: 0 };
  byCat[r.category].total += 1;
  if (r.ok) byCat[r.category].pass += 1;
  else byCat[r.category].fail += 1;
}
console.log("\n=== CATEGORY SUMMARY ===");
for (const [cat, s] of Object.entries(byCat)) {
  console.log(`${s.fail ? "FAIL" : "PASS"}  ${cat}: ${s.pass}/${s.total}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
if (failed.length) process.exit(1);
