import type { Metadata } from "next";
import Link from "next/link";
import OpenEchoButton from "../../components/marketing/OpenEchoButton";
import { FadeIn, Stagger } from "../../components/marketing/motion";

export const metadata: Metadata = {
  title: "Use Cases",
  description:
    "Discover four primary ways to think with Echo: explore complex problems, plan sequential projects, evaluate architectural decisions, and create emergent ideas.",
  openGraph: {
    title: "Use Cases",
    description:
      "Discover four primary ways to think with Echo: explore complex problems, plan sequential projects, evaluate architectural decisions, and create emergent ideas.",
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

// ─── Section 2: Thinking Modes Overview Map ───────────────────────────────────

function OverviewMap() {
  const modes = [
    { name: "Explore", desc: "Questions & relationships", color: "text-zinc-300" },
    { name: "Plan", desc: "Sequence & dependencies", color: "text-zinc-300" },
    { name: "Decide", desc: "Options & trade-offs", color: "text-zinc-300" },
    { name: "Create", desc: "Concepts & iteration", color: "text-zinc-300" },
  ];

  return (
    <div aria-hidden="true" className="w-full max-w-3xl mx-auto select-none">
      {/* Desktop / Tablet: Connected Flow Map */}
      <div className="hidden sm:block">
        <div className="relative flex flex-col items-center">
          {/* Dynamic ambient backdrop glow */}
          <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/15 via-purple-500/20 to-indigo-500/15 rounded-3xl blur-2xl opacity-60 animate-ambient-glow pointer-events-none -z-10" />

          {/* Hub node */}
          <div className="rounded-2xl border border-indigo-500/50 bg-white dark:bg-zinc-900/90 px-6 py-3 text-center shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/30 animate-echo-pulse">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400 block mb-0.5">
              One Workspace
            </span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">
              Conversation + Visual Canvas
            </span>
          </div>

          {/* Branching SVG connector */}
          <svg className="w-full h-12 block" viewBox="0 0 600 48" fill="none">
            {/* Center stem down from hub */}
            <path
              d="M 300 0 V 20"
              stroke="#6366f1"
              strokeWidth="1.5"
              className="animate-echo-beam"
            />
            {/* Horizontal bus */}
            <path
              d="M 75 20 H 525"
              stroke="#6366f1"
              strokeWidth="1.5"
              className="animate-echo-beam"
            />
            {/* 4 drop stems down to mode cards */}
            <path
              d="M 75 20 V 48 M 225 20 V 48 M 375 20 V 48 M 525 20 V 48"
              stroke="#6366f1"
              strokeWidth="1.5"
              className="animate-echo-beam"
            />

            {/* Traveling photon pulses to 4 modes */}
            <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
              <animateMotion path="M 300 0 V 20 H 75 V 48" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
              <animateMotion path="M 300 0 V 20 H 225 V 48" dur="2s" begin="0.25s" repeatCount="indefinite" />
            </circle>
            <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
              <animateMotion path="M 300 0 V 20 H 375 V 48" dur="2s" begin="0.5s" repeatCount="indefinite" />
            </circle>
            <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
              <animateMotion path="M 300 0 V 20 H 525 V 48" dur="2s" begin="0.75s" repeatCount="indefinite" />
            </circle>

            {/* Anchor dots */}
            <circle cx="300" cy="0" r="3" fill="#818cf8" />
            <circle cx="75" cy="48" r="3" fill="#818cf8" />
            <circle cx="225" cy="48" r="3" fill="#c084fc" />
            <circle cx="375" cy="48" r="3" fill="#818cf8" />
            <circle cx="525" cy="48" r="3" fill="#c084fc" />
          </svg>

          {/* 4 Thinking Mode Nodes */}
          <Stagger className="grid grid-cols-4 gap-3 w-full" step={60}>
            {modes.map((mode) => (
              <div
                key={mode.name}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 text-center backdrop-blur-sm hover:-translate-y-1.5 hover:border-indigo-400 dark:hover:border-indigo-500/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/80 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 shadow-sm dark:shadow-none"
              >
                <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">
                  {mode.name}
                </span>
                <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-tight">
                  {mode.desc}
                </span>
              </div>
            ))}
          </Stagger>
        </div>
      </div>

      {/* Mobile: Vertical Flow List */}
      <div className="block sm:hidden space-y-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3.5 text-center shadow-md">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-zinc-400 block mb-0.5">
            One Workspace
          </span>
          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
            Conversation + Visual Canvas
          </span>
        </div>

        <div className="flex justify-center">
          <div className="w-px h-4 bg-zinc-800" />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {modes.map((mode) => (
            <div
              key={mode.name}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-3 text-center shadow-sm"
            >
              <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">
                {mode.name}
              </span>
              <span className="block text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                {mode.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Editorial Mode Wrapper ───────────────────────────────────────────────────

interface ModeSectionProps {
  number: string;
  eyebrow: string;
  heading: string;
  description: string;
  promptsTitle: string;
  prompts: string[];
  visual: React.ReactNode;
  flip?: boolean;
}

function ModeSection({
  number,
  eyebrow,
  heading,
  description,
  promptsTitle,
  prompts,
  visual,
  flip = false,
}: ModeSectionProps) {
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

          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-base mb-6 text-pretty">
            {description}
          </p>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 p-4 shadow-sm">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold block mb-2.5">
              {promptsTitle}
            </span>
            <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
              {prompts.map((prompt, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 rounded-full bg-zinc-400 dark:bg-zinc-600 flex-shrink-0" />
                  <span className="italic text-zinc-700 dark:text-zinc-300">&ldquo;{prompt}&rdquo;</span>
                </li>
              ))}
            </ul>
          </div>
        </FadeIn>

        <FadeIn direction="up" delay={120} className="flex-shrink-0 w-full md:w-auto md:max-w-xs lg:max-w-sm xl:max-w-md flex justify-center">
          {visual}
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Mode 01: Explore Visual ──────────────────────────────────────────────────

function ExploreVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/60">
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">
          Exploratory Mapping
        </span>
      </div>

      <svg className="w-full h-auto block" viewBox="0 0 280 180" fill="none">
        {/* Connector lines from question to ideas */}
        <path d="M 140 36 L 60 76" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
        <path d="M 140 36 L 140 76" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
        <path d="M 140 36 L 220 76" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />

        {/* Traveling pulses */}
        <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
          <animateMotion path="M 140 36 L 60 76" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
          <animateMotion path="M 140 36 L 140 76" dur="2s" begin="0.3s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
          <animateMotion path="M 140 36 L 220 76" dur="2s" begin="0.6s" repeatCount="indefinite" />
        </circle>

        {/* Cross connections between ideas to synthesized clarity */}
        <path d="M 60 100 L 140 136" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
        <path d="M 140 100 L 140 136" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
        <path d="M 220 100 L 140 136" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />

        <circle r="3" fill="#10b981" filter="drop-shadow(0 0 4px #10b981)">
          <animateMotion path="M 60 100 L 140 136" dur="2.2s" begin="1s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="#10b981" filter="drop-shadow(0 0 4px #10b981)">
          <animateMotion path="M 220 100 L 140 136" dur="2.2s" begin="1.3s" repeatCount="indefinite" />
        </circle>

        {/* Question root */}
        <rect x="70" y="8" width="140" height="28" rx="7" fill="#18181b" stroke="#6366f1" strokeWidth="1.5" />
        <text x="140" y="26" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif">
          Central Question
        </text>

        {/* Idea A */}
        <rect x="15" y="76" width="90" height="24" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="60" y="92" textAnchor="middle" fill="#d4d4d8" fontSize="10" fontFamily="system-ui, -apple-system, sans-serif">
          Assumptions
        </text>

        {/* Idea B */}
        <rect x="95" y="76" width="90" height="24" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="140" y="92" textAnchor="middle" fill="#d4d4d8" fontSize="10" fontFamily="system-ui, -apple-system, sans-serif">
          Unknowns
        </text>

        {/* Idea C */}
        <rect x="175" y="76" width="90" height="24" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="220" y="92" textAnchor="middle" fill="#d4d4d8" fontSize="10" fontFamily="system-ui, -apple-system, sans-serif">
          Constraints
        </text>

        {/* Clearer picture outcome */}
        <rect x="65" y="136" width="150" height="28" rx="7" fill="#18181b" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="80" cy="150" r="2.5" fill="#10b981" className="animate-pulse" />
        <text x="146" y="154" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
          Synthesized Clarity
        </text>
      </svg>

      <div className="mt-2 text-center">
        <span className="text-[10px] text-zinc-500">Give surrounding relationships somewhere to live</span>
      </div>
    </div>
  );
}

// ─── Mode 02: Plan Visual ─────────────────────────────────────────────────────

function PlanVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/60">
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">
          Sequential Breakdown
        </span>
      </div>

      <svg className="w-full h-auto block" viewBox="0 0 280 180" fill="none">
        {/* Core goal node */}
        <rect x="75" y="8" width="130" height="26" rx="6" fill="#18181b" stroke="#6366f1" strokeWidth="1.5" />
        <text x="140" y="25" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif">
          Project Objective
        </text>

        {/* Stem down and horizontal distribution */}
        <path d="M 140 34 V 48 M 55 48 H 225 M 55 48 V 64 M 140 48 V 64 M 225 48 V 64" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />

        {/* Traveling pulses */}
        <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
          <animateMotion path="M 140 34 V 48 H 55 V 64" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
          <animateMotion path="M 140 34 V 48 H 140 V 64" dur="2.2s" begin="0.3s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
          <animateMotion path="M 140 34 V 48 H 225 V 64" dur="2.2s" begin="0.6s" repeatCount="indefinite" />
        </circle>

        {/* Three sequential stages */}
        <rect x="15" y="64" width="80" height="24" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="55" y="80" textAnchor="middle" fill="#d4d4d8" fontSize="10" fontFamily="system-ui, -apple-system, sans-serif">
          1. Research
        </text>

        <rect x="100" y="64" width="80" height="24" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="140" y="80" textAnchor="middle" fill="#d4d4d8" fontSize="10" fontFamily="system-ui, -apple-system, sans-serif">
          2. Prototype
        </text>

        <rect x="185" y="64" width="80" height="24" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="225" y="80" textAnchor="middle" fill="#d4d4d8" fontSize="10" fontFamily="system-ui, -apple-system, sans-serif">
          3. Deliver
        </text>

        {/* Dependency link from 1 -> 2 -> 3 */}
        <path d="M 95 76 H 100 M 180 76 H 185" stroke="#818cf8" strokeWidth="1.5" />

        {/* Downward convergence to execution path */}
        <path d="M 55 88 V 104 M 140 88 V 104 M 225 88 V 104 M 55 104 H 225 M 140 104 V 126" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />

        {/* Structured Path */}
        <rect x="50" y="126" width="180" height="30" rx="7" fill="#18181b" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="68" cy="141" r="2.5" fill="#10b981" className="animate-pulse" />
        <text x="144" y="145" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
          Mapped Milestones & Dependencies
        </text>
      </svg>

      <div className="mt-2 text-center">
        <span className="text-[10px] text-zinc-500">Break work apart and visualize the sequential path</span>
      </div>
    </div>
  );
}

// ─── Mode 03: Decide Visual ───────────────────────────────────────────────────

function DecideVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/60">
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">
          Option & Trade-off Matrix
        </span>
      </div>

      <svg className="w-full h-auto block" viewBox="0 0 280 180" fill="none">
        {/* Option A */}
        <rect x="15" y="10" width="115" height="42" rx="7" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="72" y="27" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif">
          Approach A
        </text>
        <text x="72" y="42" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="system-ui, -apple-system, sans-serif">
          Faster setup · Tech debt
        </text>

        {/* Option B */}
        <rect x="150" y="10" width="115" height="42" rx="7" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="207" y="27" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif">
          Approach B
        </text>
        <text x="207" y="42" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="system-ui, -apple-system, sans-serif">
          Higher effort · Scalable
        </text>

        {/* Connectors from both options to comparison layer */}
        <path d="M 72 52 V 72 H 207 V 52 M 140 72 V 88" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />

        {/* Traveling pulses */}
        <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
          <animateMotion path="M 72 52 V 72 H 140 V 88" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
          <animateMotion path="M 207 52 V 72 H 140 V 88" dur="2.2s" begin="0.4s" repeatCount="indefinite" />
        </circle>

        {/* Comparison & Trade-offs node */}
        <rect x="40" y="88" width="200" height="28" rx="6" fill="#18181b" stroke="#6366f1" strokeWidth="1.5" />
        <text x="140" y="105" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="500" fontFamily="system-ui, -apple-system, sans-serif">
          Surface Trade-offs & Criteria
        </text>

        {/* Stem down to informed decision */}
        <path d="M 140 116 V 134" stroke="#10b981" strokeWidth="1.5" className="animate-echo-beam" />

        {/* Human judgment node */}
        <rect x="60" y="134" width="160" height="28" rx="7" fill="#18181b" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="78" cy="148" r="2.5" fill="#10b981" className="animate-pulse" />
        <text x="144" y="152" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
          Informed Decision Context
        </text>
      </svg>

      <div className="mt-2 text-center">
        <span className="text-[10px] text-zinc-500">The human decides; Echo organizes the reasoning</span>
      </div>
    </div>
  );
}

// ─── Mode 04: Create Visual ───────────────────────────────────────────────────

function CreateVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/60">
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">
          Iterative Formulation
        </span>
      </div>

      <svg className="w-full h-auto block" viewBox="0 0 280 180" fill="none">
        {/* Subtle grid pattern */}
        <defs>
          <pattern id="create-dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.6" fill="#27272a" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#create-dots)" />

        {/* Fragment 1 */}
        <rect x="20" y="12" width="70" height="22" rx="5" fill="#18181b" stroke="#3f3f46" strokeWidth="1" strokeDasharray="2 2" />
        <text x="55" y="26" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="system-ui, -apple-system, sans-serif">
          Rough Note
        </text>

        {/* Fragment 2 */}
        <rect x="185" y="12" width="75" height="22" rx="5" fill="#18181b" stroke="#3f3f46" strokeWidth="1" strokeDasharray="2 2" />
        <text x="222" y="26" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="system-ui, -apple-system, sans-serif">
          Key Question
        </text>

        {/* Convergence down to conversation shaping */}
        <path d="M 55 34 L 110 58" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
        <path d="M 222 34 L 170 58" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />

        {/* Dialogue shaping container */}
        <rect x="80" y="58" width="120" height="26" rx="6" fill="#18181b" stroke="#6366f1" strokeWidth="1.5" />
        <text x="140" y="74" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
          Echo Shaping
        </text>

        {/* Divergence into structured elements */}
        <path d="M 140 84 V 98 M 65 98 H 215 M 65 98 V 112 M 140 98 V 112 M 215 98 V 112" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />

        {/* Traveling pulses */}
        <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
          <animateMotion path="M 140 84 V 98 H 65 V 112" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="#c084fc" filter="drop-shadow(0 0 4px #c084fc)">
          <animateMotion path="M 140 84 V 98 H 140 V 112" dur="2.2s" begin="0.3s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="#818cf8" filter="drop-shadow(0 0 4px #818cf8)">
          <animateMotion path="M 140 84 V 98 H 215 V 112" dur="2.2s" begin="0.6s" repeatCount="indefinite" />
        </circle>

        {/* Element A */}
        <rect x="30" y="112" width="70" height="22" rx="5" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="65" y="126" textAnchor="middle" fill="#d4d4d8" fontSize="9" fontFamily="system-ui, -apple-system, sans-serif">
          Structure
        </text>

        {/* Element B */}
        <rect x="105" y="112" width="70" height="22" rx="5" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="140" y="126" textAnchor="middle" fill="#d4d4d8" fontSize="9" fontFamily="system-ui, -apple-system, sans-serif">
          Outline
        </text>

        {/* Element C */}
        <rect x="180" y="112" width="70" height="22" rx="5" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="215" y="126" textAnchor="middle" fill="#d4d4d8" fontSize="9" fontFamily="system-ui, -apple-system, sans-serif">
          Concept
        </text>

        {/* Final output */}
        <path d="M 65 134 V 144 H 215 V 134 M 140 144 V 152" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
        <rect x="60" y="152" width="160" height="24" rx="6" fill="#18181b" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="78" cy="164" r="2.5" fill="#10b981" className="animate-pulse" />
        <text x="144" y="168" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
          Emergent Architecture
        </text>
      </svg>

      <div className="mt-2 text-center">
        <span className="text-[10px] text-zinc-500">Start rough, shape it through dialogue, and watch it take form</span>
      </div>
    </div>
  );
}

// ─── Section 7: Use Case Summary Grid ─────────────────────────────────────────

const SUMMARY_CARDS = [
  {
    title: "Explore",
    focus: "Questions, relationships, unfamiliar territory.",
    body: "Unpack messy problems, map knowns and unknowns, and find how scattered thoughts relate to each other.",
    triggers: ["Investigating new domains", "Analyzing complex systems", "Connecting disparate research"],
    iconBoxClass:
      "border-teal-200/80 bg-teal-50 text-teal-600 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-400 group-hover:border-teal-400 group-hover:bg-teal-100/70 dark:group-hover:border-teal-500/50 dark:group-hover:bg-teal-900/60",
    cardHoverClass:
      "hover:border-teal-300 dark:hover:border-teal-500/40 hover:shadow-[0_12px_35px_-5px_rgba(20,184,166,0.18)]",
    titleHoverClass:
      "group-hover:text-teal-700 dark:group-hover:text-teal-300",
    icon: (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
  },
  {
    title: "Plan",
    focus: "Projects, goals, structure, dependencies.",
    body: "Break large ambitions down into sequential steps, map requirements, and identify what needs to happen first.",
    triggers: ["Sequencing project phases", "Breaking down complex goals", "Mapping technical dependencies"],
    iconBoxClass:
      "border-blue-200/80 bg-blue-50 text-blue-600 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400 group-hover:border-blue-400 group-hover:bg-blue-100/70 dark:group-hover:border-blue-500/50 dark:group-hover:bg-blue-900/60",
    cardHoverClass:
      "hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-[0_12px_35px_-5px_rgba(59,130,246,0.18)]",
    titleHoverClass:
      "group-hover:text-blue-700 dark:group-hover:text-blue-300",
    icon: (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="2.5" />
        <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="2.5" />
        <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    title: "Decide",
    focus: "Options, criteria, trade-offs, reasoning.",
    body: "Lay alternatives side-by-side to weigh pros, cons, and downstream consequences without losing the context of why.",
    triggers: ["Architecture evaluations", "Prioritizing competing paths", "Documenting decision rationale"],
    iconBoxClass:
      "border-purple-200/80 bg-purple-50 text-purple-600 dark:border-purple-800/60 dark:bg-purple-950/40 dark:text-purple-400 group-hover:border-purple-400 group-hover:bg-purple-100/70 dark:group-hover:border-purple-500/50 dark:group-hover:bg-purple-900/60",
    cardHoverClass:
      "hover:border-purple-300 dark:hover:border-purple-500/40 hover:shadow-[0_12px_35px_-5px_rgba(168,85,247,0.18)]",
    titleHoverClass:
      "group-hover:text-purple-700 dark:group-hover:text-purple-300",
    icon: (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
    ),
  },
  {
    title: "Create",
    focus: "Ideas, concepts, outlines, problem-solving.",
    body: "Iterate freely between open dialogue and spatial layout, giving ideas room to develop before locking them down.",
    triggers: ["Drafting frameworks", "Designing workshop agendas", "Brainstorming product concepts"],
    iconBoxClass:
      "border-amber-200/80 bg-amber-50 text-amber-600 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400 group-hover:border-amber-400 group-hover:bg-amber-100/70 dark:group-hover:border-amber-500/50 dark:group-hover:bg-amber-900/60",
    cardHoverClass:
      "hover:border-amber-300 dark:hover:border-amber-500/40 hover:shadow-[0_12px_35px_-5px_rgba(245,158,11,0.18)]",
    titleHoverClass:
      "group-hover:text-amber-700 dark:group-hover:text-amber-300",
    icon: (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
  },
];

function SummaryGrid() {
  return (
    <div className="py-20 sm:py-28">
      <FadeIn direction="up" className="text-center max-w-xl mx-auto mb-14">
        <SectionLabel>Quick Reference</SectionLabel>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-white mt-2 mb-4 text-balance">
          Four Ways to Think with Echo
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400 text-base leading-relaxed text-balance">
          Echo adapts to the shape of the thinking you need to do, giving thoughts room to develop naturally.
        </p>
      </FadeIn>

      <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-6" step={80}>
        {SUMMARY_CARDS.map((card) => (
          <div
            key={card.title}
            className={`group rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 p-6 sm:p-7 flex flex-col justify-between hover:-translate-y-1.5 transition-all duration-300 shadow-sm dark:shadow-none ${card.cardHoverClass}`}
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`h-10 w-10 rounded-xl border flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-xs ${card.iconBoxClass}`}
                >
                  {card.icon}
                </div>
                <div>
                  <h3
                    className={`text-lg font-semibold text-zinc-900 dark:text-white tracking-tight transition-colors ${card.titleHoverClass}`}
                  >
                    {card.title}
                  </h3>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 block">
                    {card.focus}
                  </span>
                </div>
              </div>

              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-5">
                {card.body}
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/60">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-2 font-semibold">
                Common scenarios
              </span>
              <div className="flex flex-wrap gap-2">
                {card.triggers.map((trigger) => (
                  <span
                    key={trigger}
                    className="echo-scenario-badge"
                  >
                    {trigger}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </Stagger>
    </div>
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UseCasesPage() {
  return (
    <div className="w-full max-w-5xl mx-auto">

      {/* ─── SECTION 1: HERO ─────────────────────────────────────────── */}
      <section className="pt-4 pb-16 sm:pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-slate-100/90 dark:bg-zinc-900/60 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-400 mb-6 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
          Use Cases
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-900 dark:text-white leading-[1.12] mb-6 max-w-3xl mx-auto text-balance">
          Different Problems.{" "}
          <span className="block mt-1 sm:mt-2">One Space to Think Through Them.</span>
        </h1>

        <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed mb-10 max-w-xl mx-auto text-balance">
          Some ideas need exploring. Some need a plan. Some need a decision.
          Others need room to become something new. Echo brings conversation
          and visual thinking into one workspace.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
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

        {/* ─── SECTION 2: OVERVIEW MAP ───────────────────────────────── */}
        <OverviewMap />
      </section>

      <Divider />

      {/* ─── SECTION 3: EXPLORE ──────────────────────────────────────── */}
      <ModeSection
        number="01"
        eyebrow="Explore"
        heading="Start with a Question and Map What Surrounds It"
        description="When diving into unfamiliar territory or untangling a complex problem, start with what you know. Talk through the questions, map the uncertainties, and let the canvas show how disparate thoughts connect."
        promptsTitle="Realistic Explorations"
        prompts={[
          "What are the hidden assumptions behind this approach?",
          "How do these three disparate pieces of research connect?",
          "Where are the biggest gaps in our current understanding?",
        ]}
        visual={<ExploreVisual />}
      />

      <Divider />

      {/* ─── SECTION 4: PLAN ─────────────────────────────────────────── */}
      <ModeSection
        number="02"
        eyebrow="Plan"
        heading="Move from a Rough Idea to a Structured Path"
        description="Turn an ambition into a structured sequence. Break the work apart into manageable phases, map dependencies, and see how the pieces relate spatially without losing the context of the conversation that shaped them."
        promptsTitle="Realistic Planning"
        prompts={[
          "Break this launch initiative into three distinct phases.",
          "What needs to happen before this milestone can begin?",
          "Group these tasks by dependency and surface the critical path.",
        ]}
        visual={<PlanVisual />}
        flip
      />

      <Divider />

      {/* ─── SECTION 5: DECIDE ────────────────────────────────────────── */}
      <ModeSection
        number="03"
        eyebrow="Decide"
        heading="Make Trade-offs Visible When Choosing a Direction"
        description="When multiple paths seem possible, put the options somewhere you can actually compare them. Surface criteria, weigh downstream consequences, and keep the reasoning visible. You make the call; Echo provides the visual clarity."
        promptsTitle="Realistic Decisions"
        prompts={[
          "Compare Option A (speed) vs Option B (maintainability).",
          "What are the downstream consequences of each choice?",
          "What criteria matter most for this architectural decision?",
        ]}
        visual={<DecideVisual />}
      />

      <Divider />

      {/* ─── SECTION 6: CREATE ───────────────────────────────────────── */}
      <ModeSection
        number="04"
        eyebrow="Create"
        heading="Let Concepts Take Form Through Spatial Iteration"
        description="Start with rough fragments. Talk through the idea, shape it, move pieces around, and let the workspace become part of the creative process. Develop architectures, outlines, or presentations without premature constraints."
        promptsTitle="Realistic Creation"
        prompts={[
          "Help me structure a technical workshop on distributed state.",
          "Outline a modular design system from these initial sketches.",
          "What would a simpler version of this user journey look like?",
        ]}
        visual={<CreateVisual />}
        flip
      />

      <Divider />

      {/* ─── SECTION 7: SUMMARY GRID ─────────────────────────────────── */}
      <SummaryGrid />

      <Divider />

      {/* ─── SECTION 8: CLOSING CTA ──────────────────────────────────── */}
      <section className="py-20 sm:py-28 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-slate-100/90 dark:bg-zinc-900/60 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-400 mb-6 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Ready When You Are
        </div>

        <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-4 text-balance">
          Whatever You&apos;re Working Through, Give the Thinking Space
        </h2>

        <p className="text-zinc-600 dark:text-zinc-400 text-base sm:text-lg max-w-md mx-auto leading-relaxed mb-10 text-balance">
          Start with the idea. Talk it through. Give it somewhere to take shape.
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
      </section>

    </div>
  );
}
