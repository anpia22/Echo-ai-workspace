import Link from "next/link";
import { FadeIn } from "./motion";

export const PRICING_TIERS = [
  {
    name: "Developer Beta",
    badge: "Current Free Beta",
    price: "$0",
    frequency: "free during public beta",
    description: "For solo builders and engineers exploring architecture choices and system trade-offs.",
    features: [
      "Up to 5 active decision workspaces",
      "Interactive spatial canvas with AI mapping",
      "Pre-built decision templates (ADR, Build vs Buy)",
      "Fast NVIDIA Nemotron AI inference",
      "Copy decision schemas & export to Markdown",
    ],
    cta: "Start Free in Beta",
    href: "/app",
    popular: false,
  },
  {
    name: "Founder Pro",
    badge: "Planned Post-Beta",
    price: "$18",
    frequency: "per month (planned)",
    description: "For technical founders and lead engineers who need persistent workspaces and voice transcription.",
    features: [
      "Everything in Free Beta",
      "Unlimited decision workspaces & canvas nodes",
      "High-throughput NVIDIA Nemotron inference",
      "Real-time WebRTC audio meetings with voice-to-graph notes",
      "Decision changelog & rationale history",
      "Direct email support from the founder",
      "Roadmap: 1-click Linear & GitHub task sync",
    ],
    cta: "Try Free in Beta",
    href: "/app",
    popular: false,
  },
  {
    name: "Engineering Team",
    badge: "Planned Post-Beta",
    price: "$39",
    frequency: "per seat / month (planned)",
    description: "For engineering teams collaborating live on distributed systems and roadmap trade-offs.",
    features: [
      "Everything in Founder Pro",
      "Multiplayer real-time presence with remote cursors",
      "Follow-Me presenter viewport synchronization",
      "Invite links and live team rooms",
      "Shared organizational decision history",
      "Editor and viewer roles, managed by owners and admins",
    ],
    cta: "Try Team Mode in Beta",
    href: "/app",
    popular: false,
  },
  {
    name: "Enterprise",
    badge: "Custom Deployment",
    price: "Custom",
    frequency: "contact founder",
    description: "For teams with specific deployment, data isolation, or self-hosted model requirements.",
    features: [
      "Custom self-hosted or private cloud deployment",
      "Private LLM deployment option (vLLM / Ollama)",
      "Zero model training on your data (via NVIDIA API terms)",
      "Custom data retention and export policies",
      "Direct architecture onboarding & founder support",
      "Roadmap: SAML / Okta SSO & SOC 2 Type II",
    ],
    cta: "Contact Founder",
    href: "mailto:echoaiworkspace@gmail.com?subject=Echo%20Custom%20Deployment%20Inquiry",
    popular: false,
  },
];

export function PricingSection({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <section id="pricing" className="scroll-mt-24 py-14 sm:py-20">
      {showHeader && (
        <div className="mx-auto max-w-3xl text-center mb-14">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
            Transparent Plans
          </span>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-4xl md:text-5xl">
            Free in beta. Honest plans for what comes next.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-lg">
            Every feature is completely free while Echo is in public beta. Below is our planned post-beta pricing structure.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-4 md:grid-cols-2">
        {PRICING_TIERS.map((tier, idx) => (
          <FadeIn
            key={tier.name}
            delay={idx * 75}
            className="relative flex flex-col justify-between rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/50 sm:p-7 transition-all duration-300 hover:-translate-y-1"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  {tier.badge}
                </span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-zinc-900 dark:text-white">{tier.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  {tier.price}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">/{tier.frequency}</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                {tier.description}
              </p>

              <div className="my-6 h-px w-full bg-zinc-100 dark:bg-zinc-800" />

              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                What&apos;s included
              </p>
              <ul className="mt-3 space-y-2.5 text-xs text-zinc-600 dark:text-zinc-300">
                {tier.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2">
                    <svg
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 pt-4">
              <Link
                href={tier.href}
                className="flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 transition"
              >
                {tier.cta}
              </Link>
            </div>
          </FadeIn>
        ))}
      </div>

      {/* Structured Token Efficiency Box */}
      <div className="mt-12 rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-xs">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Token efficiency by design
              </h4>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                Unlike open-ended chat assistants that re-send thousands of words of conversation scrollback, Echo represents your decisions as a structured graph of connected nodes. Only the active decision topology is sent to NVIDIA Nemotron, keeping token consumption focused, responses fast, and infrastructure costs sustainable.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-zinc-300 bg-zinc-100/80 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Graph-Pruned Inference
          </span>
        </div>
      </div>
    </section>
  );
}
