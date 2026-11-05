import type { Metadata } from "next";
import { withSeo } from "@/lib/seo";
import { PricingSection } from "../../components/marketing/PricingSection";
import { CtaBand, PageHero, SectionHeader } from "../../components/marketing/ui";

export const metadata: Metadata = withSeo("/pricing", {
  title: "Pricing & Plans — Echo AI Workspace",
  description:
    "Explore simple, transparent pricing for Echo. Developer free beta, Founder Pro for technical leads, and Team plans with real-time multiplayer presence.",
  openGraph: {
    title: "Pricing & Plans — Echo AI Workspace",
    description:
      "Explore simple, transparent pricing for Echo. Developer free beta, Founder Pro for technical leads, and Team plans with real-time multiplayer presence.",
    type: "website",
  },
});

const PRICING_FAQS = [
  {
    q: "Is Echo really free right now?",
    a: "Yes. During our public beta, all core workspace and AI mapping features are free. Beta users who sign up today will be granted early-adopter grandfathered discounts on Founder Pro.",
  },
  {
    q: "How does Echo handle AI token costs sustainably?",
    a: "Unlike open-ended text chat wrappers that re-feed massive chat transcripts, Echo leverages our proprietary Graph Context Engine. It topologically clusters the canvas, summarizing inactive subtrees and injecting only relevant decision nodes. Runs execute on low-latency, highly cost-effective NVIDIA Nemotron and Groq inference (<$0.002 per run), maintaining healthy >95% gross margins.",
  },
  {
    q: "Can we export decisions into our existing tools?",
    a: "Yes. Echo integrates directly with Linear, GitHub Issues, and Jira. When an architecture option is marked 'Accepted', tasks can be synced directly to your sprint backlog with a backlink to the decision provenance.",
  },
  {
    q: "What about data security and SOC 2?",
    a: "Echo does not use your private architecture graphs or conversation data to train foundation models. Enterprise plans include SOC 2 Type II compliance reports, SAML SSO, and optional self-hosted private LLM deployment (via Ollama or AWS Bedrock).",
  },
  {
    q: "What makes Echo different from Miro or ChatGPT?",
    a: "In ChatGPT or Slack, decisions get lost in linear scrollback with zero traceability. In Miro, you get an unstructured geometric canvas with no semantic awareness. Echo combines both: an explicit decision schema ([Problem] → [Option] → [Decision] → [Task]) where the map is the AI's living memory.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHero
        badge="Transparent Pricing & Unit Economics"
        title="Predictable plans for engineers and founders"
        subtitle="Start free during public beta. Upgrade to Pro or Team when you need institutional memory, WebRTC voice transcription, and Linear issue sync."
        secondary={{ href: "/demo", label: "Try the live demo" }}
      />

      <PricingSection showHeader={false} />

      {/* FAQ Section */}
      <section className="py-14 sm:py-20 border-t border-zinc-200/80 dark:border-zinc-800/80">
        <SectionHeader
          eyebrow="Questions & Answers"
          title="Frequently asked questions about pricing"
          subtitle="Everything you need to know about our business model, token economics, and enterprise tiers."
        />
        <div className="mx-auto mt-8 max-w-3xl space-y-4">
          {PRICING_FAQS.map((faq) => (
            <div
              key={faq.q}
              className="rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-6"
            >
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                {faq.q}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      <CtaBand
        title="Start thinking with Echo today"
        subtitle="Bring one real architecture or product decision. No credit card required."
        secondary={{ href: "/how-it-works", label: "See how it works" }}
      />
    </div>
  );
}
