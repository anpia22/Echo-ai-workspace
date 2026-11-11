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
    a: "Yes. During public beta, all core workspace, AI mapping, and WebRTC meeting features are free to use. There are no credit cards required or hidden paywalls.",
  },
  {
    q: "How does Echo handle AI token costs sustainably?",
    a: "Unlike conversational chat wrappers that re-send thousands of lines of chat scrollback with every message, Echo serializes your canvas as a structured graph of connected decision nodes. Only the active decision topology is sent to NVIDIA Nemotron, keeping token consumption focused and response times low.",
  },
  {
    q: "Can we export decisions into our existing tools?",
    a: "Yes. You can copy structured Markdown and decision provenance from the canvas directly into any issue tracker or document. Direct 1-click issue sync to Linear and GitHub is on our immediate product roadmap.",
  },
  {
    q: "What about data security and model training?",
    a: "Echo does not use your private architecture graphs or workspace conversations to train AI models. Under NVIDIA's developer API terms, prompts and outputs are processed ephemerally and are not retained or used by NVIDIA to train foundation models. Enterprise custom deployments can also run on your own private LLM endpoint (such as vLLM or Ollama). SAML SSO and SOC 2 Type II certification are on our enterprise roadmap.",
  },
  {
    q: "Can I share a conversation with people outside my team?",
    a: "Yes, and it is included during the free beta. Create a read-only public link to a single conversation and its canvas. Visitors don't need an account and can't edit. Links can expire, and you can turn them off at any time.",
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
        badge="Transparent Pricing & Architecture"
        title="Predictable plans for engineers and founders"
        subtitle="Start free during public beta. Upgrade to Pro or Team when you need persistent institutional memory, WebRTC voice transcription, and team rooms."
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
