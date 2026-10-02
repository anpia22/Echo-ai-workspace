import type { Metadata } from "next";
import Link from "next/link";
import OpenEchoButton from "../../components/marketing/OpenEchoButton";
import { FadeIn, Stagger } from "../../components/marketing/motion";

export const metadata: Metadata = {
  title: "Echo Demo",
  description:
    "Interactive walkthrough demonstrating Echo's AI dialogue, infinite spatial canvas, live collaboration, WebRTC meetings, screen presentation, and viewport following.",
  openGraph: {
    title: "Echo Demo",
    description:
      "Interactive walkthrough demonstrating Echo's AI dialogue, infinite spatial canvas, live collaboration, WebRTC meetings, screen presentation, and viewport following.",
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

// ─── Section 1: Hero Conceptual Workspace Mock ────────────────────────────────

function WorkspaceHeroMock() {
  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-indigo-500/25 via-purple-500/20 to-blue-500/25 blur-2xl opacity-60 animate-ambient-glow pointer-events-none"
      />

      <div
        aria-hidden="true"
        className="relative w-full rounded-2xl sm:rounded-3xl border border-zinc-800/90 bg-zinc-950 overflow-hidden shadow-2xl select-none text-left backdrop-blur-xl"
      >
        {/* Top Application Bar */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-zinc-800/80 bg-zinc-900/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-zinc-800" />
              <span className="h-3 w-3 rounded-full bg-zinc-800" />
              <span className="h-3 w-3 rounded-full bg-zinc-800" />
            </div>
            <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-tight">Echo</span>
              <span className="text-[11px] text-zinc-500 truncate max-w-[140px] sm:max-w-none">
                Distributed Cache Architecture
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Status pill */}
            <div className="hidden md:flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-0.5 text-[10px] text-emerald-400 shadow-sm shadow-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Canvas Synced</span>
            </div>

            {/* Active room & presence pill */}
            <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/90 px-2.5 py-1 text-xs text-zinc-300">
              <span className="flex -space-x-1 overflow-hidden">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white ring-1 ring-zinc-900">
                  Y
                </span>
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white ring-1 ring-zinc-900">
                  S
                </span>
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-[9px] font-bold text-white ring-1 ring-zinc-900">
                  A
                </span>
              </span>
              <span className="text-[11px] text-zinc-400 ml-1">3</span>
              <span className="text-[10px] font-medium text-blue-400 hidden sm:inline">
                (Following Sarah)
              </span>
            </div>

            {/* Meeting button badge */}
            <div className="flex items-center gap-1.5 rounded-xl border border-indigo-500/50 bg-indigo-950/80 px-2.5 py-1 text-xs text-indigo-300 shadow-sm shadow-indigo-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-medium">In Meeting</span>
            </div>
          </div>
        </div>

        {/* Main Workspace Simulation Area */}
        <div className="relative min-h-[360px] sm:min-h-[420px] bg-zinc-950 overflow-hidden p-4 sm:p-6 flex flex-col justify-between">
          {/* Subtle Canvas Dot Grid Background */}
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(#3f3f46 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />

          {/* Floating Meeting Video Strip (Top Right) */}
          <div className="absolute right-3 sm:right-6 top-3 sm:top-6 z-20 flex flex-col gap-1.5 rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-2 sm:p-2.5 shadow-2xl backdrop-blur-md max-w-[190px] sm:max-w-xs animate-echo-float">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1">
              <span className="flex items-center gap-1.5 font-medium text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Meeting Dock (3)
              </span>
              <span className="text-emerald-400 text-[9px] font-mono">Live</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-14 sm:h-16 w-20 sm:w-24 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center relative overflow-hidden">
                <span className="text-xs">👤</span>
                <span className="text-[9px] text-zinc-400 mt-0.5">Sarah (Pres.)</span>
                <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </div>
              <div className="h-14 sm:h-16 w-20 sm:w-24 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center relative overflow-hidden">
                <span className="text-xs">👤</span>
                <span className="text-[9px] text-zinc-400 mt-0.5">Alex</span>
                <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-zinc-600" />
              </div>
            </div>
          </div>

          {/* Spatial Canvas Graph Visual (Center) */}
          <div className="relative z-10 my-auto py-4">
            <svg className="w-full h-44 sm:h-52 block" viewBox="0 0 540 200" fill="none">
              {/* Relational connection edges with traveling flow beam */}
              <path d="M 120 70 L 250 45" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
              <path d="M 250 45 L 400 90" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
              <path d="M 120 70 L 230 140" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />
              <path d="M 230 140 L 400 90" stroke="#6366f1" strokeWidth="1.5" className="animate-echo-beam" />

              {/* Luminous data packets traveling along edges */}
              <circle r="3.5" fill="#a5b4fc">
                <animateMotion path="M 120 70 L 250 45" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle r="3.5" fill="#a5b4fc">
                <animateMotion path="M 250 45 L 400 90" dur="2.0s" repeatCount="indefinite" />
              </circle>
              <circle r="3.5" fill="#a5b4fc">
                <animateMotion path="M 120 70 L 230 140" dur="2.8s" repeatCount="indefinite" />
              </circle>
              <circle r="3.5" fill="#a5b4fc">
                <animateMotion path="M 230 140 L 400 90" dur="2.2s" repeatCount="indefinite" />
              </circle>

              {/* Node 1: Ingestion API */}
              <g transform="translate(40, 50)">
                <rect width="115" height="42" rx="8" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
                <text x="57" y="22" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="500" fontFamily="sans-serif">
                  Ingestion API
                </text>
                <text x="57" y="34" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="sans-serif">
                  REST & Webhooks
                </text>
              </g>

              {/* Node 2: Primary Cache Tier (Leader Focus) */}
              <g transform="translate(195, 20)">
                <rect width="130" height="46" rx="8" fill="#18181b" stroke="#818cf8" strokeWidth="1.8" className="animate-echo-pulse" />
                <text x="65" y="24" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="600" fontFamily="sans-serif">
                  Primary Cache Tier
                </text>
                <text x="65" y="38" textAnchor="middle" fill="#818cf8" fontSize="9" fontFamily="sans-serif">
                  Redis In-Memory Cluster
                </text>
              </g>

              {/* Node 3: Event Stream */}
              <g transform="translate(170, 120)">
                <rect width="120" height="42" rx="8" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
                <text x="60" y="22" textAnchor="middle" fill="#d4d4d8" fontSize="11" fontWeight="500" fontFamily="sans-serif">
                  Event Stream
                </text>
                <text x="60" y="34" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="sans-serif">
                  FIFO Queue Broker
                </text>
              </g>

              {/* Node 4: Persistence Store */}
              <g transform="translate(340, 70)">
                <rect width="130" height="44" rx="8" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
                <text x="65" y="23" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="500" fontFamily="sans-serif">
                  Persistent Storage
                </text>
                <text x="65" y="36" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="sans-serif">
                  PostgreSQL Core
                </text>
              </g>

              {/* Remote Cursor: Sarah (Leader) */}
              <g transform="translate(290, 48)" className="animate-echo-float">
                <circle cx="2" cy="2" r="8" fill="#10b981" opacity="0.35" className="animate-ping" />
                <path d="M0 0 L5.5 13 L2 10 L0 14 Z" fill="#10b981" stroke="#ffffff" strokeWidth="0.8" />
                <rect x="8" y="10" width="70" height="18" rx="4" fill="#10b981" />
                <text x="43" y="22" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600" fontFamily="sans-serif">
                  Sarah (Leader)
                </text>
              </g>

              {/* Remote Cursor: Alex */}
              <g transform="translate(140, 135)" className="animate-echo-float" style={{ animationDelay: "1.5s" }}>
                <path d="M0 0 L5.5 13 L2 10 L0 14 Z" fill="#f59e0b" stroke="#ffffff" strokeWidth="0.8" />
                <rect x="8" y="10" width="46" height="18" rx="4" fill="#f59e0b" />
                <text x="31" y="22" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600" fontFamily="sans-serif">
                  Alex
                </text>
              </g>
            </svg>
          </div>

          {/* Bottom Composer Dock Simulation */}
          <div className="relative z-10 mt-auto pt-2">
            <div className="w-full max-w-xl mx-auto rounded-2xl border border-indigo-500/40 bg-zinc-900/95 p-2 sm:p-2.5 shadow-xl shadow-indigo-500/10 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-2 px-2">
                <span className="text-xs text-zinc-300 truncate font-medium">
                  Ask Echo: &ldquo;Connect the Redis cluster to the FIFO event broker and surface retry limits&rdquo;
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-950/80 border border-indigo-500/40 text-xs text-indigo-300 animate-pulse">
                    🎙️
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-semibold text-black shadow-md">
                    →
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer bar */}
        <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-900/40 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-400">Real-time WebRTC room connected</span>
          </div>
          <span className="text-indigo-400 font-medium">Viewport synchronized with leader</span>
        </div>
      </div>
    </div>
  );
}

// ─── Section Component ────────────────────────────────────────────────────────

interface FeatureSectionProps {
  number: string;
  eyebrow: string;
  heading: string;
  description: string;
  bulletsTitle?: string;
  bullets?: string[];
  visual: React.ReactNode;
  flip?: boolean;
}

function FeatureSection({
  number,
  eyebrow,
  heading,
  description,
  bulletsTitle,
  bullets,
  visual,
  flip = false,
}: FeatureSectionProps) {
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

          {bullets && bullets.length > 0 && (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
              {bulletsTitle && (
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold block mb-2.5">
                  {bulletsTitle}
                </span>
              )}
              <ul className="space-y-2 text-xs text-zinc-300">
                {bullets.map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 rounded-full bg-zinc-600 flex-shrink-0" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </FadeIn>

        <FadeIn direction="up" delay={120} className="flex-shrink-0 w-full md:w-auto md:max-w-xs lg:max-w-sm xl:max-w-md flex justify-center">
          {visual}
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Visual 1: AI + Canvas Interactivity ──────────────────────────────────────

function AICanvasVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          Conversation ↔ Canvas Link
        </span>
        <span className="text-[9px] text-zinc-600 font-mono">Two-way context</span>
      </div>

      <div className="space-y-3">
        {/* Chat message */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
          <span className="text-[9px] uppercase tracking-wider text-zinc-500 block mb-1">
            You asked Echo
          </span>
          <p className="text-xs text-zinc-300 leading-relaxed">
            &ldquo;Can we group the caching layers and highlight the failover path?&rdquo;
          </p>
        </div>

        {/* Translation Indicator */}
        <div className="flex items-center justify-center gap-2 py-0.5">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-[10px] text-indigo-400 font-medium flex items-center gap-1">
            <span>✨</span>
            <span>Echo generates spatial actions</span>
          </span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {/* Canvas Result Preview */}
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 p-3">
          <span className="text-[9px] uppercase tracking-wider text-zinc-500 block mb-2">
            Canvas Updated
          </span>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200">
              <span className="font-medium">Cache Group created</span>
              <span className="text-[10px] text-emerald-400 font-mono">+ 2 Nodes</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200">
              <span className="font-medium">Failover Edge mapped</span>
              <span className="text-[10px] text-zinc-400 font-mono">Relationship: active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-center">
        <span className="text-[10px] text-zinc-600">
          The conversation creates visual structure; the canvas grounds the AI
        </span>
      </div>
    </div>
  );
}

// ─── Visual 2: Real-time Collaboration & Presence ─────────────────────────────

function CollaborationVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          Live Room Presence
        </span>
        <span className="text-[10px] text-emerald-400 flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Active Room
        </span>
      </div>

      <svg className="w-full h-auto block" viewBox="0 0 280 180" fill="none">
        {/* Canvas background dot pattern */}
        <defs>
          <pattern id="collab-dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.75" fill="#27272a" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#collab-dots)" />

        {/* Shared node */}
        <rect x="70" y="40" width="140" height="44" rx="8" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
        <text x="140" y="62" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="500" fontFamily="sans-serif">
          Shared Architecture
        </text>
        <text x="140" y="75" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="sans-serif">
          Collaborative State Synced
        </text>

        {/* Remote Cursor 1: Dev Lead */}
        <g transform="translate(45, 105)">
          <path d="M0 0 L5.5 13 L2 10 L0 14 Z" fill="#3b82f6" stroke="#ffffff" strokeWidth="0.8" />
          <rect x="8" y="10" width="58" height="18" rx="4" fill="#3b82f6" />
          <text x="37" y="22" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600" fontFamily="sans-serif">
            Liam (Lead)
          </text>
        </g>

        {/* Remote Cursor 2: Designer */}
        <g transform="translate(165, 115)">
          <path d="M0 0 L5.5 13 L2 10 L0 14 Z" fill="#ec4899" stroke="#ffffff" strokeWidth="0.8" />
          <rect x="8" y="10" width="64" height="18" rx="4" fill="#ec4899" />
          <text x="40" y="22" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600" fontFamily="sans-serif">
            Elena (Design)
          </text>
        </g>
      </svg>

      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400 bg-zinc-900/40 rounded-lg p-2 border border-zinc-800">
        <span>Room participants:</span>
        <div className="flex items-center gap-1 font-mono text-[10px]">
          <span className="text-blue-400">Liam</span> · <span className="text-pink-400">Elena</span> · <span className="text-zinc-300">You</span>
        </div>
      </div>
    </div>
  );
}

// ─── Visual 3: Integrated Meetings Dock ───────────────────────────────────────

function MeetingDockVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          Meeting Dock & Video Tiles
        </span>
        <span className="text-[9px] text-indigo-400 font-mono">WebRTC Integrated</span>
      </div>

      <div className="space-y-3">
        {/* Floating video tiles grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-center relative overflow-hidden">
            <div className="h-8 w-8 mx-auto mb-1.5 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300">
              🎤
            </div>
            <span className="text-xs font-medium text-white block">You</span>
            <span className="text-[10px] text-emerald-400 block mt-0.5">Speaking</span>
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-center relative overflow-hidden">
            <div className="h-8 w-8 mx-auto mb-1.5 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300">
              👤
            </div>
            <span className="text-xs font-medium text-white block">Marcus</span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">Muted</span>
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-zinc-600" />
          </div>
        </div>

        {/* Meeting controls simulation bar */}
        <div className="flex items-center justify-between rounded-xl border border-zinc-700/60 bg-zinc-900/90 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button type="button" className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs">
              🎙️
            </button>
            <button type="button" className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs">
              📹
            </button>
            <button type="button" className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs">
              🖥️
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400">2 in call</span>
            <span className="rounded-lg bg-red-950/80 border border-red-500/40 text-red-300 px-2 py-1 text-[10px] font-semibold">
              Leave
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 text-center">
        <span className="text-[10px] text-zinc-600">
          Audio, video, and screen sharing embedded directly in the canvas
        </span>
      </div>
    </div>
  );
}

// ─── Visual 4: Spotlight Screen Presentation ──────────────────────────────────

function PresentationVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          Spotlight Presentation
        </span>
        <span className="text-[9px] rounded bg-indigo-900/80 border border-indigo-500/40 px-1.5 py-0.5 text-indigo-300 font-semibold">
          Screen Share
        </span>
      </div>

      {/* Screen Presentation Stage */}
      <div className="rounded-xl border border-zinc-700/70 bg-zinc-900 overflow-hidden">
        {/* Spotlight header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-950/80 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-200 font-medium">Sarah&apos;s Presentation</span>
          </div>
          <div className="flex items-center gap-1 text-zinc-500">
            <span>⛶ Fullscreen</span>
          </div>
        </div>

        {/* Screen feed content mock */}
        <div className="p-4 bg-zinc-950/90 text-center space-y-2">
          <div className="h-20 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 flex flex-col items-center justify-center p-3">
            <span className="text-xs font-mono text-zinc-400">Architecture Diagram v2.pdf</span>
            <span className="text-[10px] text-zinc-600 mt-1">Live screen presentation stream</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-500 px-1">
        <span>Single active presenter lock</span>
        <span>Auto-spotlights for attendees</span>
      </div>
    </div>
  );
}

// ─── Visual 5: Viewport Following & Follow Protocol ───────────────────────────

function FollowVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          Viewport Synchronization
        </span>
        <span className="text-[10px] text-blue-400 font-medium">
          Following Active
        </span>
      </div>

      <svg className="w-full h-auto block" viewBox="0 0 280 160" fill="none">
        {/* Presenter frame (Leader Viewport) */}
        <rect x="30" y="15" width="220" height="90" rx="10" fill="#18181b" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="45" y="32" fill="#60a5fa" fontSize="9" fontWeight="600" fontFamily="sans-serif">
          Leader Viewport (X, Y, Zoom)
        </text>

        {/* Elements inside viewport */}
        <rect x="50" y="44" width="70" height="24" rx="5" fill="#27272a" />
        <text x="85" y="59" textAnchor="middle" fill="#d4d4d8" fontSize="9" fontFamily="sans-serif">
          Topic A
        </text>

        <rect x="145" y="44" width="85" height="24" rx="5" fill="#27272a" />
        <text x="187" y="59" textAnchor="middle" fill="#d4d4d8" fontSize="9" fontFamily="sans-serif">
          Decision Point
        </text>

        {/* Viewport follow synchronization arrows */}
        <path d="M 80 105 V 125 M 200 105 V 125" stroke="#3b82f6" strokeWidth="1.5" />
        <circle cx="80" cy="125" r="2.5" fill="#3b82f6" />
        <circle cx="200" cy="125" r="2.5" fill="#3b82f6" />

        {/* Follower status bar */}
        <rect x="30" y="125" width="220" height="26" rx="6" fill="#1e1b4b" stroke="#4338ca" strokeWidth="1" />
        <text x="140" y="142" textAnchor="middle" fill="#c7d2fe" fontSize="10" fontWeight="500" fontFamily="sans-serif">
          Follower canvases glide in sync
        </text>
      </svg>

      <div className="mt-3 text-center">
        <span className="text-[10px] text-zinc-600">
          Follow any teammate · Pan or zoom manually to break away anytime
        </span>
      </div>
    </div>
  );
}

// ─── Visual 6: Workspace & Conversation Persistence ───────────────────────────

function ContinuityVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          Saved Workspaces
        </span>
        <span className="text-[9px] text-zinc-600 font-mono">Persistent State</span>
      </div>

      <div className="space-y-2">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">Distributed Cache Architecture</span>
            <span className="text-[9px] text-emerald-400">Current</span>
          </div>
          <span className="text-[10px] text-zinc-500 block mt-0.5">
            4 nodes · 4 edges · 1 group · 14 messages
          </span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300">Q3 Product Roadmap</span>
            <span className="text-[9px] text-zinc-500">2h ago</span>
          </div>
          <span className="text-[10px] text-zinc-600 block mt-0.5">
            6 nodes · 5 edges · 8 messages
          </span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300">API Gateway Trade-off Matrix</span>
            <span className="text-[9px] text-zinc-500">Yesterday</span>
          </div>
          <span className="text-[10px] text-zinc-600 block mt-0.5">
            3 options · comparison criteria
          </span>
        </div>
      </div>

      <div className="mt-3 text-center">
        <span className="text-[10px] text-zinc-600">
          Switch conversations, search past work, and resume anytime
        </span>
      </div>
    </div>
  );
}

// ─── Section 9: Capability Matrix Grid ────────────────────────────────────────

const CAPABILITIES = [
  {
    category: "Think",
    subtitle: "AI Conversation & Dialogue",
    features: [
      { name: "Ask Echo", desc: "Discuss problems, explore questions, and structure reasoning in natural language." },
      { name: "Two-Way Context", desc: "The dialogue builds the canvas, and current canvas nodes feed context back into the AI." },
      { name: "Voice Input", desc: "Hands-free voice recognition with real-time feedback." },
      { name: "Reasoning Detection", desc: "Identifies complex prompts and applies multi-step reasoning." },
    ],
  },
  {
    category: "See",
    subtitle: "Spatial Infinite Canvas",
    features: [
      { name: "Visual Node Graph", desc: "Concepts, questions, and decisions represented as spatial cards." },
      { name: "Relational Edges", desc: "Directional and labeled connections illustrating how parts relate." },
      { name: "Semantic Groups", desc: "Enclose related nodes into organized visual boundaries." },
      { name: "Interactive Viewport", desc: "Smooth pan, zoom, and coordinate navigation." },
    ],
  },
  {
    category: "Collaborate",
    subtitle: "Live Multi-User Room",
    features: [
      { name: "Live Room Channels", desc: "Join via shareable room links with real-time state synchronization." },
      { name: "Presence & Avatars", desc: "See who is in the room with colored badges and status pills." },
      { name: "Remote Cursors", desc: "Live colored mouse pointers with participant names." },
      { name: "Follow Any Teammate", desc: "Synchronize your canvas viewport with any presenter in one click." },
    ],
  },
  {
    category: "Meet & Present",
    subtitle: "Integrated Communications",
    features: [
      { name: "In-Workspace Meetings", desc: "Start audio and video calls directly docked over the canvas." },
      { name: "Screen Sharing", desc: "Stream your screen or application into the shared workspace." },
      { name: "Spotlight Stage", desc: "Auto-spotlight active presenters with fullscreen viewing." },
      { name: "Single Presenter Lock", desc: "Clear presentation ownership prevents competing screen shares." },
    ],
  },
];

function CapabilityMatrix() {
  return (
    <div className="py-20 sm:py-28">
      <FadeIn direction="up" className="text-center max-w-xl mx-auto mb-14">
        <SectionLabel>Capability Inventory</SectionLabel>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mt-2 mb-4">
          Built into a single workspace.
        </h2>
        <p className="text-zinc-400 text-base leading-relaxed">
          Echo unifies conversational thinking, spatial organization, live presence, and meetings into one coherent surface.
        </p>
      </FadeIn>

      <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-6" step={80}>
        {CAPABILITIES.map((group) => (
          <div
            key={group.category}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-7 flex flex-col justify-between hover:border-zinc-700/80 hover:-translate-y-0.5 transition-all duration-200"
          >
            <div>
              <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-zinc-800/80">
                <h3 className="text-lg font-semibold text-white tracking-tight">
                  {group.category}
                </h3>
                <span className="text-xs text-zinc-500 font-medium">
                  {group.subtitle}
                </span>
              </div>

              <div className="space-y-4">
                {group.features.map((feat) => (
                  <div key={feat.name} className="space-y-0.5">
                    <span className="text-xs font-semibold text-zinc-200 block">
                      {feat.name}
                    </span>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {feat.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </Stagger>
    </div>
  );
}

// ─── Main Demo Page Component ─────────────────────────────────────────────────

export default function DemoPage() {
  return (
    <div className="w-full max-w-5xl mx-auto">

      {/* ─── SECTION 1: HERO ───────────────────────────────────────── */}
      <section className="pt-4 pb-16 sm:pb-20 text-center">
        <FadeIn direction="up">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-slate-100/90 dark:bg-zinc-900/60 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-400 mb-6 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            See Echo in Action
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-900 dark:text-white leading-[1.12] mb-6 max-w-3xl mx-auto text-balance">
            One Workspace. More Ways to Think Together.
          </h1>

          <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed mb-10 max-w-2xl mx-auto text-balance">
            Echo combines AI conversation, an infinite visual canvas, real-time
            collaboration, and integrated meetings into a single space — so you
            never have to separate the discussion from the work.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
            <OpenEchoButton className="text-sm px-6 py-3" />
            <Link
              href="/how-it-works"
              className="echo-secondary-btn inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition-all px-4 py-2.5 rounded-xl border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/80 shadow-sm"
            >
              <span>How it works</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" className="text-zinc-400 dark:text-zinc-500">
                <path d="M2.5 6h7m-3.5-3.5L9.5 6 6 9.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </FadeIn>

        {/* ─── HERO PRODUCT VISUAL ───────────────────────────────────── */}
        <FadeIn scale delay={150}>
          <WorkspaceHeroMock />
        </FadeIn>
      </section>

      <Divider />

      {/* ─── SECTION 2: AI + VISUAL THINKING ─────────────────────────── */}
      <FeatureSection
        number="01"
        eyebrow="Think & Visualize"
        heading="Think with Echo, See Thoughts Take Shape"
        description="Type or speak naturally to explore an idea. Echo responds in conversation while generating connected nodes, relationships, and groups on the canvas. The canvas isn't a passive drawing board — its contents feed context back to the AI for ongoing reasoning."
        bulletsTitle="Confirmed Capabilities"
        bullets={[
          "Natural language composer with voice input and deep reasoning indicators",
          "Automatic spatial structuring of nodes, edges, and semantic groups",
          "Bidirectional context: the dialogue updates the canvas, and the canvas informs the AI",
        ]}
        visual={<AICanvasVisual />}
      />

      <Divider />

      {/* ─── SECTION 3: COLLABORATION & PRESENCE ─────────────────────── */}
      <FeatureSection
        number="02"
        eyebrow="Live Collaboration"
        heading="Work in the Same Space Without Getting in the Way"
        description="Share a room link to invite teammates directly into the workspace. See everyone in the room with live presence indicators and colored remote cursors gliding across the canvas as ideas develop."
        bulletsTitle="Confirmed Capabilities"
        bullets={[
          "Instant room channels with shareable room URLs",
          "Presence popover showing all participants and active connection states",
          "Live remote cursors with colored arrows and participant display names",
        ]}
        visual={<CollaborationVisual />}
        flip
      />

      <Divider />

      {/* ─── SECTION 4: INTEGRATED MEETINGS ──────────────────────────── */}
      <FeatureSection
        number="03"
        eyebrow="Meetings in Context"
        heading="Meet Where the Work Happens, Not in Another Window"
        description="Start an audio and video meeting directly within the Echo workspace. Floating participant video tiles dock over the canvas so you can talk through complex architectures and plans without switching tabs."
        bulletsTitle="Confirmed Capabilities"
        bullets={[
          "One-click Start/Join meeting docked over the canvas",
          "Microphone audio toggle, camera video toggle, and live participant count",
          "Floating video strip that can be minimized or positioned as you work",
        ]}
        visual={<MeetingDockVisual />}
      />

      <Divider />

      {/* ─── SECTION 5: SCREEN PRESENTATION ──────────────────────────── */}
      <FeatureSection
        number="04"
        eyebrow="Screen Presentation"
        heading="Present the Work with a Dedicated Spotlight Stage"
        description="Share your screen directly into the room. When a presenter begins sharing, an active spotlight modal appears with a single-presenter lock and fullscreen toggle, ensuring the team stays focused without competing streams."
        bulletsTitle="Confirmed Capabilities"
        bullets={[
          "In-meeting screen sharing with active presenter lock",
          "Spotlight presentation stage with fullscreen viewing mode",
          "Coordinated stream handling preventing conflicting screen shares",
        ]}
        visual={<PresentationVisual />}
        flip
      />

      <Divider />

      {/* ─── SECTION 6: FOLLOW EXPERIENCE ────────────────────────────── */}
      <FeatureSection
        number="05"
        eyebrow="Follow Experience"
        heading="Stay in Sync Without Asking Where to Look"
        description="Follow any participant in the room with a single click. As the leader pans and zooms across a sprawling canvas, your viewport automatically synchronizes. If you want to explore on your own, simply touch the canvas to disengage immediately."
        bulletsTitle="Confirmed Capabilities"
        bullets={[
          "Follow any participant directly from the presence drawer",
          "Real-time viewport coordinates and zoom synchronization",
          "Non-blocking interaction: touching your own canvas stops follow mode instantly",
        ]}
        visual={<FollowVisual />}
      />

      <Divider />

      {/* ─── SECTION 7: WORKSPACE CONTINUITY ─────────────────────────── */}
      <FeatureSection
        number="06"
        eyebrow="Workspace Continuity"
        heading="Keep the Thinking Together Across Sessions"
        description="Echo keeps your conversations, canvas graphs, and room state organized. Search past discussions, rename workspaces, and pick up right where your team left off without losing the reasoning that shaped the work."
        bulletsTitle="Confirmed Capabilities"
        bullets={[
          "Persistent conversation history with instant text search",
          "Workspace switching with saved canvas graphs and message logs",
          "Context preservation so you can resume thinking anytime",
        ]}
        visual={<ContinuityVisual />}
        flip
      />

      <Divider />

      {/* ─── SECTION 8: CAPABILITY MATRIX ────────────────────────────── */}
      <CapabilityMatrix />

      <Divider />

      {/* ─── SECTION 9: CLOSING CTA ──────────────────────────────────── */}
      <section className="py-20 sm:py-28 text-center">
        <FadeIn scale className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-slate-100/90 dark:bg-zinc-900/60 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-400 mb-6 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Ready to Think with Echo?
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-4 text-balance">
            Ready to See What Your Ideas Can Become?
          </h2>

          <p className="text-zinc-600 dark:text-zinc-400 text-base sm:text-lg max-w-md mx-auto leading-relaxed mb-10 text-balance">
            Open the workspace. Talk through a problem. See it come together.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <OpenEchoButton className="text-sm px-6 py-3" />
            <Link
              href="/how-it-works"
              className="echo-secondary-btn inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition-all px-4 py-2.5 rounded-xl border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/80 shadow-sm"
            >
              <span>Explore how it works</span>
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
