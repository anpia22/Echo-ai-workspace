"use client";

import { useMemo, useState } from "react";

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
  "Our API is slow at peak traffic, we're not sure whether to add a cache, split the monolith, or just scale up. Launch is in 6 weeks.",
  "Two engineers want to rebuild auth in-house, I'd rather buy. We have no security hire and a SOC 2 audit next quarter.",
  "Churn is up 4% and nobody agrees why. Support says pricing, product says missing integrations, and I can't tell who's right.",
];

const COLUMN_ORDER: NodeType[] = ["problem", "question", "idea", "solution", "decision", "task"];

const TYPE_STYLE: Record<NodeType, string> = {
  problem: "border-rose-400/60 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  question: "border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  idea: "border-sky-400/60 bg-sky-500/10 text-sky-700 dark:text-sky-200",
  solution: "border-emerald-400/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  decision: "border-violet-400/60 bg-violet-500/10 text-violet-700 dark:text-violet-200",
  task: "border-zinc-400/60 bg-zinc-500/10 text-zinc-700 dark:text-zinc-200",
};

/** Place nodes in one column per type (in thinking order), spread evenly down the column. */
function layout(nodes: DemoNode[]) {
  const used = COLUMN_ORDER.filter((t) => nodes.some((n) => n.type === t));
  const pos = new Map<string, { x: number; y: number }>();
  used.forEach((type, col) => {
    const group = nodes.filter((n) => n.type === type);
    group.forEach((n, row) => {
      pos.set(n.id, {
        x: used.length === 1 ? 50 : 12 + (col * 76) / (used.length - 1),
        y: ((row + 1) * 100) / (group.length + 1),
      });
    });
  });
  return pos;
}

export default function LiveDemo() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<{ nodes: DemoNode[]; edges: DemoEdge[] } | null>(null);

  const positions = useMemo(() => (graph ? layout(graph.nodes) : null), [graph]);

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
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-indigo-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              Example {i + 1}
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

      {graph && positions ? (
        <>
          {/* Wide screens: positioned map. Narrow screens: readable list below. */}
          <div className="relative mt-2 hidden h-[420px] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/50 md:block">
            <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
              {graph.edges.map((e, i) => {
                const a = positions.get(e.source);
                const b = positions.get(e.target);
                if (!a || !b) return null;
                return (
                  <g key={i}>
                    <line
                      x1={`${a.x}%`}
                      y1={`${a.y}%`}
                      x2={`${b.x}%`}
                      y2={`${b.y}%`}
                      className="stroke-zinc-400 dark:stroke-zinc-600"
                      strokeWidth="1.5"
                    />
                    {e.label ? (
                      <text
                        x={`${(a.x + b.x) / 2}%`}
                        y={`${(a.y + b.y) / 2}%`}
                        textAnchor="middle"
                        className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
                      >
                        {e.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
            {graph.nodes.map((n, i) => {
              const p = positions.get(n.id)!;
              return (
                <div
                  key={n.id}
                  style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${i * 90}ms` }}
                  className={`animate-fade-in absolute w-36 -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-2 text-xs shadow-sm backdrop-blur ${TYPE_STYLE[n.type]}`}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-70">{n.type}</span>
                  <span className="mt-0.5 block font-medium leading-snug">{n.title}</span>
                </div>
              );
            })}
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
