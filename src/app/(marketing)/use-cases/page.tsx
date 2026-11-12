import type { Metadata } from "next";
import { withSeo } from "@/lib/seo";
import UseCaseTabs, { type UseCaseTab } from "../../components/marketing/UseCaseTabs";
import { CtaBand, GradientText, PageHero, SectionHeader } from "../../components/marketing/ui";
import { Stagger } from "../../components/marketing/motion";

export const metadata: Metadata = withSeo("/use-cases", {
  title: "Use Cases",
  description:
    "Four decisions Echo maps well: architecture choices, build vs buy, incident follow-ups and scope cuts.",
  openGraph: {
    title: "Use Cases",
    description:
      "Four decisions Echo maps well: architecture choices, build vs buy, incident follow-ups and scope cuts.",
    type: "website",
  },
});

// ─── Section 2: Thinking Modes Overview Map ───────────────────────────────────

function OverviewMap() {
  const modes = [
    { name: "Architecture", desc: "Options & trade-offs", color: "text-zinc-300" },
    { name: "Build vs buy", desc: "Criteria & scores", color: "text-zinc-300" },
    { name: "Incidents", desc: "Causes & action items", color: "text-zinc-300" },
    { name: "Scope cuts", desc: "Constraints & decisions", color: "text-zinc-300" },
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
              Conversation + Decision Map
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
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 text-center backdrop-blur-sm hover:-translate-y-1.5 hover:border-indigo-400 dark:hover:border-indigo-500/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/80 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 shadow-sm dark:shadow-none"
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
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-zinc-400 block mb-0.5">
            One Workspace
          </span>
          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
            Conversation + Decision Map
          </span>
        </div>

        <div className="flex justify-center">
          <div className="w-px h-4 bg-zinc-800" />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {modes.map((mode) => (
            <div
              key={mode.name}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3 text-center shadow-sm"
            >
              <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">
                {mode.name}
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {mode.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─── Mode 01: Explore Visual ──────────────────────────────────────────────────

function ExploreVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 select-none shadow-xl hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/60">
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">
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
        <span className="text-xs text-zinc-500">Give surrounding relationships somewhere to live</span>
      </div>
    </div>
  );
}

// ─── Mode 02: Plan Visual ─────────────────────────────────────────────────────

function PlanVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 select-none shadow-xl hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/60">
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">
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
        <span className="text-xs text-zinc-500">Break work apart and visualize the sequential path</span>
      </div>
    </div>
  );
}

// ─── Mode 03: Decide Visual ───────────────────────────────────────────────────

function DecideVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 select-none shadow-xl hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/60">
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">
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
        <span className="text-xs text-zinc-500">The human decides; Echo organizes the reasoning</span>
      </div>
    </div>
  );
}

const TABS: UseCaseTab[] = [
  {
    id: "architecture",
    label: "Architecture",
    tagline: "Shard or replicate",
    heading: "Architecture decisions",
    description:
      "Put competing designs side by side with their trade-offs, then record the one you chose and the tasks that follow.",
    example:
      "Our API chokes at 15k QPS. Shard or add read replicas? You get each option with its trade-offs, the one you chose, and the tasks that follow.",
    prompts: [
      "Our API chokes at 15k QPS. Shard or add read replicas?",
      "What are the downstream consequences of each option?",
      "Which criteria matter most for this decision?",
    ],
    visual: <DecideVisual />,
  },
  {
    id: "build-vs-buy",
    label: "Build vs buy",
    tagline: "Criteria and scores",
    heading: "Build vs buy",
    description:
      "Lay out the criteria, see how each option scores against them, and keep a recorded reason you can find again later.",
    example:
      "Build auth ourselves or buy it? You get the criteria, how each option scores against them, and a recorded reason you can find again in three months.",
    prompts: [
      "Build auth ourselves or buy it?",
      "Compare cost, risk and audit timing for each option.",
      "Record why we chose this so we can revisit it later.",
    ],
    visual: <DecideVisual />,
  },
  {
    id: "incidents",
    label: "Incidents",
    tagline: "Causes and fixes",
    heading: "Incident follow-ups",
    description:
      "Turn a post-mortem conversation into causes, fixes considered, the fix you picked and the action items.",
    example:
      "Payment webhooks failed for two hours. What do we change? You get the causes, the fixes considered, the fix you picked and the action items.",
    prompts: [
      "Payment webhooks failed for two hours. What do we change?",
      "Which causes have we confirmed and which are guesses?",
      "List the action items and who owns them.",
    ],
    visual: <ExploreVisual />,
  },
  {
    id: "scope",
    label: "Scope cuts",
    tagline: "What to drop",
    heading: "Scope cuts",
    description:
      "Name the constraint, list what is on the table, and record the cut your team agreed on.",
    example:
      "We have six weeks. What do we cut? You get the problem, the options on the table and the decision your team agreed on.",
    prompts: [
      "We have six weeks. What do we cut?",
      "What needs to happen before this milestone can start?",
      "Group these tasks by dependency.",
    ],
    visual: <PlanVisual />,
  },
];

export default function UseCasesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHero
        badge="Use cases"
        title={
          <>
            Four decisions, <GradientText>one map</GradientText> for each.
          </>
        }
        subtitle="Technical founders and engineering leads keep hitting the same four decisions. Echo drafts the map for each one, and you reshape it."
        secondary={{ href: "/how-it-works", label: "See how it works" }}
      >
        <OverviewMap />
      </PageHero>

      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="Four common decisions"
          title="Start from the one closest to yours"
          subtitle="Each example shows the prompt you might start with and what you get back."
        />
        <UseCaseTabs tabs={TABS} />
      </section>

      <CtaBand
        title="Bring one real decision"
        subtitle="Free during public beta. Start from a template or describe your own."
        secondary={{ href: "/how-it-works", label: "See how it works" }}
      />
    </div>
  );
}
