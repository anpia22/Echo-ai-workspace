/**
 * TEMPORARY Phase 9 Average Latency baseline.
 * Hits production POST /api/analyze. Does not call NVIDIA directly.
 * Does not modify route behavior.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const OUT_JSONL = path.join(ROOT, "scratch", "TEMP_phase9_average_latency_results.jsonl");
const OUT_SUMMARY = path.join(ROOT, "scratch", "TEMP_phase9_average_latency_summary.json");
const TERMINAL_LOG = path.join(
  process.env.USERPROFILE || "",
  ".cursor",
  "projects",
  "c-Users-mestr-Desktop-echo-challange-echo-ai-workspace",
  "terminals",
  "1.txt"
);
const ANALYZE_URL = process.env.ECHO_ANALYZE_URL || "http://localhost:3000/api/analyze";

const canvas = {
  nodes: [
    {
      id: "sales",
      nodeType: "problem",
      title: "Sales performance",
      description: "Sales are declining",
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
    {
      id: "idea",
      nodeType: "idea",
      title: "Unrelated idea",
      position: { x: 900, y: 900 },
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

const conversationHistory = [
  { role: "user", content: "Sales have been getting worse." },
  {
    role: "assistant",
    content: "I captured Sales performance and related causes on the canvas.",
  },
];

const scenarios = [
  {
    id: "create_node",
    transcript: "Add a problem called Pipeline leakage.",
  },
  {
    id: "create_edge",
    transcript:
      "Connect Poor lead quality to Sales performance with a causes relationship if that edge is missing, otherwise leave the canvas as is.",
  },
  {
    id: "update_node",
    transcript: "Rename Poor lead quality to Lead quality issues.",
  },
  {
    id: "delete_node",
    transcript: "Delete the Unrelated idea node.",
  },
  {
    id: "move_node",
    transcript: "Move Sales performance to the right.",
  },
  {
    id: "group_nodes",
    transcript:
      "Group Poor lead quality and Weak lead verification together as Root Causes.",
  },
  {
    id: "multi_action",
    transcript:
      "Add a solution called Improve verification and connect it so it solves Weak lead verification.",
  },
  {
    id: "insight_main_problems",
    transcript: "What are the main problems?",
  },
  {
    id: "insight_unresolved",
    transcript: "What's unresolved on the canvas?",
  },
  {
    id: "recommendation_focus",
    transcript: "What should we focus on next?",
  },
];

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function stats(values) {
  const arr = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
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
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
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

function classifyBody(status, data) {
  const message = typeof data?.message === "string" ? data.message : "";
  if (status === 200 && message.includes("taking longer than expected")) {
    return "timeout";
  }
  if (status === 200 && message.includes("temporarily unavailable")) {
    return "unavailable_503";
  }
  if (status === 200 && message.includes("couldn't reliably interpret")) {
    return "unusable_json";
  }
  if (status !== 200) {
    return "http_error";
  }
  if (typeof data?.message === "string" && Array.isArray(data?.actions)) {
    return "success";
  }
  return "unusable_other";
}

function readNewLog(beforeLen) {
  try {
    const text = fs.readFileSync(TERMINAL_LOG, "utf8");
    return text.slice(beforeLen);
  } catch {
    return "";
  }
}

function logLen() {
  try {
    return fs.readFileSync(TERMINAL_LOG, "utf8").length;
  } catch {
    return 0;
  }
}

function parseServerSlice(slice) {
  const nvidia = [];
  const nvidiaRe = /NVIDIA response time:\s+([0-9.]+)\s+seconds/g;
  let m;
  while ((m = nvidiaRe.exec(slice))) {
    nvidia.push(Math.round(Number(m[1]) * 1000));
  }
  const post = [];
  const postRe = /POST \/api\/analyze (\d+) in ([0-9.]+)s \(next\.js: ([0-9.]+)ms, application-code: ([0-9.]+)s\)/g;
  while ((m = postRe.exec(slice))) {
    post.push({
      status: Number(m[1]),
      totalS: Number(m[2]),
      nextMs: Number(m[3]),
      appS: Number(m[4]),
    });
  }
  return {
    nvidiaMs: nvidia.length ? nvidia[nvidia.length - 1] : null,
    post: post.length ? post[post.length - 1] : null,
    retries: (slice.match(/NVIDIA provider unavailable \(503\); retrying once/g) || [])
      .length,
    timeouts: (slice.match(/NVIDIA request timed out after/g) || []).length,
    unavailable: (slice.match(/NVIDIA provider unavailable \(503\)(?!;)/g) || [])
      .length,
  };
}

async function callOnce(scenario, round) {
  const before = logLen();
  const t0 = Date.now();
  let status = 0;
  let data = null;
  let error = null;
  try {
    const res = await fetch(ANALYZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: scenario.transcript,
        conversationHistory,
        currentCanvas: canvas,
      }),
    });
    status = res.status;
    data = await res.json();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const totalMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 80));
  const server = parseServerSlice(readNewLog(before));
  const kind = error ? "network_error" : classifyBody(status, data);
  const nvidiaMs = server.nvidiaMs;
  const handlerMs =
    server.post && typeof server.post.appS === "number"
      ? Math.round(server.post.appS * 1000)
      : null;
  const localMs =
    nvidiaMs != null && handlerMs != null ? Math.max(0, handlerMs - nvidiaMs) : null;

  return {
    scenario: scenario.id,
    round,
    kind,
    httpStatus: status,
    totalMs,
    nvidiaMs,
    handlerMs,
    localMs,
    retriesLogged: server.retries,
    timeoutLogged: server.timeouts,
    actionCount: Array.isArray(data?.actions) ? data.actions.length : null,
    actionTypes: Array.isArray(data?.actions)
      ? data.actions.map((a) => a?.type).filter(Boolean)
      : [],
    error,
  };
}

const ROUNDS = 2;

async function main() {
  fs.writeFileSync(OUT_JSONL, "");
  const rows = [];
  console.log("Phase 9 average latency →", ANALYZE_URL);
  console.log("scenarios", scenarios.length, "rounds", ROUNDS);

  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const scenario of scenarios) {
      console.log(`\n→ r${round} ${scenario.id}`);
      const row = await callOnce(scenario, round);
      rows.push(row);
      fs.appendFileSync(OUT_JSONL, JSON.stringify(row) + "\n");
      console.log(
        `  ${row.kind} total=${row.totalMs}ms nvidia=${row.nvidiaMs} local=${row.localMs} retries=${row.retriesLogged} actions=${JSON.stringify(row.actionTypes)}`
      );
    }
  }

  const success = rows.filter((r) => r.kind === "success");
  const totals = stats(success.map((r) => r.totalMs));
  const nvidia = stats(success.filter((r) => r.nvidiaMs != null).map((r) => r.nvidiaMs));
  const local = stats(success.filter((r) => r.localMs != null).map((r) => r.localMs));
  const handler = stats(
    success.filter((r) => r.handlerMs != null).map((r) => r.handlerMs)
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    url: ANALYZE_URL,
    note: "Production POST /api/analyze. Sequential. Independent canvas payloads. NVIDIA ms from server log 'NVIDIA response time'. Local = Next application-code minus NVIDIA wait.",
    rounds: ROUNDS,
    requests: rows.length,
    successful: success.length,
    timeout: rows.filter((r) => r.kind === "timeout").length,
    unavailable_503: rows.filter((r) => r.kind === "unavailable_503").length,
    unusable_json: rows.filter((r) => r.kind === "unusable_json").length,
    http_error: rows.filter((r) => r.kind === "http_error").length,
    network_error: rows.filter((r) => r.kind === "network_error").length,
    retries: rows.reduce((s, r) => s + (r.retriesLogged || 0), 0),
    failedUnusable: rows.filter((r) => r.kind !== "success").length,
    totalMs_success: totals,
    nvidiaMs_success: nvidia,
    localMs_success: local,
    handlerMs_success: handler,
    byScenario: Object.fromEntries(
      scenarios.map((s) => {
        const subset = rows.filter((r) => r.scenario === s.id);
        const ok = subset.filter((r) => r.kind === "success");
        return [
          s.id,
          {
            n: subset.length,
            success: ok.length,
            kinds: subset.map((r) => r.kind),
            totalMs: ok.map((r) => r.totalMs),
            nvidiaMs: ok.map((r) => r.nvidiaMs),
          },
        ];
      })
    ),
    priorDirectNvidiaNonStream: {
      source: "scratch/TEMP_phase95_summary.json nonStreaming.complete",
      n: 20,
      mean: 8609.4,
      p50: 5028,
      p75: 6879,
      p90: 15502,
      p95: 34401,
      min: 1579,
      max: 45035,
    },
  };

  fs.writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
