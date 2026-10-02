import Link from "next/link";
import OpenEchoButton from "./OpenEchoButton";

const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/use-cases", label: "Use Cases" },
  { href: "/demo", label: "Demo" },
];

export default function MarketingFooter() {
  return (
    <footer className="w-full border-t border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 transition-colors duration-200">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
        {/* Brand & Tagline */}
        <div className="flex flex-col items-center gap-1.5 text-center sm:items-start sm:text-left">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900 dark:text-white hover:opacity-90 transition-opacity"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900 border border-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 text-xs font-semibold text-white shadow-sm">
              E
            </div>
            <span>Echo</span>
          </Link>
          <p className="text-xs text-zinc-500">
            The AI Workspace That Thinks With You.
          </p>
        </div>

        {/* Links */}
        <nav
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400"
          aria-label="Footer Navigation"
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Action */}
        <div className="flex items-center">
          <OpenEchoButton />
        </div>
      </div>
    </footer>
  );
}
