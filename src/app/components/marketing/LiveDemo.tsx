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
    label: "Cache or split the service?",
    text: "Our API is slow at peak traffic, we're not sure whether to add a cache, split the monolith, or just scale up. Launch is in 6 weeks.",
  },
  {
    label: "Build or buy auth?",
    text: "Two engineers want to rebuild auth in-house, I'd rather buy. We have no security hire and a SOC 2 audit next quarter.",
  },
  {
    label: "Why is churn up?",
    text: "Churn is up 4% and nobody agrees why. Support says pricing, product says missing integrations, and I can't tell who's right.",
  },
];

const TYPE_STYLE: Record<NodeType, string> = {
  problem: "border-rose-400/60 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  question: "border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  idea: "border-sky-400/60 bg-sky-500/10 text-sky-700 dark:text-sky-200",
  solution: "border-emerald-400/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  decision: "border-violet-400/60 bg-violet-500/10 text-violet-700 dark:text-violet-200",
  task: "border-zinc-400/60 bg-zinc-500/10 text-zinc-700 dark:text-zinc-200",
};

const NODE_W = 200;
const COL_GAP = 110;
const ROW_GAP = 26;
const NODE_H = 76;

/**
 * Layered left-to-right layout: a node sits one column right of its deepest parent,
 * so edges mostly flow forward and rarely cross a card.
 */
function layout(nodes: DemoNode[], edges: DemoEdge[]) {
  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  // Bellman-Ford style relaxation, capped so cycles cannot loop forever.
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
  const tallest = Math.max(...[...columns.values()].map((c) => c.length));
  const colHeight = tallest * NODE_H + (tallest - 1) * ROW_GAP;

  const flowNodes: Node<DemoNodeData>[] = [];
  for (const [r, col] of columns) {
    const height = col.length * NODE_H + (col.length - 1) * ROW_GAP;
    const top = (colHeight - height) / 2;
    col.forEach((n, row) => {
      flowNodes.push({
        id: n.id,
        type: "demo",
        position: { x: r * (NODE_W + COL_GAP), y: top + row * (NODE_H + ROW_GAP) },
        data: { type: n.type, title: n.title },
        draggable: false,
      });
    });
  }

  const flowEdges: Edge[] = edges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: { strokeWidth: 1.5 },
    labelStyle: { fontSize: 11, fontWeight: 500 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
  }));

  return { flowNodes, flowEdges };
}

type DemoNodeData = { type: NodeType; title: string };

function DemoNodeCard({ data }: NodeProps<Node<DemoNodeData>>) {
  return (
    <div
      style={{ width: NODE_W, minHeight: NODE_H }}
      className={`rounded-xl border px-3 py-2.5 text-sm shadow-sm ${TYPE_STYLE[data.type]}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-zinc-400" />
      <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-70">{data.type}</span>
      <span className="mt-0.5 block font-medium leading-snug">{data.title}</span>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-zinc-400" />
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
      <label htmlFor="demo-prompt" className="sr-only">
        Describe a messy problem or decision
      </label>
      <textarea
        id="demo-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={700}
        rows={3}
        placeholder="Type a messy problem or decision you're stuck on…"
        className="w-full resize-none rounded-2xl border border-zinc-300 bg-white p-4 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-white"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setPrompt(ex.text)}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-indigo-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              {ex.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading || prompt.trim().length < 15}
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
          {/* Wide screens: React Flow map (same library as the workspace canvas). Narrow screens: list below. */}
          <div className="mt-2 hidden h-[440px] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/50 md:block">
            <ReactFlow
              key={graph.nodes.map((n) => n.id).join("|")}
              nodes={flow.flowNodes}
              edges={flow.flowEdges}
              nodeTypes={nodeTypes}
              colorMode={resolvedTheme}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.4}
              maxZoom={1.5}
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
          <ul className="mt-2 space-y-2 md:hidden">
            {graph.nodes.map((n) => (
              <li key={n.id} className={`rounded-xl border px-3 py-2 text-sm ${TYPE_STYLE[n.type]}`}>
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{n.type}</span>
                <span className="block font-medium">{n.title}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-300">
            That took one message. In the full app you keep talking, drag things around, and the map stays in context.{" "}
            <a href="/app" className="font-semibold text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-300">
              Open the workspace →
            </a>
          </p>
        </>
      ) : null}
      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Nothing is saved. Demo input is sent to our AI provider to build the map; limited to a few runs per 10 minutes.
      </p>
    </div>
  );
}
