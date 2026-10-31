import type { Metadata } from "next";
import { withSeo } from "@/lib/seo";
import {
  BentoCard,
  BentoGrid,
  CtaBand,
  GradientText,
  Icons,
  PageHero,
  ProductFrame,
  SectionHeader,
} from "../../components/marketing/ui";

export const metadata: Metadata = withSeo("/demo", {
  title: "Echo Demo",
  description:
    "Interactive walkthrough demonstrating Echo's AI dialogue, infinite spatial canvas, live collaboration, WebRTC meetings, screen presentation, and viewport following.",
  openGraph: {
    title: "Echo Demo",
    description:
      "Interactive walkthrough demonstrating Echo's AI dialogue, infinite spatial canvas, live collaboration, WebRTC meetings, screen presentation, and viewport following.",
    type: "website",
  },
});

// ─── Visual 1: AI + Canvas Interactivity ──────────────────────────────────────

function AICanvasVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          Conversation ↔ Canvas Link
        </span>
        <span className="text-[11px] text-zinc-600 font-mono">Two-way context</span>
      </div>

      <div className="space-y-3">
        {/* Chat message */}
        <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/60 p-3">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-1">
            You asked Echo
          </span>
          <p className="text-xs text-zinc-300 leading-relaxed">
            &ldquo;Can we group the caching layers and highlight the failover path?&rdquo;
          </p>
        </div>

        {/* Translation Indicator */}
        <div className="flex items-center justify-center gap-2 py-0.5">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-xs text-indigo-400 font-medium flex items-center gap-1">
            <span>✨</span>
            <span>Echo generates spatial actions</span>
          </span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {/* Canvas Result Preview */}
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-3">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">
            Canvas Updated
          </span>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg border border-zinc-700/70 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200">
              <span className="font-medium">Cache Group created</span>
              <span className="text-xs text-emerald-400 font-mono">+ 2 Nodes</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-700/70 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200">
              <span className="font-medium">Failover Edge mapped</span>
              <span className="text-xs text-zinc-400 font-mono">Relationship: active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-center">
        <span className="text-xs text-zinc-500">
          The conversation creates visual structure; the canvas grounds the AI
        </span>
      </div>
    </div>
  );
}

// ─── Visual 2: Real-time Collaboration & Presence ─────────────────────────────

function CollaborationVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          Live Room Presence
        </span>
        <span className="text-xs text-emerald-400 flex items-center gap-1">
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

      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400 bg-zinc-900/60 rounded-lg p-2 border border-zinc-700/70">
        <span>Room participants:</span>
        <div className="flex items-center gap-1 font-mono text-xs">
          <span className="text-blue-400">Liam</span> · <span className="text-pink-400">Elena</span> · <span className="text-zinc-300">You</span>
        </div>
      </div>
    </div>
  );
}

// ─── Visual 3: Integrated Meetings Dock ───────────────────────────────────────

function MeetingDockVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          Meeting Dock & Video Tiles
        </span>
        <span className="text-[11px] text-indigo-400 font-mono">WebRTC Integrated</span>
      </div>

      <div className="space-y-3">
        {/* Floating video tiles grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/80 p-3 text-center relative overflow-hidden">
            <div className="h-8 w-8 mx-auto mb-1.5 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300">
              🎤
            </div>
            <span className="text-xs font-medium text-white block">You</span>
            <span className="text-xs text-emerald-400 block mt-0.5">Speaking</span>
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>

          <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/80 p-3 text-center relative overflow-hidden">
            <div className="h-8 w-8 mx-auto mb-1.5 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300">
              👤
            </div>
            <span className="text-xs font-medium text-white block">Marcus</span>
            <span className="text-xs text-zinc-500 block mt-0.5">Muted</span>
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
            <span className="text-xs text-zinc-400">2 in call</span>
            <span className="rounded-lg bg-red-950/80 border border-red-500/40 text-red-300 px-2 py-1 text-xs font-semibold">
              Leave
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 text-center">
        <span className="text-xs text-zinc-500">
          Audio, video, and screen sharing embedded directly in the canvas
        </span>
      </div>
    </div>
  );
}

// ─── Visual 4: Spotlight Screen Presentation ──────────────────────────────────

function PresentationVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          Spotlight Presentation
        </span>
        <span className="text-[11px] rounded bg-indigo-900/80 border border-indigo-500/40 px-1.5 py-0.5 text-indigo-300 font-semibold">
          Screen Share
        </span>
      </div>

      {/* Screen Presentation Stage */}
      <div className="rounded-xl border border-zinc-700/70 bg-zinc-900 overflow-hidden">
        {/* Spotlight header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700/70 bg-zinc-950/80 text-xs">
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
          <div className="h-20 rounded-lg border border-dashed border-zinc-700/70 bg-zinc-900/60 flex flex-col items-center justify-center p-3">
            <span className="text-xs font-mono text-zinc-400">Architecture Diagram v2.pdf</span>
            <span className="text-xs text-zinc-600 mt-1">Live screen presentation stream</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 px-1">
        <span>Single active presenter lock</span>
        <span>Auto-spotlights for attendees</span>
      </div>
    </div>
  );
}

// ─── Visual 5: Viewport Following & Follow Protocol ───────────────────────────

function FollowVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          Viewport Synchronization
        </span>
        <span className="text-xs text-blue-400 font-medium">
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
        <span className="text-xs text-zinc-500">
          Follow any teammate · Pan or zoom manually to break away anytime
        </span>
      </div>
    </div>
  );
}

// ─── Visual 6: Workspace & Conversation Persistence ───────────────────────────

function ContinuityVisual() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm rounded-2xl border border-zinc-700/70 bg-zinc-950 p-4 select-none shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/60">
        <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          Saved Workspaces
        </span>
        <span className="text-[11px] text-zinc-600 font-mono">Persistent State</span>
      </div>

      <div className="space-y-2">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">Distributed Cache Architecture</span>
            <span className="text-[11px] text-emerald-400">Current</span>
          </div>
          <span className="text-xs text-zinc-500 block mt-0.5">
            4 nodes · 4 edges · 1 group · 14 messages
          </span>
        </div>

        <div className="rounded-lg border border-zinc-700/70 bg-zinc-900/60 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300">Q3 Product Roadmap</span>
            <span className="text-[11px] text-zinc-500">2h ago</span>
          </div>
          <span className="text-xs text-zinc-600 block mt-0.5">
            6 nodes · 5 edges · 8 messages
          </span>
        </div>

        <div className="rounded-lg border border-zinc-700/70 bg-zinc-900/60 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300">API Gateway Trade-off Matrix</span>
            <span className="text-[11px] text-zinc-500">Yesterday</span>
          </div>
          <span className="text-xs text-zinc-600 block mt-0.5">
            3 options · comparison criteria
          </span>
        </div>
      </div>

      <div className="mt-3 text-center">
        <span className="text-xs text-zinc-500">
          Switch conversations, search past work, and resume anytime
        </span>
      </div>
    </div>
  );
}


export default function DemoPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHero
        badge="See Echo in action"
        title={
          <>
            Talk it through. Watch the <GradientText>canvas build itself.</GradientText>
          </>
        }
        subtitle="Describe a problem out loud or in text and Echo turns it into a connected map your whole team can edit, discuss, and present from — live, in the same space."
        secondary={{ href: "/how-it-works", label: "How it works" }}
      >
        <ProductFrame />
      </PageHero>

      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="Everything in one room"
          title="Think, meet and present without switching tabs"
          subtitle="Conversation, canvas, live presence and meetings share one surface, so the discussion never gets separated from the work."
        />
        <BentoGrid cols={2}>
          <BentoCard
            icon={Icons.chat}
            title="Think with Echo, see thoughts take shape"
            body="Type or speak naturally. Echo answers in conversation while generating connected nodes, relationships and groups on the canvas, and the canvas feeds context back to the AI."
          >
            <AICanvasVisual />
          </BentoCard>
          <BentoCard
            icon={Icons.users}
            title="Work in the same space without getting in the way"
            body="Share a room link to invite teammates. See everyone with live presence indicators and colored remote cursors gliding across the canvas as ideas develop."
          >
            <CollaborationVisual />
          </BentoCard>
          <BentoCard
            icon={Icons.video}
            title="Meet where the work happens"
            body="Start an audio and video meeting inside the workspace. Floating participant tiles dock over the canvas so you can talk through complex plans without switching tabs."
          >
            <MeetingDockVisual />
          </BentoCard>
          <BentoCard
            icon={Icons.layers}
            title="Present with a dedicated spotlight stage"
            body="Share your screen into the room. A spotlight stage with a single-presenter lock and fullscreen toggle keeps the team focused without competing streams."
          >
            <PresentationVisual />
          </BentoCard>
          <BentoCard
            icon={Icons.graph}
            title="Stay in sync without asking where to look"
            body="Follow any participant with one click. As the leader pans and zooms, your viewport follows. Touch your own canvas to break away instantly."
          >
            <FollowVisual />
          </BentoCard>
          <BentoCard
            icon={Icons.save}
            title="Keep the thinking together across sessions"
            body="Echo keeps conversations, canvas graphs and room state organized. Search past discussions and pick up right where your team left off."
          >
            <ContinuityVisual />
          </BentoCard>
        </BentoGrid>
      </section>

      <CtaBand
        title="Ready to see what your ideas can become?"
        subtitle="Open the workspace. Talk through a problem. See it come together."
        secondary={{ href: "/how-it-works", label: "Explore how it works" }}
      />
    </div>
  );
}
