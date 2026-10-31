import Link from "next/link";
import OpenEchoButton from "./OpenEchoButton";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/demo", label: "Demo" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/use-cases", label: "Use cases" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export default function MarketingFooter() {
  return (
    <footer className="w-full border-t border-zinc-200/80 bg-slate-50/80 backdrop-blur-sm transition-colors duration-200 dark:border-zinc-800/80 dark:bg-zinc-950/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-8">
        <div className="flex flex-col items-start gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900 transition-opacity hover:opacity-90 dark:text-white"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-semibold !text-white shadow-sm">
              E
            </span>
            <span>Echo</span>
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            The AI workspace that thinks with you. Talk it through and watch the canvas build itself.
          </p>
          <OpenEchoButton />
        </div>

        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title} aria-label={`${column.title} links`}>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
              {column.title}
            </p>
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-zinc-200/80 dark:border-zinc-800/80">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-zinc-500 dark:text-zinc-400 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Echo. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
