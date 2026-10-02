import type { Metadata } from "next";
import Link from "next/link";
import OpenEchoButton from "../../components/marketing/OpenEchoButton";
import { FadeIn } from "../../components/marketing/motion";

export const metadata: Metadata = {
  title: "How Echo Works",
  description:
    "Explore how Echo turns conversation into structured visual thinking on a spatial canvas through bidirectional AI reasoning and persistent context.",
  openGraph: {
    title: "How Echo Works",
    description:
      "Explore how Echo turns conversation into structured visual thinking on a spatial canvas through bidirectional AI reasoning and persistent context.",
    type: "website",
  },
};

// ─── Shared decorators ────────────────────────────────────────────────────────

function SectionLabel({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500 ${className}`}>
      {children}
    </span>
  );
}

function Divider() {
  return (
    <div
      aria-hidden="true"
      className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent"
    />
  );
}

// ─── Hero process flow ────────────────────────────────────────────────────────

const FLOW_STAGES = [
  { label: "Thought", sub: "Where it starts" },
  { label: "Conversation", sub: "Talk it through" },
  { label: "Echo", sub: "Shapes the thinking" },
  { label: "Canvas", sub: "A visual place" },
];

function HeroFlow() {
  return (
    <div aria-hidden="true" className="relative w-full max-w-3xl mx-auto">
      {/* Dynamic ambient backdrop glow */}
      <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/15 via-purple-500/20 to-indigo-500/15 rounded-3xl blur-2xl opacity-60 animate-ambient-glow pointer-events-none -z-10" />

      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-center justify-center gap-0">
        {FLOW_STAGES.map((stage, i) => (
          <div key={stage.label} className="flex items-center">
            <div
              className={`flex flex-col items-center justify-center text-center rounded-2xl border px-5 py-4 w-36 md:w-40 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl ${
                i === 2
                  ? "border-indigo-500/50 bg-zinc-900/90 shadow-xl shadow-indigo-500/20 ring-1 ring-indigo-500/30 animate-echo-pulse"
                  : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
              }`}
            >
              <span
                className={`text-sm font-semibold tracking-tight ${
                  i === 2 ? "text-white" : "text-zinc-300"
                }`}
              >
                {stage.label}
              </span>
              <span className="block text-[10px] text-zinc-500 mt-1">
                {stage.sub}
              </span>
            </div>
            {i < FLOW_STAGES.length - 1 && (
              <div className="flex items-center px-1.5 relative">
                <div className="w-5 md:w-7 h-0.5 bg-gradient-to-r from-zinc-700 via-indigo-500/80 to-purple-500/80" />
                <svg width="6" height="9" viewBox="0 0 5 8" fill="currentColor" className="text-indigo-400 animate-pulse ml-0.5">
                  <path d="M5 4L0 0v8L5 4z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile: vertical */}
      <div className="flex sm:hidden flex-col items-center gap-0">
        {FLOW_STAGES.map((stage, i) => (
          <div key={stage.label} className="flex flex-col items-center w-full">
            <div
              className={`w-full max-w-xs rounded-2xl border px-5 py-4 text-center transition-all duration-300 hover:border-zinc-700 ${
                i === 2
                  ? "border-indigo-500/50 bg-zinc-900/90 shadow-xl shadow-indigo-500/20 ring-1 ring-indigo-500/30 animate-echo-pulse"
                  : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              <span
                className={`block text-sm font-semibold tracking-tight ${
                  i === 2 ? "text-white" : "text-zinc-300"
                }`}
              >
                {stage.label}
              </span>
              <span className="block text-[10px] text-zinc-500 mt-1">
                {stage.sub}
              </span>
            </div>
            {i < FLOW_STAGES.length - 1 && (
              <div className="flex flex-col items-center h-8 relative my-1">
                <div className="w-0.5 flex-1 bg-gradient-to-b from-zinc-700 via-indigo-500/80 to-purple-500/80" />
                <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className="text-indigo-400 animate-pulse mb-px">
                  <path d="M4 5L0 0h8L4 5z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step wrapper ─────────────────────────────────────────────────────────────

interface StepProps {
  number: string;
  eyebrow: string;
  heading: string;
  body: React.ReactNode;
  visual: React.ReactNode;
  flip?: boolean;
}

function Step({ number, eyebrow, heading, body, visual, flip = false }: StepProps) {
  return (
    <section className="py-20 sm:py-28">
      <div
        className={`flex flex-col gap-12 md:gap-16 md:flex-row items-center ${
          flip ? "md:flex-row-reverse" : ""
        }`}
      >
        <FadeIn direction="up" className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-mono text-zinc-500 font-medium select-none">{number}</span>
            <div className="h-px w-6 bg-zinc-800" aria-hidden="true" />
            <SectionLabel>{eyebrow}</SectionLabel>
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white leading-snug mb-5 text-balance">
            {heading}
          </h2>
          <div className="text-zinc-600 dark:text-zinc-400 leading-relaxed space-y-4 text-base text-pretty">
            {body}
          </div>
        </FadeIn>

        <FadeIn direction="up" delay={120} className="flex-shrink-0 w-full md:w-auto md:max-w-xs lg:max-w-sm xl:max-w-md flex justify-center">
          {visual}
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Step 01 visual ───────────────────────────────────────────────────────────

function ThoughtVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-xs rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 select-none">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="text-[10px] uppercase tracking-widest text-zinc-600">New idea</span>
      </div>
      {[
        { text: "How do these pieces fit together?", dim: false },
        { text: "What's the core problem here?", dim: true },
        { text: "I need to think through the options.", dim: true },
      ].map((line, i) => (
        <div
          key={i}
          className={`text-sm leading-relaxed mb-3 pl-3 border-l border-zinc-800 ${
            line.dim ? "text-zinc-600" : "text-zinc-300"
          }`}
        >
          {line.text}
        </div>
      ))}
      <div className="mt-5 flex items-center gap-1.5">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-[10px] text-zinc-700">Any starting point works</span>
      </div>
    </div>
  );
}

// ─── Step 02 visual ───────────────────────────────────────────────────────────

function ConversationVisual() {
  const messages = [
    { role: "you", text: "What are the main pieces of this problem?" },
    { role: "echo", text: "Let's break it into a few connected parts and explore each one." },
    { role: "you", text: "Can you show me how they relate?" },
  ];
  return (
    <div aria-hidden="true" className="w-full max-w-xs space-y-3 select-none">
      <div className="text-[10px] uppercase tracking-widest text-zinc-700 mb-4 pl-1">
        Illustrative conversation
      </div>
      {messages.map((msg, i) => (
        <div key={i} className={`flex gap-2.5 ${msg.role === "you" ? "justify-end" : "justify-start"}`}>
          {msg.role === "echo" && (
            <div className="flex-shrink-0 h-6 w-6 rounded-full border border-zinc-700 bg-zinc-900 flex items-center justify-center">
              <span className="text-[8px] font-semibold text-zinc-400">E</span>
            </div>
          )}
          <div
            className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
              msg.role === "you"
                ? "bg-zinc-800 text-zinc-200"
                : "border border-zinc-800 bg-zinc-900/60 text-zinc-300"
            }`}
          >
            {msg.text}
          </div>
        </div>
      ))}
      <div className="flex gap-2.5 justify-start">
        <div className="flex-shrink-0 h-6 w-6 rounded-full border border-zinc-700 bg-zinc-900 flex items-center justify-center">
          <span className="text-[8px] font-semibold text-zinc-400">E</span>
        </div>
        <div className="border border-indigo-500/30 bg-zinc-900/80 rounded-xl px-4 py-3 flex items-center gap-1.5 shadow-sm shadow-indigo-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDuration: "0.9s", animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDuration: "0.9s", animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDuration: "0.9s", animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Step 03 visual ───────────────────────────────────────────────────────────

function StructureVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-xs select-none">
      <div className="mb-5">
        <span className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-2.5 font-semibold">
          Scattered ideas
        </span>
        <div className="flex flex-wrap gap-2">
          {["Idea A", "Idea B", "Idea C", "Idea D"].map((label) => (
            <div
              key={label}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-xs text-zinc-400"
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5 my-4">
        <div className="flex-1 h-px bg-zinc-800/80" />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-900/60">
          <span className="text-[10px] text-zinc-400 font-medium">Echo helps organize</span>
          <svg width="7" height="9" viewBox="0 0 7 9" fill="currentColor" className="text-zinc-500">
            <path d="M3.5 9L0 4h2.5V0h2v4H7L3.5 9z" />
          </svg>
        </div>
        <div className="flex-1 h-px bg-zinc-800/80" />
      </div>

      <div>
        <span className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-2.5 font-semibold">
          Connected structure
        </span>
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/20 p-2">
          <svg
            className="w-full h-auto block"
            viewBox="0 0 280 160"
            fill="none"
          >
            {/* Tree connector lines */}
            <path
              d="M 140 34 V 50 H 74 V 66"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-echo-beam"
            />
            <path
              d="M 140 50 H 206 V 66"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-echo-beam"
            />
            <path
              d="M 74 94 V 110 H 140 V 126"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-echo-beam"
            />
            <path
              d="M 206 94 V 110 H 140 V 126"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-echo-beam"
            />

            {/* Dynamic traveling energy packets */}
            <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
              <animateMotion path="M 140 34 V 50 H 74 V 66" dur="2.2s" repeatCount="indefinite" />
            </circle>
            <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
              <animateMotion path="M 140 50 H 206 V 66" dur="2.2s" begin="0.3s" repeatCount="indefinite" />
            </circle>
            <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
              <animateMotion path="M 74 94 V 110 H 140 V 126" dur="2.2s" begin="1.1s" repeatCount="indefinite" />
            </circle>
            <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
              <animateMotion path="M 206 94 V 110 H 140 V 126" dur="2.2s" begin="1.4s" repeatCount="indefinite" />
            </circle>

            {/* Core Idea */}
            <rect x="88" y="6" width="104" height="28" rx="8" fill="#18181b" stroke="#6366f1" strokeWidth="1.5" />
            <text x="140" y="24" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif">
              Core Idea
            </text>

            {/* Option A */}
            <rect x="28" y="66" width="92" height="28" rx="7" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
            <text x="74" y="84" textAnchor="middle" fill="#d4d4d8" fontSize="11" fontWeight="400" fontFamily="system-ui, -apple-system, sans-serif">
              Option A
            </text>

            {/* Option B */}
            <rect x="160" y="66" width="92" height="28" rx="7" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
            <text x="206" y="84" textAnchor="middle" fill="#d4d4d8" fontSize="11" fontWeight="400" fontFamily="system-ui, -apple-system, sans-serif">
              Option B
            </text>

            {/* Decision */}
            <rect x="92" y="126" width="96" height="28" rx="7" fill="#18181b" stroke="#10b981" strokeWidth="1.5" />
            <text x="140" y="144" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif">
              Decision
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Step 04 visual ───────────────────────────────────────────────────────────

function CanvasVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden select-none shadow-xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/40">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
          <div className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
          <div className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
        </div>
        <div className="flex-1 mx-3 h-5 rounded-md bg-zinc-900/80 border border-zinc-800/80 flex items-center px-2">
          <span className="text-[9px] text-zinc-600 font-mono">echo://canvas/preview</span>
        </div>
        <div className="text-[10px] text-zinc-600 font-medium">Canvas</div>
      </div>

      <div className="relative p-3 bg-zinc-950">
        <svg
          className="w-full h-auto block"
          viewBox="0 0 320 216"
          fill="none"
        >
          {/* Subtle canvas dot grid */}
          <defs>
            <pattern id="canvas-dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="0.75" fill="#27272a" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#canvas-dots)" />

          {/* Connection lines directly between node borders */}
          <path d="M 160 44 L 76 92" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
          <path d="M 160 44 L 244 92" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
          <path d="M 76 120 L 160 166" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
          <path d="M 244 120 L 160 166" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />

          {/* Traveling pulses */}
          <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
            <animateMotion path="M 160 44 L 76 92" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
            <animateMotion path="M 160 44 L 244 92" dur="2.4s" begin="0.4s" repeatCount="indefinite" />
          </circle>
          <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
            <animateMotion path="M 76 120 L 160 166" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
          </circle>
          <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
            <animateMotion path="M 244 120 L 160 166" dur="2.4s" begin="1.6s" repeatCount="indefinite" />
          </circle>

          {/* Connection port dots */}
          <circle cx="160" cy="44" r="2.5" fill="#818cf8" />
          <circle cx="76" cy="92" r="2.5" fill="#818cf8" />
          <circle cx="244" cy="92" r="2.5" fill="#818cf8" />
          <circle cx="76" cy="120" r="2.5" fill="#818cf8" />
          <circle cx="244" cy="120" r="2.5" fill="#818cf8" />
          <circle cx="160" cy="166" r="2.5" fill="#818cf8" />

          {/* Core Idea Node */}
          <rect x="112" y="14" width="96" height="30" rx="8" fill="#18181b" stroke="#6366f1" strokeWidth="1.5" />
          <text x="160" y="33" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif">
            Core Idea
          </text>

          {/* Option A Node */}
          <rect x="32" y="92" width="88" height="28" rx="7" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
          <text x="76" y="110" textAnchor="middle" fill="#d4d4d8" fontSize="11" fontWeight="400" fontFamily="system-ui, -apple-system, sans-serif">
            Option A
          </text>

          {/* Option B Node */}
          <rect x="200" y="92" width="88" height="28" rx="7" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
          <text x="244" y="110" textAnchor="middle" fill="#d4d4d8" fontSize="11" fontWeight="400" fontFamily="system-ui, -apple-system, sans-serif">
            Option B
          </text>

          {/* Decision Node */}
          <rect x="114" y="166" width="92" height="28" rx="7" fill="#18181b" stroke="#10b981" strokeWidth="1.5" />
          <text x="160" y="184" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif">
            Decision
          </text>

          {/* Remote collaborator cursor glide */}
          <g transform="translate(195, 126)" className="animate-echo-float-fast">
            <polygon points="0,0 0,12 3,10 6,15 8,14 5,9 9,9" fill="#10b981" />
            <rect x="8" y="9" width="38" height="15" rx="3" fill="#10b981" />
            <text x="27" y="20" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="600" fontFamily="sans-serif">Alex</text>
          </g>
        </svg>
      </div>

      <div className="px-4 py-2 border-t border-zinc-800/60 flex items-center justify-between bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-zinc-400 font-medium">Real-time canvas view</span>
        </div>
        <span className="text-[10px] text-indigo-400">Live sync</span>
      </div>
    </div>
  );
}

// ─── Step 05 visual ───────────────────────────────────────────────────────────

function ContinuationVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-xs space-y-3 select-none">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-[10px] uppercase tracking-widest text-zinc-700 mb-2">Your workspace</div>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
            <span className="text-xs text-zinc-400 leading-relaxed">Core Idea — established</span>
          </div>
          <div className="flex items-start gap-2">
            <div className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-700 flex-shrink-0" />
            <span className="text-xs text-zinc-500 leading-relaxed">Option A — explored</span>
          </div>
          <div className="flex items-start gap-2">
            <div className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-700 flex-shrink-0" />
            <span className="text-xs text-zinc-500 leading-relaxed">Decision — reached</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-[10px] text-zinc-700 whitespace-nowrap">Continue the thinking</span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">New thought</div>
        <div className="flex items-start gap-2">
          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="text-xs text-zinc-300 leading-relaxed">What happens next with the decision?</span>
        </div>
        <div className="mt-3 h-px bg-zinc-800" />
        <div className="mt-2 text-[10px] text-zinc-700">Adds to the existing workspace</div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HowItWorksPage() {
  return (
    <div className="w-full max-w-5xl mx-auto">

      {/* ─── SECTION 1: HERO ─────────────────────────────────────────── */}
      <section className="pt-4 pb-20 sm:pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-slate-100/90 dark:bg-zinc-900/60 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-400 mb-6 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
          How It Works
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-900 dark:text-white leading-[1.12] mb-6 max-w-3xl mx-auto text-balance">
          From a Thought to a Workspace
        </h1>

        <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed mb-10 max-w-xl mx-auto text-balance">
          Start with a thought. Talk it through with Echo. Then give those ideas
          a visual place to develop.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
          <OpenEchoButton className="text-sm px-6 py-3" />
          <Link
            href="/use-cases"
            className="echo-secondary-btn inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition-all px-4 py-2.5 rounded-xl border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/80 shadow-sm"
          >
            <span>Explore use cases</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" className="text-zinc-400 dark:text-zinc-500">
              <path d="M2.5 6h7m-3.5-3.5L9.5 6 6 9.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <HeroFlow />
      </section>

      <Divider />

      {/* ─── STEP 01 ─────────────────────────────────────────────────── */}
      <Step
        number="01"
        eyebrow="Start with a thought"
        heading="Bring the Rough Idea"
        body={
          <>
            <p>
              You don&apos;t need a perfectly structured prompt. Start with a
              question, a problem, a decision — anything you&apos;re trying to think
              through.
            </p>
            <p>
              Echo is designed to work from the beginning of a thought, not just
              its finished form. Any starting point works.
            </p>
          </>
        }
        visual={<ThoughtVisual />}
      />

      <Divider />

      {/* ─── STEP 02 ─────────────────────────────────────────────────── */}
      <Step
        number="02"
        eyebrow="Talk it through"
        heading="Let Conversation Shape the Idea"
        body={
          <>
            <p>
              Explore the idea through natural conversation. Ask questions, push
              back, change direction — Echo responds and helps the thinking
              develop.
            </p>
            <p>
              The conversation is the starting material. It&apos;s how the idea gets
              clearer before it becomes something you can see.
            </p>
          </>
        }
        visual={<ConversationVisual />}
        flip
      />

      <Divider />

      {/* ─── STEP 03 ─────────────────────────────────────────────────── */}
      <Step
        number="03"
        eyebrow="Shape the thinking"
        heading="Turn Conversation into Structure"
        body={
          <>
            <p>
              As the idea becomes clearer, Echo can help organize the thinking
              into connected relationships, groups, and directions.
            </p>
            <p>
              Scattered ideas start to take shape — not through automation, but
              through the thinking you do together.
            </p>
          </>
        }
        visual={<StructureVisual />}
      />

      <Divider />

      {/* ─── STEP 04 ─────────────────────────────────────────────────── */}
      <Step
        number="04"
        eyebrow="See it on the canvas"
        heading="Give the Thinking a Visual Place"
        body={
          <>
            <p>
              The canvas lets you see how ideas connect spatially. Concepts,
              options, and decisions can be laid out and explored visually —
              beyond what a linear conversation thread can show.
            </p>
            <p>
              This is where conversation and visual thinking come together in one
              shared space.
            </p>
          </>
        }
        visual={<CanvasVisual />}
        flip
      />

      <Divider />

      {/* ─── STEP 05 ─────────────────────────────────────────────────── */}
      <Step
        number="05"
        eyebrow="Keep thinking"
        heading="Return to Ideas Exactly Where You Left Them"
        body={
          <>
            <p>
              The workspace gives your ideas a place to keep developing.
              Conversation and visual thinking stay connected in one space, so
              the context of what you were exploring doesn&apos;t get scattered.
            </p>
            <p>
              Pick up where you left off, add a new thought, or explore a
              different direction — all within the same workspace.
            </p>
          </>
        }
        visual={<ContinuationVisual />}
      />

      <Divider />

      {/* ─── CLOSING CTA ─────────────────────────────────────── */}
      <section className="py-20 sm:py-28 text-center">
        <FadeIn scale className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-slate-100/90 dark:bg-zinc-900/60 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-400 mb-6 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Ready When You Are
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-4 text-balance">
            Ready to Think with Echo?
          </h2>

          <p className="text-zinc-600 dark:text-zinc-400 text-base sm:text-lg max-w-md mx-auto leading-relaxed mb-10 text-balance">
            Start with an idea and give it a workspace.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <OpenEchoButton className="text-sm px-6 py-3" />
            <Link
              href="/use-cases"
              className="echo-secondary-btn inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition-all px-4 py-2.5 rounded-xl border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/80 shadow-sm"
            >
              <span>Explore use cases</span>
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
