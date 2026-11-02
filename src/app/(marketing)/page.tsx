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

const title = "Echo — The AI Workspace That Thinks With You";
const description =
  "Talk through a messy product or architecture decision and Echo maps it as problems, options, decisions and tasks. Built for technical founders. Free during beta.";

export const metadata: Metadata = withSeo("/", {
  title: { absolute: title },
  description,
  openGraph: { title, description, type: "website" },
});

const COMPARISON = [
  {
    heading: "A whiteboard with AI added",
    body: "You start from a blank board and ask AI to fill it in or summarize it. The thinking happens somewhere else, then gets pasted in.",
  },
  {
    heading: "A chat with a canvas attached",
    body: "The answer lives in a scrolling thread. A canvas may appear beside it, but it doesn't become the shared context for the next question.",
  },
  {
    heading: "Echo",
    body: "The conversation is the input and the map is the memory. Every reply reads the canvas, every edit you make changes what the AI knows next.",
    highlight: true,
  },
];

const JOBS = [
  {
    title: "Architecture choices",
    body: "Cache or split the service? Buy or build auth? Lay out the options, the trade-offs and the open questions in one map.",
    icon: Icons.graph,
  },
  {
    title: "Product decisions",
    body: "Talk through what to build next. Echo separates the problem, the options on the table and the decision you actually made.",
    icon: Icons.layers,
  },
  {
    title: "Picking it up tomorrow",
    body: "Workspaces are saved, so you return to the same map and the same context instead of re-explaining the project.",
    icon: Icons.chat,
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHero
        badge="Free during beta · Built for technical founders"
        title={
          <>
            Think through hard decisions <GradientText>out loud</GradientText>
          </>
        }
        subtitle="Describe a messy product or architecture problem. Echo drafts the map of problems, options, decisions and tasks — you reshape it, and the AI works from your version."
        secondary={{ href: "#try-it", label: "Try it below" }}
      />

      {/* Live demo: the product, before any account */}
      <section id="try-it" className="scroll-mt-24 py-10 sm:py-16">
        <SectionHeader
          eyebrow="Try it now"
          title="Type a messy problem. Watch it take shape."
          subtitle="No sign-up. One message in, a connected map out."
        />
        <FadeIn direction="up">
          <LiveDemo />
        </FadeIn>
      </section>

      {/* Positioning vs. canvas tools and chat */}
      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="Why Echo"
          title="Not another whiteboard with an AI button"
          subtitle="Canvas tools and chat assistants each hold half of the work. Echo keeps both in the same loop."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {COMPARISON.map((item, i) => (
            <FadeIn
              key={item.heading}
              delay={i * 90}
              className={`rounded-3xl border p-6 sm:p-7 ${
                item.highlight
                  ? "border-indigo-400/60 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                  : "border-zinc-200 bg-white/80 dark:border-zinc-700/60 dark:bg-zinc-900/50"
              }`}
            >
              <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">{item.heading}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">{item.body}</p>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* One audience, concrete jobs */}
      <section className="py-14 sm:py-20">
        <SectionHeader
          eyebrow="Who it's for"
          title="Founders and engineers making calls with incomplete information"
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
          title="AI drafts the structure. You shape it."
          subtitle="Echo proposes nodes and connections from the conversation. You can move, edit, delete and regroup anything, and the AI reads your changes on the next message."
        />
        <ProductFrame />
      </section>

      <CtaBand
        title="Bring one real decision"
        subtitle="Free during beta. Meetings and shared rooms are there when you want to think with your team."
        secondary={{ href: "/how-it-works", label: "See how it works" }}
      />
    </div>
  );
}
