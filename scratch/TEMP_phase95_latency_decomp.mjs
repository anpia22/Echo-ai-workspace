/**
 * TEMPORARY Phase 9.5 — NVIDIA latency decomposition.
 * NOT production. Does not modify /api/analyze.
 */
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const ROOT = process.cwd();
const OUT_JSONL = path.join(ROOT, "scratch", "TEMP_phase95_results.jsonl");
const OUT_SUMMARY = path.join(ROOT, "scratch", "TEMP_phase95_summary.json");

function loadKey() {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    if (line.startsWith("NVIDIA_API_KEY=")) {
      return line.slice("NVIDIA_API_KEY=".length).trim();
    }
  }
  throw new Error("NVIDIA_API_KEY missing");
}

function extractSystemPrompt(src) {
  const start = src.indexOf("content: `You are Echo");
  const from = src.indexOf("`", start);
  const end = src.indexOf("`,", from + 1);
  return src.slice(from + 1, end);
}

const routeSrc = fs.readFileSync(
  path.join(ROOT, "src", "app", "api", "analyze", "route.ts"),
  "utf8"
);
const SYSTEM_PROMPT = extractSystemPrompt(routeSrc);

function validateActions(canvas, actions) {
  const validActions = [];
  const tempNodes = [...(canvas.nodes || [])];
  const tempEdges = [...(canvas.edges || [])];

  for (const action of actions) {
    if (!action || typeof action !== "object") continue;

    if (action.type === "CREATE_NODE") {
      if (!action.title || typeof action.title !== "string") continue;
      if (tempNodes.some((n) => n.title === action.title)) continue;
      tempNodes.push({
        title: action.title,
        nodeType: action.nodeType,
        description: action.description,
      });
      validActions.push(action);
      continue;
    }

    if (action.type === "CREATE_EDGE") {
      if (!action.sourceTitle || !action.targetTitle) continue;
      const sourceExists = tempNodes.some((n) => n.title === action.sourceTitle);
      const targetExists = tempNodes.some((n) => n.title === action.targetTitle);
      if (!sourceExists || !targetExists) continue;
      const exists = tempEdges.some(
        (e) =>
          e.sourceTitle === action.sourceTitle &&
          e.targetTitle === action.targetTitle &&
          e.relationship === action.relationship
      );
      if (exists) continue;
      tempEdges.push({
        sourceTitle: action.sourceTitle,
        targetTitle: action.targetTitle,
        relationship: action.relationship,
      });
      validActions.push(action);
      continue;
    }

    if (action.type === "UPDATE_NODE") {
      if (
        !action.targetTitle ||
        typeof action.targetTitle !== "string" ||
        !action.updates ||
        typeof action.updates !== "object"
      ) {
        continue;
      }
      const nodeIndex = tempNodes.findIndex((n) => n.title === action.targetTitle);
      if (nodeIndex === -1) continue;
      const oldTitle = action.targetTitle;
      const newTitle = action.updates.title ?? oldTitle;
      if (newTitle !== oldTitle && tempNodes.some((n) => n.title === newTitle)) {
        continue;
      }
      tempNodes[nodeIndex] = {
        ...tempNodes[nodeIndex],
        title: newTitle,
        description: action.updates.description ?? tempNodes[nodeIndex].description,
        nodeType: action.updates.nodeType ?? tempNodes[nodeIndex].nodeType,
      };
      if (newTitle !== oldTitle) {
        for (let i = 0; i < tempEdges.length; i++) {
          if (tempEdges[i].sourceTitle === oldTitle) {
            tempEdges[i] = { ...tempEdges[i], sourceTitle: newTitle };
          }
          if (tempEdges[i].targetTitle === oldTitle) {
            tempEdges[i] = { ...tempEdges[i], targetTitle: newTitle };
          }
        }
      }
      validActions.push(action);
      continue;
    }

    if (action.type === "DELETE_NODE") {
      if (!action.targetTitle || typeof action.targetTitle !== "string") continue;
      const nodeIndex = tempNodes.findIndex((n) => n.title === action.targetTitle);
      if (nodeIndex === -1) continue;
      const deletedTitle = action.targetTitle;
      tempNodes.splice(nodeIndex, 1);
      for (let i = tempEdges.length - 1; i >= 0; i--) {
        if (
          tempEdges[i].sourceTitle === deletedTitle ||
          tempEdges[i].targetTitle === deletedTitle
        ) {
          tempEdges.splice(i, 1);
        }
      }
      validActions.push(action);
      continue;
    }

    if (action.type === "DELETE_EDGE") {
      if (!action.sourceTitle || !action.targetTitle) continue;
      const sourceExists = tempNodes.some((n) => n.title === action.sourceTitle);
      const targetExists = tempNodes.some((n) => n.title === action.targetTitle);
      if (!sourceExists || !targetExists) continue;
      const edgeIndex = tempEdges.findIndex((e) => {
        if (e.sourceTitle !== action.sourceTitle || e.targetTitle !== action.targetTitle) {
          return false;
        }
        if (action.relationship) return e.relationship === action.relationship;
        return true;
      });
      if (edgeIndex === -1) continue;
      tempEdges.splice(edgeIndex, 1);
      validActions.push(action);
      continue;
    }

    // Production validateActions rejects MOVE_NODE as unknown.
  }

  return validActions;
}

function buildUserMessage(conversationHistory, graphContext, extraBlocks, transcript) {
  return `RECENT CONVERSATION:

${JSON.stringify(conversationHistory, null, 2)}

CURRENT CANVAS GRAPH:

${JSON.stringify(graphContext, null, 2)}

${extraBlocks}

CURRENT USER MESSAGE:

${transcript}

Use the conversation history and CURRENT CANVAS GRAPH as context.

Understand the user's message naturally.

Do not assume that the user is giving a command.

Determine what the user means in the context of the ongoing conversation.

A single request may need multiple actions. Generate only the
minimum actions, in dependency order (CREATE_NODE before any
CREATE_EDGE that uses that new title). Prefer existing nodes.
Do not duplicate existing titles.
If the user asks to add a solution without naming it, or
confirms a prior recommendation with "do that" / "go ahead"
when one target is clear, invent a concise solution from
context and emit CREATE_NODE plus the needed CREATE_EDGE.
Do not ask them to name the solution first.
If several recommended targets are still equally valid,
ask which one and return "actions": [].

If the user asks a reasoning, insight, or recommendation
question about the workspace (main problems, causes,
solutions, unresolved items, workspace summary, evidence,
ranking, what to do next, what to focus on, coverage gaps,
or similar), inspect CURRENT CANVAS GRAPH, EXPLICIT
RELATIONSHIPS, GRAPH INSIGHT FACTS, and GRAPH
RECOMMENDATION FACTS first. Answer from those facts only.
Return "actions": [] unless they explicitly ask to modify
the canvas. Do not invent ranking, causality, solutions,
impact, or priority. Recommendations must stay
recommendations. If there is not enough evidence, say so
and return "actions": [].

If the message introduces meaningful information that belongs on the
workspace, create or update the appropriate canvas elements.

If the message is only conversational, respond naturally and return:

"actions": []

When referring to existing canvas nodes or edges, always use
their exact titles from CURRENT CANVAS GRAPH.

When resolving words such as "this", "that", "it", "this problem",
"that problem", "this solution", "that solution", "this decision",
"that relationship", "the previous problem", or similar references,
use both RECENT CONVERSATION and CURRENT CANVAS GRAPH.

Prefer the most recently discussed relevant object of that type.
Do not invent titles. Do not recreate deleted nodes.
Do not create a new node when the user is referring to an
existing canvas concept.
Do not invent relationships that are not explicit edges.

If a reference is genuinely ambiguous, ask a natural
clarification question and return:

"actions": []

If the user is revising, replacing, correcting, or renaming an
existing canvas concept, use UPDATE_NODE. Do not DELETE then CREATE.

If the user wants a concept removed entirely, use DELETE_NODE.

Return ONLY valid JSON.`;
}

const SCENARIOS = [
  {
    id: "E1",
    expect: ["CREATE_NODE"],
    transcript: "Sales performance is getting worse.",
    conversationHistory: [],
    canvas: { nodes: [], edges: [] },
    graphContext: { nodes: [], edges: [] },
    extra: `EXPLICIT RELATIONSHIPS:
- none

UPSTREAM CAUSES (nodes that cause something and are not themselves caused by an explicit causes edge):
- none (no explicit causes edges)

GRAPH INSIGHT FACTS (explicit graph only; do not invent):
NODE TYPES:
- none

PROBLEMS:
- none

SOLUTIONS:
- none

EXPLICIT CAUSES (source --causes--> target; do not reverse):
- none

EXPLICIT SOLVES (source --solves--> target; do not reverse):
- none

PROBLEMS WITH AT LEAST ONE SOLUTION:
- none

UNRESOLVED PROBLEMS (problem nodes with no incoming solves edge):
- none

RANKING ATTRIBUTES (priority / severity / impact / importance):
- none

GRAPH RECOMMENDATION FACTS (explicit structure only; recommendations, not decisions):
TOP-LEVEL PROBLEMS (problem nodes that are caused by something and do not themselves cause another node):
- none

STANDALONE PROBLEMS (problem nodes with no explicit causes edges in or out):
- none

UPSTREAM PROBLEM CAUSES (problem nodes that are the source of an explicit causes edge):
- none

UNRESOLVED CAUSES (upstream problem causes with no incoming solves edge):
- none

CAUSES THAT ALREADY HAVE A SOLUTION:
- none

SOLUTION COVERAGE GAPS (unresolved actionable problem causes, else unresolved standalone problems; not an impact ranking):
- none

TOP-LEVEL PROBLEMS WITH NO DIRECT SOLUTION WHOSE UPSTREAM CAUSES ARE SOLVED:
- none

RANKING ATTRIBUTES FOUND IN NODE TITLE/DESCRIPTION:
- none (do not invent priority, severity, impact, urgency, cost, or ROI)`,
  },
  {
    id: "E2",
    expect: ["CREATE_NODE", "CREATE_EDGE"],
    transcript: "Poor lead quality is one reason.",
    conversationHistory: [
      { role: "user", content: "Sales performance is getting worse." },
      {
        role: "assistant",
        content:
          "Got it. I've added 'Sales performance is getting worse' as a problem on the canvas.",
      },
    ],
    canvas: {
      nodes: [
        {
          title: "Sales performance is getting worse",
          nodeType: "problem",
        },
      ],
      edges: [],
    },
    graphContext: {
      nodes: [
        {
          id: "n1",
          title: "Sales performance is getting worse",
          nodeType: "problem",
        },
      ],
      edges: [],
    },
    extra: `EXPLICIT RELATIONSHIPS:
- none

UPSTREAM CAUSES (nodes that cause something and are not themselves caused by an explicit causes edge):
- none (no explicit causes edges)

GRAPH INSIGHT FACTS (explicit graph only; do not invent):
NODE TYPES:
- problem: Sales performance is getting worse

PROBLEMS:
- Sales performance is getting worse

SOLUTIONS:
- none

EXPLICIT CAUSES (source --causes--> target; do not reverse):
- none

EXPLICIT SOLVES (source --solves--> target; do not reverse):
- none

PROBLEMS WITH AT LEAST ONE SOLUTION:
- none

UNRESOLVED PROBLEMS (problem nodes with no incoming solves edge):
- Sales performance is getting worse

RANKING ATTRIBUTES (priority / severity / impact / importance):
- none

GRAPH RECOMMENDATION FACTS (explicit structure only; recommendations, not decisions):
TOP-LEVEL PROBLEMS (problem nodes that are caused by something and do not themselves cause another node):
- none

STANDALONE PROBLEMS (problem nodes with no explicit causes edges in or out):
- Sales performance is getting worse

UPSTREAM PROBLEM CAUSES (problem nodes that are the source of an explicit causes edge):
- none

UNRESOLVED CAUSES (upstream problem causes with no incoming solves edge):
- none

CAUSES THAT ALREADY HAVE A SOLUTION:
- none

SOLUTION COVERAGE GAPS (unresolved actionable problem causes, else unresolved standalone problems; not an impact ranking):
- Sales performance is getting worse

TOP-LEVEL PROBLEMS WITH NO DIRECT SOLUTION WHOSE UPSTREAM CAUSES ARE SOLVED:
- none

RANKING ATTRIBUTES FOUND IN NODE TITLE/DESCRIPTION:
- none (do not invent priority, severity, impact, urgency, cost, or ROI)`,
  },
  {
    id: "E4",
    expect: ["MOVE_NODE"],
    transcript: "Move Weak lead verification to the right.",
    conversationHistory: [],
    canvas: {
      nodes: [
        { title: "Sales performance is getting worse", nodeType: "problem" },
        { title: "Poor lead quality", nodeType: "problem" },
        { title: "Weak lead verification", nodeType: "problem" },
      ],
      edges: [
        {
          sourceTitle: "Poor lead quality",
          targetTitle: "Sales performance is getting worse",
          relationship: "causes",
        },
        {
          sourceTitle: "Weak lead verification",
          targetTitle: "Sales performance is getting worse",
          relationship: "causes",
        },
      ],
    },
    graphContext: {
      nodes: [
        { id: "n1", title: "Sales performance is getting worse", nodeType: "problem" },
        { id: "n2", title: "Poor lead quality", nodeType: "problem" },
        { id: "n3", title: "Weak lead verification", nodeType: "problem" },
      ],
      edges: [
        {
          source: "n2",
          target: "n1",
          sourceTitle: "Poor lead quality",
          targetTitle: "Sales performance is getting worse",
          relationship: "causes",
        },
        {
          source: "n3",
          target: "n1",
          sourceTitle: "Weak lead verification",
          targetTitle: "Sales performance is getting worse",
          relationship: "causes",
        },
      ],
    },
    extra: `EXPLICIT RELATIONSHIPS:
- Poor lead quality --causes--> Sales performance is getting worse
- Weak lead verification --causes--> Sales performance is getting worse

UPSTREAM CAUSES (nodes that cause something and are not themselves caused by an explicit causes edge):
- Poor lead quality
- Weak lead verification

GRAPH INSIGHT FACTS (explicit graph only; do not invent):
NODE TYPES:
- problem: Sales performance is getting worse, Poor lead quality, Weak lead verification

PROBLEMS:
- Sales performance is getting worse
- Poor lead quality
- Weak lead verification

SOLUTIONS:
- none

EXPLICIT CAUSES (source --causes--> target; do not reverse):
- Poor lead quality --causes--> Sales performance is getting worse
- Weak lead verification --causes--> Sales performance is getting worse

EXPLICIT SOLVES (source --solves--> target; do not reverse):
- none

PROBLEMS WITH AT LEAST ONE SOLUTION:
- none

UNRESOLVED PROBLEMS (problem nodes with no incoming solves edge):
- Sales performance is getting worse
- Poor lead quality
- Weak lead verification

RANKING ATTRIBUTES (priority / severity / impact / importance):
- none

GRAPH RECOMMENDATION FACTS (explicit structure only; recommendations, not decisions):
TOP-LEVEL PROBLEMS (problem nodes that are caused by something and do not themselves cause another node):
- Sales performance is getting worse

STANDALONE PROBLEMS (problem nodes with no explicit causes edges in or out):
- none

UPSTREAM PROBLEM CAUSES (problem nodes that are the source of an explicit causes edge):
- Poor lead quality
- Weak lead verification

UNRESOLVED CAUSES (upstream problem causes with no incoming solves edge):
- Poor lead quality
- Weak lead verification

CAUSES THAT ALREADY HAVE A SOLUTION:
- none

SOLUTION COVERAGE GAPS (unresolved actionable problem causes, else unresolved standalone problems; not an impact ranking):
- Poor lead quality
- Weak lead verification

TOP-LEVEL PROBLEMS WITH NO DIRECT SOLUTION WHOSE UPSTREAM CAUSES ARE SOLVED:
- none

RANKING ATTRIBUTES FOUND IN NODE TITLE/DESCRIPTION:
- none (do not invent priority, severity, impact, urgency, cost, or ROI)`,
  },
  {
    id: "E5",
    expect: ["UPDATE_NODE"],
    transcript: "Rename Weak lead verification to Weak verification.",
    conversationHistory: [],
    canvas: {
      nodes: [{ title: "Weak lead verification", nodeType: "problem" }],
      edges: [],
    },
    graphContext: {
      nodes: [
        { id: "n3", title: "Weak lead verification", nodeType: "problem" },
      ],
      edges: [],
    },
    extra: `EXPLICIT RELATIONSHIPS:
- none

UPSTREAM CAUSES (nodes that cause something and are not themselves caused by an explicit causes edge):
- none (no explicit causes edges)

GRAPH INSIGHT FACTS (explicit graph only; do not invent):
NODE TYPES:
- problem: Weak lead verification

PROBLEMS:
- Weak lead verification

SOLUTIONS:
- none

EXPLICIT CAUSES (source --causes--> target; do not reverse):
- none

EXPLICIT SOLVES (source --solves--> target; do not reverse):
- none

PROBLEMS WITH AT LEAST ONE SOLUTION:
- none

UNRESOLVED PROBLEMS (problem nodes with no incoming solves edge):
- Weak lead verification

RANKING ATTRIBUTES (priority / severity / impact / importance):
- none

GRAPH RECOMMENDATION FACTS (explicit structure only; recommendations, not decisions):
TOP-LEVEL PROBLEMS (problem nodes that are caused by something and do not themselves cause another node):
- none

STANDALONE PROBLEMS (problem nodes with no explicit causes edges in or out):
- Weak lead verification

UPSTREAM PROBLEM CAUSES (problem nodes that are the source of an explicit causes edge):
- none

UNRESOLVED CAUSES (upstream problem causes with no incoming solves edge):
- none

CAUSES THAT ALREADY HAVE A SOLUTION:
- none

SOLUTION COVERAGE GAPS (unresolved actionable problem causes, else unresolved standalone problems; not an impact ranking):
- Weak lead verification

TOP-LEVEL PROBLEMS WITH NO DIRECT SOLUTION WHOSE UPSTREAM CAUSES ARE SOLVED:
- none

RANKING ATTRIBUTES FOUND IN NODE TITLE/DESCRIPTION:
- none (do not invent priority, severity, impact, urgency, cost, or ROI)`,
  },
  {
    id: "E8",
    expect: [],
    transcript: "What's unresolved?",
    conversationHistory: [],
    canvas: {
      nodes: [{ title: "Poor lead quality", nodeType: "problem" }],
      edges: [],
    },
    graphContext: {
      nodes: [{ id: "n2", title: "Poor lead quality", nodeType: "problem" }],
      edges: [],
    },
    extra: `EXPLICIT RELATIONSHIPS:
- none

UPSTREAM CAUSES (nodes that cause something and are not themselves caused by an explicit causes edge):
- none (no explicit causes edges)

GRAPH INSIGHT FACTS (explicit graph only; do not invent):
NODE TYPES:
- problem: Poor lead quality

PROBLEMS:
- Poor lead quality

SOLUTIONS:
- none

EXPLICIT CAUSES (source --causes--> target; do not reverse):
- none

EXPLICIT SOLVES (source --solves--> target; do not reverse):
- none

PROBLEMS WITH AT LEAST ONE SOLUTION:
- none

UNRESOLVED PROBLEMS (problem nodes with no incoming solves edge):
- Poor lead quality

RANKING ATTRIBUTES (priority / severity / impact / importance):
- none

GRAPH RECOMMENDATION FACTS (explicit structure only; recommendations, not decisions):
TOP-LEVEL PROBLEMS (problem nodes that are caused by something and do not themselves cause another node):
- none

STANDALONE PROBLEMS (problem nodes with no explicit causes edges in or out):
- Poor lead quality

UPSTREAM PROBLEM CAUSES (problem nodes that are the source of an explicit causes edge):
- none

UNRESOLVED CAUSES (upstream problem causes with no incoming solves edge):
- none

CAUSES THAT ALREADY HAVE A SOLUTION:
- none

SOLUTION COVERAGE GAPS (unresolved actionable problem causes, else unresolved standalone problems; not an impact ranking):
- Poor lead quality

TOP-LEVEL PROBLEMS WITH NO DIRECT SOLUTION WHOSE UPSTREAM CAUSES ARE SOLVED:
- none

RANKING ATTRIBUTES FOUND IN NODE TITLE/DESCRIPTION:
- none (do not invent priority, severity, impact, urgency, cost, or ROI)`,
  },
];

const client = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: loadKey(),
  timeout: 90000,
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function classifyError(err) {
  const status = err?.status || err?.statusCode;
  const msg = String(err?.message || err || "");
  if (status === 401 || /401|unauthorized/i.test(msg)) return "401";
  if (status === 429 || /429|rate limit/i.test(msg)) return "429";
  if (status === 502 || /502/i.test(msg)) return "502";
  if (status === 503 || /overloaded|503/i.test(msg)) return "503";
  if (status === 504 || /504/i.test(msg)) return "504";
  if (status === 500 || /500/i.test(msg)) return "500";
  if (status === 400 || /\b400\b/.test(msg)) return "400";
  if (/timeout|ETIMEDOUT|AbortError/i.test(msg)) return "timeout";
  if (/ECONNRESET|ENOTFOUND|fetch failed|network|socket/i.test(msg)) {
    return "connection";
  }
  if (status) return String(status);
  return "other";
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function stats(values) {
  const arr = [...values].filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (!arr.length) {
    return {
      n: 0,
      min: null,
      max: null,
      mean: null,
      p50: null,
      p75: null,
      p90: null,
      p95: null,
    };
  }
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    n: arr.length,
    min: arr[0],
    max: arr[arr.length - 1],
    mean: Math.round(mean * 100) / 100,
    p50: percentile(arr, 50),
    p75: percentile(arr, 75),
    p90: percentile(arr, 90),
    p95: percentile(arr, 95),
  };
}

function pearson(xs, ys) {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 1000) / 1000;
}

function appendResult(row) {
  fs.appendFileSync(OUT_JSONL, JSON.stringify(row) + "\n");
}

async function callOnce({ scenario, stream, attempt }) {
  const userContent = buildUserMessage(
    scenario.conversationHistory,
    scenario.graphContext,
    scenario.extra,
    scenario.transcript
  );

  const t0 = Date.now();
  const iso = new Date(t0).toISOString();
  const row = {
    scenario: scenario.id,
    stream,
    attempt,
    t0,
    timestamp: iso,
    ok: false,
    knownMoveNodeContractMismatch: scenario.id === "E4",
  };

  try {
    const params = {
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 900,
      reasoning_effort: "none",
      stream,
    };
    if (stream) params.stream_options = { include_usage: true };

    const res = await client.chat.completions.create(params);
    const tCreate = Date.now();

    let fullContent = "";
    let t1 = tCreate;
    let t2 = null;
    let t3 = null;
    let chunkCount = 0;
    let emptyChunks = 0;
    let finishReason = null;
    let usage = null;

    if (stream) {
      for await (const chunk of res) {
        const now = Date.now();
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const piece = choice?.delta?.content || "";
        chunkCount += 1;
        if (!piece) {
          emptyChunks += 1;
          t3 = now;
          continue;
        }
        if (t2 == null && piece.trim().length > 0) t2 = now;
        fullContent += piece;
        t3 = now;
      }
    } else {
      fullContent = res.choices?.[0]?.message?.content || "";
      const t2Extract = Date.now();
      finishReason = res.choices?.[0]?.finish_reason || null;
      usage = res.usage || null;
      chunkCount = 1;
      row.contentExtractedMs = t2Extract - t0;
      t3 = t2Extract;
    }

    const t4Concat = Date.now();
    row.ttfbMs = t1 != null ? t1 - t0 : null;
    row.ttftMs = stream ? (t2 != null ? t2 - t0 : null) : null;
    row.streamDurationMs = stream && t2 != null && t3 != null ? t3 - t2 : null;
    row.completeMs = t3 != null ? t3 - t0 : t4Concat - t0;
    row.concatMs = t4Concat - t0;
    row.chunkCount = chunkCount;
    row.emptyChunks = emptyChunks;
    row.finishReason = finishReason;
    row.prompt_tokens = usage?.prompt_tokens ?? null;
    row.completion_tokens = usage?.completion_tokens ?? null;
    row.total_tokens = usage?.total_tokens ?? null;
    row.httpStatus = 200;

    let parsed = null;
    try {
      parsed = JSON.parse(fullContent);
    } catch {
      row.ok = false;
      row.errorClass = "malformed_json";
      row.errorMessage = "JSON.parse failed";
      row.actionReadyMs = null;
      appendResult(row);
      return row;
    }
    const t5 = Date.now();
    row.jsonReadyMs = t5 - t0;
    row.jsonParseLocalMs = t5 - t4Concat;

    if (!parsed || typeof parsed !== "object") {
      row.ok = false;
      row.errorClass = "malformed_json";
      row.errorMessage = "parsed non-object";
      appendResult(row);
      return row;
    }
    if (typeof parsed.message !== "string") {
      parsed.message = "Echo processed your request.";
    }
    if (!Array.isArray(parsed.actions)) parsed.actions = [];

    const rawTypes = parsed.actions.map((a) => a?.type);
    const validated = validateActions(scenario.canvas, parsed.actions);
    const t6 = Date.now();
    row.actionReadyMs = t6 - t0;
    row.postTtftMs =
      stream && row.ttftMs != null ? t6 - t0 - row.ttftMs : null;
    row.rawActionTypes = rawTypes;
    row.validatedActionTypes = validated.map((a) => a.type);
    row.moveNodeDropped =
      rawTypes.includes("MOVE_NODE") &&
      !row.validatedActionTypes.includes("MOVE_NODE");
    row.ok = true;
    appendResult(row);
    return row;
  } catch (err) {
    row.ok = false;
    row.errorClass = classifyError(err);
    row.errorMessage = String(err?.message || err).slice(0, 400);
    row.httpStatus = err?.status ?? null;
    row.completeMs = Date.now() - t0;
    appendResult(row);
    return row;
  }
}

function errorCounts(failures) {
  const keys = [
    "400",
    "401",
    "429",
    "500",
    "502",
    "503",
    "504",
    "timeout",
    "connection",
    "malformed_json",
    "other",
  ];
  const out = {};
  for (const k of keys) out[k] = failures.filter((r) => r.errorClass === k).length;
  for (const r of failures) {
    if (!keys.includes(r.errorClass)) {
      out[r.errorClass] = (out[r.errorClass] || 0) + 1;
    }
  }
  return out;
}

function summarize(rows, stream) {
  const subset = rows.filter((r) => r.stream === stream);
  const successes = subset.filter((r) => r.ok);
  const failures = subset.filter((r) => !r.ok);
  const errors = errorCounts(failures);
  const ttftShare = successes
    .filter((r) => r.ttftMs != null && r.actionReadyMs)
    .map((r) => Math.round((r.ttftMs / r.actionReadyMs) * 1000) / 10);
  return {
    attempts: subset.length,
    successes: successes.length,
    failures: failures.length,
    successRate:
      subset.length === 0
        ? null
        : Math.round((successes.length / subset.length) * 1000) / 10,
    rate503:
      subset.length === 0
        ? null
        : Math.round((errors["503"] / subset.length) * 1000) / 10,
    errors,
    ttfb: stats(successes.map((r) => r.ttfbMs)),
    ttft: stats(successes.map((r) => r.ttftMs).filter((v) => v != null)),
    streamDuration: stats(
      successes.map((r) => r.streamDurationMs).filter((v) => v != null)
    ),
    complete: stats(successes.map((r) => r.completeMs)),
    jsonReady: stats(successes.map((r) => r.jsonReadyMs)),
    actionReady: stats(successes.map((r) => r.actionReadyMs)),
    postTtft: stats(successes.map((r) => r.postTtftMs).filter((v) => v != null)),
    ttftShareOfActionReadyPct: stats(ttftShare),
    promptTokens: stats(
      successes.map((r) => r.prompt_tokens).filter((n) => typeof n === "number")
    ),
    completionTokens: stats(
      successes.map((r) => r.completion_tokens).filter((n) => typeof n === "number")
    ),
    totalTokens: stats(
      successes.map((r) => r.total_tokens).filter((n) => typeof n === "number")
    ),
    jsonParseLocalMs: stats(successes.map((r) => r.jsonParseLocalMs)),
    moveNodeDropped: successes.filter((r) => r.moveNodeDropped).length,
    finishReasons: successes.reduce((acc, r) => {
      const k = r.finishReason || "null";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };
}

function providerUnstable(rows) {
  if (rows.length < 10) return false;
  const last12 = rows.slice(-12);
  const s503 = last12.filter((r) => r.errorClass === "503").length;
  const consecutive = [...rows].reverse();
  let streak = 0;
  for (const r of consecutive) {
    if (r.errorClass === "503") streak += 1;
    else break;
  }
  return streak >= 6 || s503 >= 8;
}

async function run() {
  fs.writeFileSync(OUT_JSONL, "");
  const rows = [];
  console.log("TEMP Phase 9.5 latency decomposition");
  console.log("system prompt chars:", SYSTEM_PROMPT.length);
  console.log("production stream flag:", /stream\s*:/.test(routeSrc));

  const TARGET = 20;
  const MAX_ROUNDS = 8;
  let streamSuccess = 0;
  let nsSuccess = 0;
  let stoppedEarly = null;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    if (streamSuccess >= TARGET && nsSuccess >= TARGET) break;
    if (providerUnstable(rows)) {
      stoppedEarly = "provider_unstable_503";
      console.log("STOP: 503 circuit breaker");
      break;
    }
    for (const scenario of SCENARIOS) {
      if (providerUnstable(rows)) {
        stoppedEarly = "provider_unstable_503";
        break;
      }
      if (nsSuccess < TARGET) {
        await delay(1800);
        const r = await callOnce({ scenario, stream: false, attempt: round });
        rows.push(r);
        if (r.ok) nsSuccess += 1;
        console.log(
          `[NS] r${round} ${scenario.id} ok=${r.ok} err=${r.errorClass || ""} complete=${r.completeMs} actionReady=${r.actionReadyMs} tok=${r.completion_tokens}`
        );
      }
      if (streamSuccess < TARGET) {
        await delay(1800);
        const r = await callOnce({ scenario, stream: true, attempt: round });
        rows.push(r);
        if (r.ok) streamSuccess += 1;
        console.log(
          `[ST] r${round} ${scenario.id} ok=${r.ok} err=${r.errorClass || ""} ttfb=${r.ttfbMs} ttft=${r.ttftMs} post=${r.postTtftMs} actionReady=${r.actionReadyMs} tok=${r.completion_tokens}`
        );
      }
    }
  }

  const streamOk = rows.filter((r) => r.stream && r.ok);
  const nsOk = rows.filter((r) => !r.stream && r.ok);
  const outliers = [...rows]
    .filter((r) => r.ok)
    .sort((a, b) => (b.actionReadyMs || 0) - (a.actionReadyMs || 0))
    .slice(0, 8)
    .map((r) => ({
      scenario: r.scenario,
      stream: r.stream,
      timestamp: r.timestamp,
      ttftMs: r.ttftMs,
      completeMs: r.completeMs,
      actionReadyMs: r.actionReadyMs,
      postTtftMs: r.postTtftMs,
      completion_tokens: r.completion_tokens,
      prompt_tokens: r.prompt_tokens,
      httpStatus: r.httpStatus,
    }));

  const summary = {
    generatedAt: new Date().toISOString(),
    note: "TEMPORARY Phase 9.5. Production route not modified. Direct NVIDIA calls. TTFB=first SDK stream/HTTP body event, not internal NVIDIA queue.",
    stoppedEarly,
    systemPromptChars: SYSTEM_PROMPT.length,
    interleave: "per scenario: non-stream then stream; repeat rounds",
    streaming: summarize(rows, true),
    nonStreaming: summarize(rows, false),
    correlations: {
      ttft_vs_actionReady: pearson(
        streamOk.map((r) => r.ttftMs),
        streamOk.map((r) => r.actionReadyMs)
      ),
      completionTokens_vs_actionReady_stream: pearson(
        streamOk.map((r) => r.completion_tokens).filter((n) => typeof n === "number"),
        streamOk
          .filter((r) => typeof r.completion_tokens === "number")
          .map((r) => r.actionReadyMs)
      ),
      completionTokens_vs_actionReady_nonstream: pearson(
        nsOk.map((r) => r.completion_tokens).filter((n) => typeof n === "number"),
        nsOk
          .filter((r) => typeof r.completion_tokens === "number")
          .map((r) => r.actionReadyMs)
      ),
      promptTokens_vs_actionReady_stream: pearson(
        streamOk.map((r) => r.prompt_tokens).filter((n) => typeof n === "number"),
        streamOk
          .filter((r) => typeof r.prompt_tokens === "number")
          .map((r) => r.actionReadyMs)
      ),
      promptTokens_vs_actionReady_nonstream: pearson(
        nsOk.map((r) => r.prompt_tokens).filter((n) => typeof n === "number"),
        nsOk
          .filter((r) => typeof r.prompt_tokens === "number")
          .map((r) => r.actionReadyMs)
      ),
    },
    outliers,
    failures: rows
      .filter((r) => !r.ok)
      .map((r) => ({
        scenario: r.scenario,
        stream: r.stream,
        timestamp: r.timestamp,
        errorClass: r.errorClass,
        httpStatus: r.httpStatus,
        completeMs: r.completeMs,
        message: r.errorMessage,
      })),
  };

  fs.writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 2));
  console.log("\n=== PHASE 9.5 SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
