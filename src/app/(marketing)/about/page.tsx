import type { Metadata } from "next";
import Link from "next/link";
import OpenEchoButton from "../../components/marketing/OpenEchoButton";
import { FadeIn, Stagger } from "../../components/marketing/motion";

export const metadata: Metadata = {
  title: "About Echo",
  description:
    "Learn why Echo was built: to eliminate fragmentation between conversational AI and visual thinking by unifying them into one connected workspace.",
  openGraph: {
    title: "About Echo",
    description:
      "Learn why Echo was built: to eliminate fragmentation between conversational AI and visual thinking by unifying them into one connected workspace.",
    type: "website",
  },
};

// ─── Tiny inline decorative components ───────────────────────────────────────

function NodeDot({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`h-1.5 w-1.5 rounded-full bg-zinc-600 ${className}`}
    />
  );
}

function ConnectorLine({ vertical = false }: { vertical?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={
        vertical
          ? "w-px bg-gradient-to-b from-zinc-700 to-transparent mx-auto"
          : "h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent"
      }
    />
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
      {children}
    </p>
  );
}

// ─── Hero abstract visual ─────────────────────────────────────────────────────

function HeroVisual() {
  const layers = [
    { label: "Thought", sub: "natural language", col: "text-zinc-300" },
    { label: "Echo", sub: "connected AI", col: "text-white" },
    { label: "Workspace", sub: "structured canvas", col: "text-zinc-400" },
  ];
  return (
    <div
      aria-hidden="true"
      className="relative flex flex-col items-center gap-0 select-none w-52 sm:w-60 animate-echo-float"
    >
      {/* Dynamic ambient backdrop glow */}
      <div className="absolute -inset-4 bg-gradient-to-b from-indigo-500/20 via-purple-500/20 to-indigo-500/10 rounded-3xl blur-2xl opacity-75 animate-ambient-glow pointer-events-none -z-10" />

      {layers.map((layer, i) => (
        <div key={layer.label} className="flex flex-col items-center w-full">
          <div
            className={`w-full rounded-2xl border px-5 py-4 text-center backdrop-blur-md transition-all duration-300 hover:scale-[1.03] ${
              i === 1
                ? "border-indigo-500/50 bg-zinc-900/95 shadow-xl shadow-indigo-500/20 ring-1 ring-indigo-500/30 animate-echo-pulse"
                : "border-zinc-800 bg-zinc-950/70 hover:border-zinc-700"
            }`}
          >
            <span
              className={`block text-sm font-semibold tracking-tight ${layer.col}`}
            >
              {layer.label}
            </span>
            <span className="block text-[11px] text-zinc-400 mt-0.5">
              {layer.sub}
            </span>
          </div>
          {i < layers.length - 1 && (
            <div className="flex flex-col items-center h-8 relative my-0.5">
              <div className="w-0.5 flex-1 bg-gradient-to-b from-indigo-500/80 via-purple-500/80 to-zinc-700" />
              <div
                className="absolute top-1 w-1.5 h-1.5 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.9)] animate-ping"
                style={{ animationDuration: "2s" }}
              />
              <svg
                className="text-purple-400 mb-px"
                width="9"
                height="6"
                viewBox="0 0 8 5"
                fill="currentColor"
              >
                <path d="M4 5L0 0h8L4 5z" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Section 4 workspace concept cards ───────────────────────────────────────

function ConversationIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="text-zinc-400"
    >
      <path
        d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v7A1.5 1.5 0 0 1 15.5 13H7l-4 4V4.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CanvasIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="text-zinc-400"
    >
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="15" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="15" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 5h6M5.7 7l3.6 6.3M14.3 7l-3.6 6.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ContextIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="text-zinc-400"
    >
      <rect x="2" y="3" width="16" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="8.5" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="13.5" width="8" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

type WorkspaceBlock = {
  icon: React.ReactNode;
  heading: string;
  body: string;
};

const WORKSPACE_BLOCKS: WorkspaceBlock[] = [
  {
    icon: <ConversationIcon />,
    heading: "Conversation",
    body:
      "Natural language is the starting point. You think out loud — through questions, prompts, or rough ideas — and Echo responds and helps shape your thinking.",
  },
  {
    icon: <CanvasIcon />,
    heading: "Canvas",
    body:
      "Ideas don't have to stay locked in a linear chat thread. Echo gives ideas a visual place to develop on a spatial canvas, where concepts and relationships can be explored together.",
  },
  {
    icon: <ContextIcon />,
    heading: "Context",
    body:
      "The workspace keeps ideas connected. Discussion and visual thinking stay aligned in one unified space, so thoughts don't get lost as your project develops.",
  },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="w-full max-w-5xl mx-auto">

      {/* ─── SECTION 1: HERO ──────────────────────────────────────────── */}
      <section className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24 pt-4 pb-24 sm:pb-32">
        {/* Left: Copy */}
        <FadeIn direction="up" className="flex-1 min-w-0 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-500 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" aria-hidden="true" />
            About Echo
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-900 dark:text-white leading-[1.12] mb-6 text-balance">
            An AI Workspace That Thinks with You
          </h1>

          <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0 text-balance">
            Echo brings conversation and visual thinking together into one
            connected workspace — so ideas don&apos;t get lost between a chat box and
            everything else.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-8">
            <OpenEchoButton className="text-sm px-5 py-2.5" />
            <Link
              href="/how-it-works"
              className="echo-secondary-btn inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition-all px-4 py-2.5 rounded-xl border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/80 shadow-sm"
            >
              <span>See how it works</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" className="text-zinc-400 dark:text-zinc-500">
                <path d="M2.5 6h7m-3.5-3.5L9.5 6 6 9.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </FadeIn>

        {/* Right: Abstract visual */}
        <FadeIn direction="up" delay={120} className="flex-shrink-0 flex items-center justify-center lg:justify-end">
          <HeroVisual />
        </FadeIn>
      </section>

      <ConnectorLine />

      {/* ─── SECTION 2: THE PROBLEM ───────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="flex flex-col md:flex-row gap-12 md:gap-20">
          {/* Left: Heading */}
          <FadeIn direction="up" className="md:w-64 lg:w-72 flex-shrink-0">
            <SectionLabel>The Problem</SectionLabel>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white leading-snug text-balance">
              Thinking Gets Fragmented
            </h2>
          </FadeIn>

          {/* Right: Copy + fragment cards */}
          <FadeIn direction="up" delay={100} className="flex-1 min-w-0">
            <p className="text-zinc-400 leading-relaxed mb-10">
              Most AI tools operate in isolation. A chat window here, a
              whiteboard there, notes somewhere else. When conversations scroll
              away, the broader picture is easily lost, and ideas struggle to
              connect into anything coherent.
            </p>

            {/* Fragment cards */}
            <Stagger className="grid grid-cols-2 sm:grid-cols-4 gap-3" step={60}>
              {["Chat", "Ideas", "Context", "Canvas"].map((fragment) => (
                <div
                  key={fragment}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700"
                >
                  <span className="text-xs font-medium text-zinc-400">
                    {fragment}
                  </span>
                  <div className="mt-2 flex justify-center">
                    <NodeDot />
                  </div>
                </div>
              ))}
            </Stagger>

            <p className="mt-6 text-xs text-zinc-600 leading-relaxed">
              These pieces exist independently in most workflows. Echo is
              designed to bring conversation and visual thinking together.
            </p>
          </FadeIn>
        </div>
      </section>

      <ConnectorLine />

      {/* ─── SECTION 3: THE ECHO IDEA ─────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="text-center mb-16">
          <SectionLabel>The Echo Idea</SectionLabel>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-white text-balance">
            Conversation Becomes Workspace
          </h2>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto leading-relaxed text-balance">
            You talk with Echo. Echo helps organize the thinking. The workspace
            gives ideas a visual place to develop — keeping your thinking
            connected and clear.
          </p>
        </div>

        {/* Flow diagram */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-0 sm:gap-0 max-w-2xl mx-auto">
          {[
            { label: "Conversation", sub: "You think out loud" },
            { label: "Echo AI", sub: "Organizes and responds" },
            { label: "Structured Thinking", sub: "Concepts and connections" },
            { label: "Workspace", sub: "A visual place to develop" },
          ].map((step, i, arr) => (
            <div
              key={step.label}
              className="flex flex-col sm:flex-row items-center w-full sm:w-auto"
            >
              {/* Step card */}
              <div className="flex flex-col items-center sm:items-center text-center w-full sm:w-auto px-4 py-3 sm:px-0">
                <div
                  className={`rounded-2xl border px-5 py-3.5 w-full sm:w-40 md:w-44 transition-all duration-300 hover:-translate-y-1 ${
                    i === 1
                      ? "border-indigo-500/50 bg-zinc-900 shadow-xl shadow-indigo-500/15 ring-1 ring-indigo-500/20 animate-echo-pulse"
                      : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      i === 1 ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1">{step.sub}</p>
                </div>
              </div>

              {/* Connector arrow (not after last item) */}
              {i < arr.length - 1 && (
                <div className="flex flex-col sm:flex-row items-center">
                  {/* Vertical on mobile */}
                  <div className="h-6 w-0.5 bg-gradient-to-b from-indigo-500/80 to-zinc-700 sm:hidden" aria-hidden="true" />
                  <svg
                    aria-hidden="true"
                    className="text-indigo-400 sm:hidden mb-px"
                    width="8"
                    height="5"
                    viewBox="0 0 8 5"
                    fill="currentColor"
                  >
                    <path d="M4 5L0 0h8L4 5z" />
                  </svg>
                  {/* Horizontal on desktop */}
                  <div className="hidden sm:flex items-center gap-1 px-1.5">
                    <div className="w-5 h-0.5 bg-gradient-to-r from-zinc-700 via-indigo-500/80 to-indigo-400" />
                    <svg
                      aria-hidden="true"
                      className="text-indigo-400 animate-pulse"
                      width="6"
                      height="9"
                      viewBox="0 0 5 8"
                      fill="currentColor"
                    >
                      <path d="M5 4L0 0v8L5 4z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <ConnectorLine />

      {/* ─── SECTION 4: WORKSPACE MODEL ───────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <FadeIn direction="up" className="text-center mb-14">
          <SectionLabel>Workspace Model</SectionLabel>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Built around the way ideas actually move.
          </h2>
        </FadeIn>

        <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-5" step={80}>
          {WORKSPACE_BLOCKS.map((block) => (
            <div
              key={block.heading}
              className="group rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6 hover:border-indigo-500/40 hover:bg-zinc-900/70 hover:-translate-y-1.5 hover:shadow-[0_12px_35px_-5px_rgba(99,102,241,0.18)] transition-all duration-300"
            >
              <div className="mb-4 flex items-center justify-center h-11 w-11 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 group-hover:border-indigo-500/50 group-hover:bg-indigo-950/50 group-hover:text-indigo-300 group-hover:scale-110 transition-all duration-300 shadow-sm">
                {block.icon}
              </div>
              <h3 className="text-base font-semibold text-white mb-2 group-hover:text-indigo-200 transition-colors">
                {block.heading}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {block.body}
              </p>
            </div>
          ))}
        </Stagger>
      </section>

      <ConnectorLine />

      {/* ─── SECTION 5: CLOSING CTA ───────────────────────────────────── */}
      <section className="py-20 sm:py-28 text-center">
        <FadeIn scale className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-500 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Ready when you are
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-4 text-balance">
            Give Your Ideas a Workspace
          </h2>

          <p className="text-zinc-600 dark:text-zinc-400 text-base sm:text-lg max-w-md mx-auto leading-relaxed mb-10 text-balance">
            Open Echo and start thinking with it.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <OpenEchoButton className="text-sm px-6 py-3" />
            <Link
              href="/how-it-works"
              className="echo-secondary-btn inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition-all px-4 py-2.5 rounded-xl border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/80 shadow-sm"
            >
              <span>See how it works</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" className="text-zinc-400 dark:text-zinc-500">
                <path d="M2.5 6h7m-3.5-3.5L9.5 6 6 9.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </FadeIn>
      </section>

    </div>
  );
}
