import { NextResponse } from "next/server";
import OpenAI from "openai";

// Public, no-sign-up demo: turn a messy problem or question into a clean, connected graph.
// Deliberately separate from /api/analyze (no workspace, no persistence).

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY || "mock-nvidia-key",
});

const MAX_PROMPT_CHARS = 700;
const RATE_LIMIT = 5; // requests
const RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes, per IP

const NODE_TYPES = ["problem", "question", "idea", "solution", "decision", "task"] as const;
type NodeType = (typeof NODE_TYPES)[number];

const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

interface DemoNode {
  id: string;
  type: NodeType;
  title: string;
}
interface DemoEdge {
  source: string;
  target: string;
  label: string;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in response");
  return JSON.parse(body.slice(start, end + 1));
}

function clean(raw: unknown): { nodes: DemoNode[]; edges: DemoEdge[] } {
  const obj = (raw ?? {}) as { nodes?: unknown; edges?: unknown };
  const nodes: DemoNode[] = [];
  const seen = new Set<string>();

  for (const n of Array.isArray(obj.nodes) ? obj.nodes : []) {
    const item = n as { id?: unknown; type?: unknown; title?: unknown };
    const id = String(item.id ?? "").trim();
    const title = String(item.title ?? "").trim().slice(0, 80);
    const type = NODE_TYPES.includes(item.type as NodeType) ? (item.type as NodeType) : "idea";
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    nodes.push({ id, type, title });
    if (nodes.length >= 8) break;
  }

  const edges: DemoEdge[] = [];
  for (const e of Array.isArray(obj.edges) ? obj.edges : []) {
    const item = e as { source?: unknown; target?: unknown; label?: unknown };
    const source = String(item.source ?? "");
    const target = String(item.target ?? "");
    if (!seen.has(source) || !seen.has(target) || source === target) continue;
    edges.push({ source, target, label: String(item.label ?? "").trim().slice(0, 24) });
    if (edges.length >= 12) break;
  }
  return { nodes, edges };
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "You've hit the demo limit. Try again in a few minutes, or open the full app." },
      { status: 429 }
    );
  }

  let prompt = "";
  try {
    const body = (await request.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (prompt.length < 10) {
    return NextResponse.json({ error: "Describe the problem or question in a sentence or two." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_PROMPT_CHARS} characters for the demo.` },
      { status: 400 }
    );
  }
  if (!process.env.NVIDIA_API_KEY) {
    return NextResponse.json({ error: "The live demo is offline right now." }, { status: 503 });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      temperature: 0.2,
      reasoning_effort: "none",
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: `You convert user problems, architecture questions, or decisions into a clean, highly readable thinking map DAG.
Return ONLY a valid JSON object, no markdown or explanation:
{
  "nodes": [
    {"id": "n1", "type": "problem", "title": "Core Problem / Goal"},
    {"id": "n2", "type": "idea", "title": "Key Mechanism / Component"},
    {"id": "n3", "type": "question", "title": "Open Architecture Question"},
    {"id": "n4", "type": "solution", "title": "Target Solution / Flow"},
    {"id": "n5", "type": "task", "title": "Actionable Next Task"}
  ],
  "edges": [
    {"source": "n1", "target": "n2", "label": "routes to"},
    {"source": "n1", "target": "n3", "label": "requires"},
    {"source": "n2", "target": "n4", "label": "enables"},
    {"source": "n3", "target": "n4", "label": "resolved by"},
    {"source": "n4", "target": "n5", "label": "triggers"}
  ]
}
Rules:
1. Return 5 to 7 nodes. Allowed types: problem, question, idea, solution, decision, task.
2. Structure the DAG cleanly from left to right:
   - Left side: 1-2 root problems or starting points.
   - Middle: 2-3 ideas, mechanisms, or architectural questions.
   - Right side: 1-2 solutions, decisions, or tasks.
3. Every node must connect to at least one edge. No orphan nodes.
4. Edge labels must be clear, natural verbs (e.g. 'requires', 'routes via', 'validates', 'enables', 'decided by', 'triggers').
5. Titles must be concise, informative, and readable (3 to 6 words).`,
        },
        { role: "user", content: `<user_input>${prompt}</user_input>` },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    if (!text.trim()) {
      console.error("[api/demo] empty model response, finish_reason:", completion.choices[0]?.finish_reason);
    }
    const graph = clean(extractJson(text));
    if (graph.nodes.length < 2) throw new Error("Too few nodes");
    return NextResponse.json(graph);
  } catch (error) {
    console.error("[api/demo] failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Couldn't build a map this time. Try rephrasing and run it again." },
      { status: 502 }
    );
  }
}
