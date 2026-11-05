"use client";

import { useMemo, useState } from "react";
import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "../theme/ThemeProvider";

type NodeType = "problem" | "question" | "idea" | "solution" | "decision" | "task";

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

const EXAMPLES = [
  {
    category: "Architecture",
    label: "How UPI Works",
    text: "how the Upi works tell me with the graph",
  },
  {
    category: "Architecture (ADR)",
    label: "Monolith vs Microservices",
    text: "Our monolithic API is experiencing high latency during peak checkout traffic. Should we extract checkout into an independent microservice, introduce Redis caching, or scale up with read replicas? Launch is in 6 weeks.",
  },
  {
    category: "Build vs Buy",
    label: "Build vs Buy Auth",
    text: "Two engineers want to build custom auth in-house, but we have a SOC 2 audit next quarter and no dedicated security hire. Compare building custom JWT/sessions vs buying Clerk or Auth0.",
  },
  {
    category: "Database Scaling",
    label: "Sharding vs Read Replicas",
    text: "Our PostgreSQL instance is hitting 85% CPU during peak hours with 5M records. Evaluate read replicas with PgBouncer vs citus sharding vs moving hot analytics to ClickHouse.",
  },
  {
    category: "Incident Postmortem",
    label: "Payment Webhook Outage",
    text: "Payment webhook drops caused 120 unfulfilled customer orders yesterday. Analyze root causes (timeout handling, queue dead-lettering) and define immediate engineering tasks to prevent recurrence.",
  },
];

const TYPE_STYLE: Record<NodeType, string> = {
  problem: "border-rose-400/70 bg-rose-50/90 text-rose-800 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-200",
  question: "border-amber-400/70 bg-amber-50/90 text-amber-800 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-200",
  idea: "border-sky-400/70 bg-sky-50/90 text-sky-800 dark:border-sky-500/50 dark:bg-sky-950/40 dark:text-sky-200",
  solution: "border-emerald-400/70 bg-emerald-50/90 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-200",
  decision: "border-violet-400/70 bg-violet-50/90 text-violet-800 dark:border-violet-500/50 dark:bg-violet-950/40 dark:text-violet-200",
  task: "border-zinc-300 bg-zinc-50/90 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200",
};

const NODE_W = 200;
const COL_GAP = 110;
const ROW_GAP = 24;
const NODE_H = 76;

/**
 * Layered left-to-right DAG layout: a node sits one column right of its deepest parent,
 * stacking nodes vertically into columns so the graph fills the canvas naturally.
 */
function layout(nodes: DemoNode[], edges: DemoEdge[]) {
  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]));

  // Bellman-Ford relaxation, capped to prevent infinite loops on any accidental cycle
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const next = (rank.get(e.source) ?? 0) + 1;
      if (next > (rank.get(e.target) ?? 0) && next < nodes.length) {
        rank.set(e.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const columns = new Map<number, DemoNode[]>();
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0;
    columns.set(r, [...(columns.get(r) ?? []), n]);
  }

  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const colHeight = tallest * NODE_H + (tallest - 1) * ROW_GAP;

  const flowNodes: Node<DemoNodeData>[] = [];
  const colKeys = [...columns.keys()].sort((a, b) => a - b);

  colKeys.forEach((r, colIdx) => {
    const col = columns.get(r) ?? [];
    const height = col.length * NODE_H + (col.length - 1) * ROW_GAP;
    const top = (colHeight - height) / 2;
    col.forEach((n, row) => {
      flowNodes.push({
        id: n.id,
        type: "demo",
        position: { x: colIdx * (NODE_W + COL_GAP), y: top + row * (NODE_H + ROW_GAP) },
        data: { type: n.type, title: n.title },
        draggable: false,
      });
    });
  });

  const flowEdges: Edge[] = edges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { strokeWidth: 1.5 },
    labelStyle: { fontSize: 11, fontWeight: 500 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
  }));

  return { flowNodes, flowEdges };
}

type DemoNodeData = {
  type: NodeType;
  title: string;
};

function DemoNodeCard({ data }: NodeProps<Node<DemoNodeData>>) {
  return (
    <div
      style={{ width: NODE_W, minHeight: NODE_H }}
      className={`relative flex flex-col justify-center rounded-xl border px-3 py-2 text-sm shadow-xs transition-shadow hover:shadow-md ${TYPE_STYLE[data.type]}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-zinc-400 dark:!bg-zinc-500"
      />
      <span className="block text-[10px] font-bold uppercase tracking-wider opacity-75">
        {data.type}
      </span>
      <span className="mt-0.5 block font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
        {data.title}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-zinc-400 dark:!bg-zinc-500"
      />
    </div>
  );
}

const nodeTypes = { demo: DemoNodeCard };

export default function LiveDemo() {
  const { resolvedTheme } = useTheme();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<{ nodes: DemoNode[]; edges: DemoEdge[] } | null>(null);

  const flow = useMemo(() => (graph ? layout(graph.nodes, graph.edges) : null), [graph]);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setGraph(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white/80 p-4 shadow-xl shadow-indigo-500/10 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/60 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          15-Second Domain Templates (Zero Blank-Canvas Panic)
        </span>
        <span className="hidden sm:inline-block text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          Schema: Problem → Options → Decision → Task
        </span>
      </div>

      <label htmlFor="demo-prompt" className="sr-only">
        Describe a problem, architecture question, or decision
      </label>
      <textarea
        id="demo-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={700}
        rows={3}
        placeholder="Type a messy problem or pick a 1-click domain template above…"
        className="w-full resize-none rounded-2xl border border-zinc-300 bg-white p-4 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-white"
      />

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setPrompt(ex.text)}
              className="group flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-400/60 dark:hover:bg-indigo-950/40 dark:hover:text-white"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500/80 group-hover:text-indigo-600 dark:text-indigo-400">
                {ex.category.split(" ")[0]}
              </span>
              <span>{ex.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading || prompt.trim().length < 10}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold !text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:!bg-white dark:!text-black dark:hover:bg-zinc-100"
        >
          {loading ? "Mapping…" : "Map it"}
        </button>
      </div>

      <div aria-live="polite" className="mt-4">
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-300/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
            {error}
          </p>
        ) : null}
      </div>

      {graph && flow ? (
        <>
          {/* Wide screens: React Flow map (clean 2D column layout, identical to image 1 proportions) */}
          <div className="mt-3 hidden h-[440px] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/70 shadow-inner dark:border-zinc-800 dark:bg-zinc-950/50 md:block">
            <ReactFlow
              key={graph.nodes.map((n) => n.id).join("|")}
              nodes={flow.flowNodes}
              edges={flow.flowEdges}
              nodeTypes={nodeTypes}
              colorMode={resolvedTheme}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.4}
              maxZoom={1.4}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              preventScrolling={false}
              panOnDrag
              proOptions={{ hideAttribution: true }}
              aria-label="Generated thinking map"
            >
              <Background gap={20} size={1} />
            </ReactFlow>
          </div>

          {/* Narrow screens / Mobile view */}
          <ul className="mt-3 space-y-2 md:hidden">
            {graph.nodes.map((n) => (
              <li
                key={n.id}
                className={`rounded-xl border px-3 py-2 text-sm ${TYPE_STYLE[n.type]}`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                  {n.type}
                </span>
                <span className="block font-semibold mt-0.5 text-zinc-900 dark:text-white">
                  {n.title}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200 sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                <strong>System of Record:</strong> AI structured this into {graph.nodes.length} typed nodes and {graph.edges.length} relational connections.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500 dark:text-zinc-400">Exportable decision schema</span>
              <a href="/app" className="font-semibold text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400">
                Open workspace →
              </a>
            </div>
          </div>
        </>
      ) : null}

      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Nothing is saved. Demo input is sent to our AI provider to build the map; limited to a few runs per 10 minutes.
      </p>
    </div>
  );
}
