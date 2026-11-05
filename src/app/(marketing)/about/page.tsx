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
import { FadeIn } from "../../components/marketing/motion";

export const metadata: Metadata = withSeo("/about", {
  title: "About Echo",
  description:
    "Learn why Echo was built: to eliminate fragmentation between conversational AI and visual thinking by unifying them into one connected workspace.",
  openGraph: {
    title: "About Echo",
    description:
      "Learn why Echo was built: to eliminate fragmentation between conversational AI and visual thinking by unifying them into one connected workspace.",
    type: "website",
  },
});

const FRAGMENTS = ["A chat thread with the AI", "A whiteboard of boxes", "Notes in another tab", "Context that scrolls away"];

const FLOW = [
  { label: "Conversation", sub: "You think out loud" },
  { label: "Echo AI", sub: "Organizes and responds" },
  { label: "Structured thinking", sub: "Concepts and connections" },
  { label: "Workspace", sub: "A visual place to develop" },
];

const WORKSPACE_BLOCKS = [
  {
    title: "Conversation",
    body: "Natural language is the starting point. You think out loud, through questions, prompts or rough ideas, and Echo responds and helps shape your thinking.",
    icon: Icons.chat,
  },
  {
    title: "Canvas",
    body: "Ideas don't have to stay locked in a linear chat thread. Echo gives ideas a visual place to develop on a spatial canvas, where concepts and relationships can be explored together.",
    icon: Icons.graph,
  },
  {
    title: "Context",
    body: "The workspace keeps ideas connected. Discussion and visual thinking stay aligned in one unified space, so thoughts don't get lost as your project develops.",
    icon: Icons.layers,
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHero
        badge="Built by Anup · Solo Founder"
        title={
          <>
            An AI workspace that <GradientText>thinks with you</GradientText>
          </>
        }
        subtitle="I built Echo because I got tired of seeing crucial technical and product decisions disappear into Slack scrollback and discarded scratchpads. Echo brings live conversation and a visual decision graph into one unified workspace, so founders and engineers can reason through hard trade-offs out loud."
        secondary={{ href: "/how-it-works", label: "See how it works" }}
      >
        <ProductFrame />
      </PageHero>

      {/* The problem */}
      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="The problem"
          title="Decisions get fragmented"
          subtitle="The reasoning behind an architecture or product call ends up in a chat thread, a whiteboard and someone's notes. A week later nobody can reconstruct why you chose what you chose."
        />
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
          {FRAGMENTS.map((fragment, i) => (
            <FadeIn
              key={fragment}
              delay={i * 70}
              className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-4 py-6 text-center text-sm font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300"
            >
              {fragment}
            </FadeIn>
          ))}
        </div>
      </section>

      {/* The idea */}
      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="The Echo idea"
          title="Conversation becomes workspace"
          subtitle="You talk with Echo. Echo helps organize the thinking. The workspace gives ideas a visual place to develop, keeping your thinking connected and clear."
        />
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-4">
          {FLOW.map((step, i) => (
            <FadeIn
              key={step.label}
              delay={i * 90}
              className={`relative rounded-2xl border p-5 ${
                i === 1
                  ? "border-indigo-400/60 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                  : "border-zinc-200 bg-white/80 dark:border-zinc-700/60 dark:bg-zinc-900/50"
              }`}
            >
              <div>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">0{i + 1}</span>
                <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-white">{step.label}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{step.sub}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Workspace model */}
      <section className="py-14 sm:py-20">
        <SectionHeader eyebrow="Workspace model" title="Built around the way ideas actually move" />
        <BentoGrid>
          {WORKSPACE_BLOCKS.map((block) => (
            <BentoCard key={block.title} title={block.title} body={block.body} icon={block.icon} />
          ))}
        </BentoGrid>
      </section>

      {/* Who is behind it */}
      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="Who is behind Echo"
          title="Built by Anup, for people making hard calls"
          subtitle="Echo is an independent product, free during beta. If something breaks or you have an idea, email echoaiworkspace@gmail.com and a person will read it."
        />
      </section>

      <CtaBand
        title="Give your ideas a workspace"
        subtitle="Open Echo and start thinking with it."
        secondary={{ href: "/how-it-works", label: "See how it works" }}
      />
    </div>
  );
}
