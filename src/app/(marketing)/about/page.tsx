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
    "Why Echo exists: technical decisions get lost between chat threads and whiteboards, so Echo keeps the conversation and the decision map in one place.",
  openGraph: {
    title: "About Echo",
    description:
      "Why Echo exists: technical decisions get lost between chat threads and whiteboards, so Echo keeps the conversation and the decision map in one place.",
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
  {
    title: "Teams",
    body: "Invite people as editors or viewers. Owners and admins decide who can change what, and workspaces stay private to their members.",
    icon: Icons.users,
  },
  {
    title: "Sharing",
    body: "Publish one conversation and its canvas as a read-only link for people outside the workspace, with an expiry you choose and an off switch you control.",
    icon: Icons.link,
  },
  {
    title: "Resilience",
    body: "Dropped connections, slow AI and your own mistakes are handled: edits wait and save when you're back, failures are explained, and undo reverses only your own changes.",
    icon: Icons.refresh,
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
          title="Decisions get lost between the chat and the whiteboard"
          subtitle="Technical decisions usually start as a conversation. Someone asks an AI, or a team argues in Slack, and a few weeks later nobody remembers why an option was rejected. The reasoning lives in a thread that scrolled away."
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
          title="The conversation and the map live in one place"
          subtitle="You describe a messy problem, Echo drafts it as problems, options, decisions and tasks, and you reshape it. The AI reads your version on the next message, so the map is the memory."
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
          subtitle="Echo is an independent product, built by one person."
        />
      </section>

      {/* Where it is today */}
      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="Where it is today"
          title="Public beta, free to use"
          subtitle="Paid plans are planned and listed on the pricing page. Feedback, bugs and ideas go to echoaiworkspace@gmail.com, and a person will read them."
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
