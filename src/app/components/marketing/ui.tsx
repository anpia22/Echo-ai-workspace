import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import OpenEchoButton from "./OpenEchoButton";
import { FadeIn } from "./motion";

// Shared building blocks for the marketing pages: one modern "AI product" look.

export function GradientText({ children }: { children: ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500 bg-clip-text text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-sky-300">
      {children}
    </span>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/50 dark:text-zinc-300">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-500 dark:text-indigo-300" aria-hidden="true">
        <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2zm7 11l.9 2.6 2.6.9-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13z" />
      </svg>
      {children}
    </span>
  );
}

export function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M2.5 6h7m-3.5-3.5L9.5 6 6 9.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="echo-secondary-btn inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-700 shadow-sm transition-all hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-white"
    >
      <span>{children}</span>
      <ArrowIcon />
    </Link>
  );
}

/** Page hero: pill, big headline, subtitle, two actions, optional product visual below. */
export function PageHero({
  badge,
  title,
  subtitle,
  secondary,
  children,
}: {
  badge: string;
  title: ReactNode;
  subtitle: string;
  secondary: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <section className="relative pt-6 pb-10 text-center sm:pt-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-72 max-w-3xl rounded-full bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-sky-500/20 blur-3xl"
      />
      <FadeIn direction="up">
        <Badge>{badge}</Badge>
        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-zinc-900 text-balance dark:text-white sm:text-5xl md:text-6xl lg:text-7xl">
          {title}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-600 text-balance dark:text-zinc-300 sm:text-lg md:text-xl">
          {subtitle}
        </p>
        <div className="mx-auto mt-9 flex w-full max-w-xs flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
          <OpenEchoButton className="px-6 py-3 text-sm" />
          <SecondaryLink href={secondary.href}>{secondary.label}</SecondaryLink>
        </div>
      </FadeIn>
      {children ? (
        <FadeIn scale delay={150} className="mt-14 sm:mt-16">
          {children}
        </FadeIn>
      ) : null}
    </section>
  );
}

/** Real product screenshot in a browser-style frame, themed to match the page. */
export function ProductFrame({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-5xl ${className}`}>
      <div
        aria-hidden="true"
        className="absolute -inset-x-6 -inset-y-4 -z-10 rounded-[2rem] bg-gradient-to-b from-indigo-500/25 via-violet-500/15 to-transparent blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-indigo-500/10 dark:border-zinc-700/60 dark:bg-zinc-900 sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <span className="mx-auto rounded-md bg-zinc-200/70 px-12 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            Echo workspace
          </span>
        </div>
        {/* Phones get a portrait capture whose text stays readable; larger screens get the full workspace */}
        <Image
          src="/screenshots/workspace-mobile-dark.png"
          alt="Echo canvas: a problem node connected to an idea and a decision."
          width={780}
          height={1162}
          className="hidden h-auto w-full dark:max-sm:block"
        />
        <Image
          src="/screenshots/workspace-mobile-light.png"
          alt=""
          aria-hidden="true"
          width={780}
          height={1162}
          className="hidden h-auto w-full max-sm:block dark:max-sm:hidden"
        />
        <Image
          src="/screenshots/workspace-dark.png"
          alt="Echo workspace: an AI conversation on the right and the connected canvas it built, with problem, question, idea, decision, solution and task nodes."
          width={1600}
          height={900}
          priority
          className="hidden h-auto w-full dark:sm:block"
        />
        <Image
          src="/screenshots/workspace-light.png"
          alt=""
          aria-hidden="true"
          width={1600}
          height={900}
          className="hidden h-auto w-full sm:block dark:sm:hidden"
        />
      </div>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  align?: "center" | "left";
}) {
  return (
    <FadeIn
      direction="up"
      className={`mb-12 ${align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}`}
    >
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-zinc-900 text-balance dark:text-white sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-base leading-relaxed text-zinc-600 text-pretty dark:text-zinc-300 sm:text-lg">
          {subtitle}
        </p>
      ) : null}
    </FadeIn>
  );
}

export function BentoGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:gap-5 ${cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
      {children}
    </div>
  );
}

export function BentoCard({
  title,
  body,
  icon,
  className = "",
  children,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <FadeIn
      direction="up"
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/10 dark:border-zinc-700/60 dark:bg-zinc-900/50 dark:shadow-none dark:hover:border-indigo-400/40 sm:p-7 ${className}`}
    >
      {icon ? (
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 dark:text-indigo-300">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">{body}</p>
      {children ? <div className="mt-6 flex flex-1 items-end justify-center">{children}</div> : null}
    </FadeIn>
  );
}

/** Numbered step in a vertical flow. */
export function StepRow({
  number,
  title,
  body,
  visual,
  flip = false,
}: {
  number: string;
  title: string;
  body: ReactNode;
  visual: ReactNode;
  flip?: boolean;
}) {
  return (
    <FadeIn direction="up" className="rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/50 dark:shadow-none sm:p-10">
      <div className={`flex flex-col items-center gap-10 md:gap-14 ${flip ? "md:flex-row-reverse" : "md:flex-row"}`}>
        <div className="min-w-0 flex-1">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold !text-white shadow-lg shadow-indigo-500/30">
            {number}
          </span>
          <h3 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900 text-balance dark:text-white sm:text-3xl">
            {title}
          </h3>
          <div className="mt-4 space-y-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">{body}</div>
        </div>
        <div className="flex w-full flex-1 justify-center md:max-w-md">{visual}</div>
      </div>
    </FadeIn>
  );
}

export function CtaBand({
  title,
  subtitle,
  secondary,
}: {
  title: string;
  subtitle: string;
  secondary: { href: string; label: string };
}) {
  return (
    <section className="py-14 sm:py-20">
      <FadeIn scale>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 px-6 py-14 text-center shadow-2xl shadow-indigo-500/20 sm:px-12 sm:py-20">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight !text-white text-balance sm:text-4xl md:text-5xl">
              {title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base !text-indigo-50 text-balance sm:text-lg">{subtitle}</p>
            <div className="mx-auto mt-9 flex w-full max-w-xs flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
              <OpenEchoButton className="px-6 py-3 text-sm" />
              <SecondaryLink href={secondary.href}>{secondary.label}</SecondaryLink>
            </div>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}

// Small icons for bento cards
export const Icons = {
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  graph: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.2 7l7.6.7M7.5 8l3 8M16.7 10l-3.5 6.5" />
    </svg>
  ),
  layers: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6M17 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-2.6-1.6-4.5-4-5.4" />
    </svg>
  ),
  video: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10l7-3v10l-7-3z" />
    </svg>
  ),
  save: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </svg>
  ),
};
