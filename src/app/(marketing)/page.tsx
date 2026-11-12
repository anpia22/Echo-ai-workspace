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
} from "../components/marketing/ui";
import { FadeIn } from "../components/marketing/motion";
import LiveDemo from "../components/marketing/LiveDemo";
import { BeforeAfterComparison } from "../components/marketing/BeforeAfterComparison";
import { ArchitectureAndVoiceSection } from "../components/marketing/ArchitectureAndVoiceSection";
import { PricingSection } from "../components/marketing/PricingSection";

import { TeamAndTrustSection } from "../components/marketing/TeamAndTrustSection";

const title = "Echo: The AI Workspace That Thinks With You";
const description =
  "Talk or type through messy product and architecture decisions. Echo maps them into problems, evaluated options, decisions, and actionable tasks in real time.";

export const metadata: Metadata = withSeo("/", {
  title: { absolute: title },
  description,
  openGraph: { title, description, type: "website" },
});

const JOBS = [
  {
    title: "Architecture Decisions (ADRs)",
    body: "Cache or split the service? Buy or build auth? Lay out competing options, trade-offs, and open questions in one spatial map.",
    icon: Icons.graph,
  },
  {
    title: "Product Roadmaps & Scope Cuts",
    body: "Talk through what to build next. Echo separates root problems, options on the table, and the decisions you actually agreed on.",
    icon: Icons.layers,
  },
  {
    title: "Permanent Institutional Memory",
    body: "Saved workspaces preserve why an option was rejected 3 months ago, ending repetitive Slack debates and onboarding friction.",
    icon: Icons.chat,
  },
];

const MOAT_PILLARS = [
  {
    title: "Living System of Record",
    body: "Not a drawing tool. Echo enforces an engineering decision schema ([Problem] → [Option] → [Decision] → [Task]) with full rationale provenance.",
  },
  {
    title: "Native WebRTC Voice & Transcription",
    body: "Talk through dilemmas out loud. Integrated peer-to-peer audio and speech transcription map verbal engineering debates into structured canvas nodes.",
  },
  {
    title: "Multiplayer Presence & Follow-Me",
    body: "Collaborate on architecture in real time with remote cursors, live node updates, and presenter viewport following during design reviews.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHero
        badge="Real-time Voice Meetings + AI Spatial Canvas · Built for Technical Founders"
        title={
          <>
            Think through hard decisions <GradientText>out loud</GradientText>
          </>
        }
        subtitle="Speak or type a messy product or architecture dilemma. Echo maps it into problems, evaluated trade-offs, recorded decisions, and actionable tasks in real time."
        secondary={{ href: "#try-it", label: "Try 15-second demo" }}
      />

      {/* Live demo: the product, before any account */}
      <section id="try-it" className="scroll-mt-24 py-10 sm:py-16">
        <SectionHeader
          eyebrow="Try it now"
          title="Type a messy problem. Watch it take shape."
          subtitle="No sign-up. Pick a 1-click domain template or type your own architecture dilemma."
        />
        <FadeIn direction="up">
          <LiveDemo />
        </FadeIn>
      </section>

      {/* Proof: The Before / After Comparison */}
      <BeforeAfterComparison />

      {/* Built-in Voice WebRTC & Distributed Sync receipts */}
      <ArchitectureAndVoiceSection />

      {/* System of Record / Defensibility */}
      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="Why it's different"
          title="Why Echo is a system of record, not a whiteboard"
          subtitle="Chat wrappers produce throwaway text. Whiteboards produce unstructured doodles. Echo creates lasting institutional memory."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {MOAT_PILLARS.map((item, i) => (
            <FadeIn
              key={item.title}
              delay={i * 90}
              className="rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-xs backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/50 sm:p-7"
            >
              <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                {item.body}
              </p>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* What a team gets: access, sharing, resilience */}
      <TeamAndTrustSection />

      {/* One audience, concrete jobs */}
      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="Who it's for"
          title="Built for technical founders and engineering leads"
          subtitle="Designed specifically for leaders making high-impact choices with incomplete information."
        />
        <BentoGrid>
          {JOBS.map((job) => (
            <BentoCard key={job.title} title={job.title} body={job.body} icon={job.icon} />
          ))}
        </BentoGrid>
      </section>

      {/* Control + honesty about automation */}
      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="You stay in charge"
          title="AI drafts the structure. You command it."
          subtitle="Echo proposes nodes and connections from the conversation. You can move, edit, delete, and regroup anything, and the AI reads your changes on the next message."
        />
        <ProductFrame />
      </section>

      {/* Pricing & Unit Economics Section */}
      <PricingSection showHeader={true} />

      <CtaBand
        title="Bring one real decision"
        subtitle="Free during beta. WebRTC voice meetings and shared multiplayer rooms are ready when you want to think with your team."
        secondary={{ href: "/pricing", label: "View pricing details" }}
      />
    </div>
  );
}