"use client";

import Link from "next/link";
import MarketingNavbar from "./components/marketing/MarketingNavbar";
import MarketingFooter from "./components/marketing/MarketingFooter";
import OpenEchoButton from "./components/marketing/OpenEchoButton";
import {
  Badge,
  GradientText,
  SecondaryLink,
  BentoGrid,
  BentoCard,
  Icons,
} from "./components/marketing/ui";

export default function NotFound() {
  return (
    <div className="echo-marketing relative isolate flex min-h-dvh flex-col overflow-x-clip bg-slate-50 text-zinc-900 selection:bg-indigo-100 selection:text-indigo-900 dark:bg-zinc-950 dark:text-white dark:selection:bg-zinc-800 dark:selection:text-white transition-colors duration-200">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-900 focus:shadow-lg dark:focus:bg-zinc-900 dark:focus:text-white"
      >
        Skip to content
      </a>

      {/* One fixed environment behind every page: soft glow and a faint canvas grid */}
      <div aria-hidden="true" className="echo-env pointer-events-none fixed inset-0 -z-10" />

      {/* Official Marketing Navbar matching the entire site */}
      <MarketingNavbar />

      <main
        id="main"
        tabIndex={-1}
        className="marketing-content min-w-0 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 flex flex-col justify-center animate-fade-in outline-none"
      >
        {/* Hero Section */}
        <section className="relative text-center">
          {/* Ambient Glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-20 -z-10 mx-auto h-72 max-w-3xl rounded-full bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-sky-500/20 blur-3xl"
          />

          <Badge>404 • Coordinate Not Found</Badge>

          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-zinc-900 text-balance dark:text-white sm:text-5xl md:text-6xl lg:text-7xl">
            Lost outside the <GradientText>canvas</GradientText>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-600 text-balance dark:text-zinc-300 sm:text-lg md:text-xl">
            The page or workspace coordinate you are looking for has been moved, unmapped, or doesn&apos;t exist in this graph.
          </p>

          <div className="mx-auto mt-9 flex w-full max-w-xs flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
            <OpenEchoButton className="px-6 py-3 text-sm">
              Launch Workspace
            </OpenEchoButton>
            <SecondaryLink href="/">
              Return to Homepage
            </SecondaryLink>
          </div>

          {/* Interactive Spatial Node Visualizer */}
          <div className="mt-12 sm:mt-16 mx-auto w-full max-w-3xl">
            <div className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/70 p-6 sm:p-8 shadow-xl backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/60 transition-all duration-300">
              {/* Card top bar */}
              <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800/60 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-500/80 animate-pulse" />
                  <span className="font-mono text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    graph_status: disconnected_node (404)
                  </span>
                </div>
                <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                  viewport: [x: 404, y: NaN]
                </span>
              </div>

              {/* Spatial Nodes Flow */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                {/* Node 1: Origin */}
                <div className="flex flex-col items-center p-4 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/80 shadow-sm">
                  <div className="h-8 w-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">Origin</span>
                  <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400">route: &quot;/&quot;</span>
                </div>

                {/* Node 2: Workspace */}
                <div className="flex flex-col items-center p-4 rounded-2xl border border-indigo-500/40 bg-indigo-50/50 dark:border-indigo-500/30 dark:bg-indigo-950/20 shadow-sm relative">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">Workspace</span>
                  <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400">route: &quot;/app&quot;</span>
                </div>

                {/* Node 3: Missing Node */}
                <div className="flex flex-col items-center p-4 rounded-2xl border border-dashed border-rose-400/80 bg-rose-50/30 dark:border-rose-500/40 dark:bg-rose-950/20 shadow-sm relative">
                  <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center mb-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Missing Node</span>
                  <span className="font-mono text-[10px] text-rose-500/80">status: 404_unresolved</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Helpful Destinations Grid */}
        <section className="mt-20 sm:mt-24">
          <div className="text-center mb-8">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
              Navigation
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              Explore active coordinates
            </h2>
          </div>

          <BentoGrid cols={3}>
            <BentoCard
              title="How It Works"
              body="See how Echo turns messy conversation into structured visual maps and clear decisions."
              icon={Icons.graph}
            >
              <Link
                href="/how-it-works"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                Learn more <span>→</span>
              </Link>
            </BentoCard>

            <BentoCard
              title="Use Cases"
              body="Explore architectures, sprint planning, and visual brainstorming workflows."
              icon={Icons.chat}
            >
              <Link
                href="/use-cases"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                Explore use cases <span>→</span>
              </Link>
            </BentoCard>

            <BentoCard
              title="Pricing & Access"
              body="Echo is currently free during beta with full access to AI spatial mapping and rooms."
              icon={Icons.layers}
            >
              <Link
                href="/pricing"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                View pricing <span>→</span>
              </Link>
            </BentoCard>
          </BentoGrid>
        </section>
      </main>

      {/* Official Marketing Footer matching the entire site */}
      <MarketingFooter />
    </div>
  );
}
