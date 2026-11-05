import Link from "next/link";
import { FadeIn } from "./motion";

export const PRICING_TIERS = [
  {
    name: "Developer Beta",
    badge: "Current Free Tier",
    price: "$0",
    frequency: "forever free during beta",
    description: "For solo builders and engineers exploring complex architecture choices.",
    features: [
      "Up to 5 active decision workspaces",
      "Interactive spatial canvas with AI mapping",
      "15-second domain templates (ADR, Build vs Buy)",
      "Standard LLM inference model",
      "Export maps to Markdown & SVG",
    ],
    cta: "Start Free Now",
    href: "/app",
    popular: false,
  },
  {
    name: "Founder Pro",
    badge: "Most Popular for Solo Founders",
    price: "$18",
    frequency: "per month",
    description: "For technical founders and lead engineers who need persistent institutional memory.",
    features: [
      "Unlimited decision workspaces & canvas nodes",
      "High-throughput NVIDIA Nemotron & Groq inference",
      "Real-time WebRTC audio meetings with voice-to-graph STT",
      "Decision changelog & audit trail ('Why we chose X')",
      "1-Click task sync to Linear and GitHub Issues",
      "Priority customer & architecture support",
    ],
    cta: "Lock In Beta Founder Rate",
    href: "/login?tier=pro",
    popular: true,
  },
  {
    name: "Engineering Team",
    badge: "For Fast-Moving Startups",
    price: "$39",
    frequency: "per seat / month",
    description: "For engineering teams collaborating on distributed systems and roadmap trade-offs.",
    features: [
      "Everything in Founder Pro",
      "Multiplayer real-time presence with remote cursors",
      "Follow-Me presenter synchronization mode",
      "Workspace permission levels (Admin, Editor, Viewer)",
      "Shared organizational decision repository",
      "Automated assumption drift alerts",
    ],
    cta: "Start 14-Day Team Trial",
    href: "/login?tier=team",
    popular: false,
  },
  {
    name: "Enterprise",
    badge: "Custom Deployment",
    price: "Custom",
    frequency: "billed annually",
    description: "For scale-ups and enterprises with stringent data governance and compliance needs.",
    features: [
      "Bring Your Own LLM (Private vLLM / AWS Bedrock / Ollama)",
      "SOC 2 Type II compliance report & BAA",
      "SAML / Okta / Azure AD Single Sign-On (SSO)",
      "Custom data retention policies & zero data training pledge",
      "Dedicated solutions architect & custom onboarding",
      "99.9% uptime SLA with 24/7 incident response",
    ],
    cta: "Contact Enterprise Sales",
    href: "mailto:echoaiworkspace@gmail.com?subject=Echo%20Enterprise%20Inquiry",
    popular: false,
  },
];

export function PricingSection({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <section id="pricing" className="scroll-mt-24 py-14 sm:py-20">
      {showHeader && (
        <div className="mx-auto max-w-3xl text-center mb-14">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
            Predictable Economics
          </span>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-4xl md:text-5xl">
            Simple, honest pricing. Zero token surprises.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-lg">
            Free during public beta. Lock in our early founder pricing before general availability.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-4 md:grid-cols-2">
        {PRICING_TIERS.map((tier, idx) => (
          <FadeIn
            key={tier.name}
            delay={idx * 75}
            className={`relative flex flex-col justify-between rounded-3xl border p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1 ${tier.popular
                ? "border-indigo-500 bg-white shadow-xl shadow-indigo-500/15 ring-2 ring-indigo-500/40 dark:bg-zinc-900"
                : "border-zinc-200 bg-white/80 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/50"
              }`}
          >
            {tier.popular && (
              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md">
                Most Popular
              </span>
            )}

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
                What's included
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
                className={`flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold transition ${tier.popular
                    ? "bg-indigo-600 !text-white shadow-sm hover:bg-indigo-500"
                    : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
                  }`}
              >
                {tier.cta}
              </Link>
            </div>
          </FadeIn>
        ))}
      </div>

      {/* Shark Defense: Unit Economics & Token Cost Transparency Box */}
      <div className="mt-12 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/70 via-white to-indigo-50/70 p-5 dark:border-indigo-900/50 dark:from-zinc-900 dark:via-zinc-900/70 dark:to-zinc-900 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-xs">
              $
            </span>
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                The Unit Economics Defense (How Echo Stays Highly Profitable)
              </h4>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                Unlike unconstrained chat wrappers, Echo uses structured schema output on optimized inference (NVIDIA Nemotron & Groq) costing <strong>&lt;$0.002 per synthesis</strong>. Average monthly LLM COGS per active Pro user are under <strong>$0.40/month</strong>, preserving <strong>&gt;95% gross margins</strong>.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-indigo-300 bg-indigo-100/70 px-3 py-1 text-xs font-semibold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            &gt;95% Target Gross Margin
          </span>
        </div>
      </div>
    </section>
  );
}
