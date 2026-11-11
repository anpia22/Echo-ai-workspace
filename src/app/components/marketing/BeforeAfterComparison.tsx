import { FadeIn } from "./motion";

export function BeforeAfterComparison() {
  return (
    <section className="py-14 sm:py-20">
      <div className="mx-auto max-w-2xl text-center mb-12">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
          Proof of Value
        </span>
        <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Why linear chat fails hard decisions
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
          When teams evaluate high-stakes architecture choices in Slack or ChatGPT, trade-offs get buried in scrolling text. Echo turns chaotic debate into a permanent, actionable system of record.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: The Chaos of Linear Chat */}
        <FadeIn
          direction="up"
          delay={50}
          className="flex flex-col rounded-3xl border border-rose-200/80 bg-rose-50/30 p-6 dark:border-rose-900/40 dark:bg-rose-950/10 sm:p-7"
        >
          <div className="flex items-center justify-between border-b border-rose-200/60 pb-4 dark:border-rose-900/40">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                The Linear Chat Void
              </span>
              <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-white">
                Unstructured AI / Slack Thread
              </h3>
            </div>
            <span className="text-xs text-rose-600 dark:text-rose-400 font-mono">45 messages buried</span>
          </div>

          <div className="mt-5 space-y-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
            <div className="rounded-xl border border-zinc-200/70 bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="font-semibold text-zinc-900 dark:text-white">Staff Eng:</span> &quot;API is choking at 15k QPS. Should we shard with Citus or add a Redis caching layer?&quot;
            </div>
            <div className="rounded-xl border border-zinc-200/70 bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="font-semibold text-zinc-900 dark:text-white">AI Assistant:</span> &quot;Sharding distributes load horizontally across multiple nodes. Redis provides sub-millisecond in-memory lookups. Both have pros and cons [400 words clipped]...&quot;
            </div>
            <div className="rounded-xl border border-zinc-200/70 bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="font-semibold text-zinc-900 dark:text-white">Tech Lead:</span> &quot;Wait, Citus introduces distributed deadlocks with our current schema. What about cache invalidation in Redis?&quot;
            </div>
            <div className="rounded-xl border border-dashed border-rose-300/80 bg-rose-100/50 p-3 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300">
              <span className="font-semibold">3 weeks later:</span> &quot;Wait, why did we reject Citus again? Who agreed to this? Where are the follow-up tickets?&quot;
            </div>
          </div>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-rose-200 bg-white/90 p-4 text-xs dark:border-rose-900/50 dark:bg-zinc-900/80">
              <p className="font-semibold text-rose-700 dark:text-rose-400">The Failure Mode:</p>
              <ul className="mt-1.5 space-y-1 text-zinc-600 dark:text-zinc-400">
                <li>❌ Trade-offs and rationale disappear into chat scrollback.</li>
                <li>❌ No institutional memory: new hires can&apos;t see why options were rejected.</li>
                <li>❌ Thinking doesn&apos;t lead to action; tickets must be manually recreated.</li>
              </ul>
            </div>
          </div>
        </FadeIn>

        {/* RIGHT: The Echo Decision Graph */}
        <FadeIn
          direction="up"
          delay={120}
          className="flex flex-col rounded-3xl border border-indigo-200/90 bg-indigo-50/30 p-6 shadow-lg shadow-indigo-500/5 dark:border-indigo-800/50 dark:bg-indigo-950/15 sm:p-7 ring-1 ring-indigo-500/20"
        >
          <div className="flex items-center justify-between border-b border-indigo-200/60 pb-4 dark:border-indigo-800/40">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Echo Spatial Architecture
              </span>
              <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-white">
                Living System of Record
              </h3>
            </div>
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-mono">Real-time sync</span>
          </div>

          {/* Structured Mini Graph */}
          <div className="mt-5 space-y-3 text-xs">
            {/* Problem */}
            <div className="rounded-xl border border-rose-400/60 bg-rose-500/10 p-3 text-rose-800 dark:text-rose-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">PROBLEM NODE</span>
                <span className="text-[10px] font-mono">P-01</span>
              </div>
              <p className="mt-1 font-semibold">PostgreSQL latency spike at 15k QPS checkout</p>
            </div>

            {/* Options Evaluated */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">REJECTED</span>
                <p className="mt-0.5 font-medium leading-snug">Citus Sharding</p>
                <p className="mt-1 text-[11px] opacity-80">Requires cross-table lock rewrites; 6-week delay.</p>
              </div>

              <div className="rounded-xl border border-emerald-400/70 bg-emerald-500/15 p-2.5 text-emerald-900 dark:text-emerald-200 ring-1 ring-emerald-500/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">ACCEPTED</span>
                <p className="mt-0.5 font-medium leading-snug">Read Replicas + PgBouncer</p>
                <p className="mt-1 text-[11px] opacity-80">2-day deploy, absorbs 85% read queries safely.</p>
              </div>
            </div>

            {/* Decision & Action */}
            <div className="rounded-xl border border-violet-400/60 bg-violet-500/10 p-3 text-violet-800 dark:text-violet-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">DECISION RECORDED</span>
                <span className="text-[10px] font-mono">Owner: @alex · 3m ago</span>
              </div>
              <p className="mt-1 font-semibold">Deploy 2 Aurora read replicas & route checkout telemetry</p>
            </div>

            {/* Linear Task Export */}
            <div className="flex items-center justify-between rounded-xl border border-zinc-300 bg-white p-2.5 text-zinc-700 shadow-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600 text-[10px] font-bold text-white">L</span>
                <span className="font-mono text-[11px] font-medium">LIN-289: Configure PgBouncer connection pooling</span>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                Synced
              </span>
            </div>
          </div>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-indigo-200 bg-white/90 p-4 text-xs dark:border-indigo-900/50 dark:bg-zinc-900/80">
              <p className="font-semibold text-indigo-700 dark:text-indigo-400">The Echo Advantage:</p>
              <ul className="mt-1.5 space-y-1 text-zinc-600 dark:text-zinc-400">
                <li>✅ Trade-offs remain spatially connected and visible at a glance.</li>
                <li>✅ Institutional memory: why options were rejected is permanently preserved.</li>
                <li>✅ Directly bridges thinking to execution with structured task and schema exports.</li>
              </ul>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
