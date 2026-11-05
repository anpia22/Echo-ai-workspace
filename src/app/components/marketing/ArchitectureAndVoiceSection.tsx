import { FadeIn } from "./motion";

export function ArchitectureAndVoiceSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-zinc-200/80 dark:border-zinc-800/80">
      <div className="mx-auto max-w-3xl text-center mb-12">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
          Under The Hood
        </span>
        <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Real voice meetings. Zero-lag distributed state.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
          "Thinking out loud" isn't a metaphor. Echo pairs a P2P WebRTC mesh with a deterministic canvas engine, transcribing live founder debates into visual decision graphs without server bottlenecks.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Card 1: Live Voice-to-Graph */}
        <FadeIn
          direction="up"
          delay={0}
          className="flex flex-col justify-between rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/50 sm:p-7"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Native Voice & STT Engine
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              Hop into a room with your co-founder or team. Our streaming Speech-to-Text pipeline listens to the debate and maps spoken arguments into candidate nodes in real time.
            </p>
          </div>
          <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
            🎙️ Audio stream → Normalized STT events → Semantic graph actions
          </div>
        </FadeIn>

        {/* Card 2: Distributed State Sync */}
        <FadeIn
          direction="up"
          delay={90}
          className="flex flex-col justify-between rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/50 sm:p-7"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Deterministic Action Engine
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              Canvas updates don't blast massive graph states across WebSockets. AI dispatches atomic graph diffs with deduplication hash guards, preventing viewport desync and race conditions.
            </p>
          </div>
          <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
            ⚡ 16ms throttled broadcast · Hash deduplication · Zero viewport jitter
          </div>
        </FadeIn>

        {/* Card 3: Token Efficiency & Context Pruning */}
        <FadeIn
          direction="up"
          delay={180}
          className="flex flex-col justify-between rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/50 sm:p-7"
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Smart Context Window Budget
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              Large canvases don't explode LLM token budgets. Echo serializes connected decision nodes and causal paths directly from the graph, omitting unrelated canvas branches so prompts stay compact and responses return quickly.
            </p>
          </div>
          <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
            🛡️ Structured graph extraction · Causal edge paths · Compact token footprint
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
