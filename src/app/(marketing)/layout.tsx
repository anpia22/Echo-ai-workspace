import React from "react";
import MarketingNavbar from "../components/marketing/MarketingNavbar";
import MarketingFooter from "../components/marketing/MarketingFooter";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="echo-marketing relative isolate min-h-dvh overflow-x-clip bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col selection:bg-indigo-100 selection:text-indigo-900 dark:selection:bg-zinc-800 dark:selection:text-white transition-colors duration-200">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-900 focus:shadow-lg dark:focus:bg-zinc-900 dark:focus:text-white"
      >
        Skip to content
      </a>

      {/* One fixed environment behind every page: soft glow and a faint canvas grid */}
      <div aria-hidden="true" className="echo-env pointer-events-none fixed inset-0 -z-10" />

      <MarketingNavbar />
      <main
        id="main"
        tabIndex={-1}
        className="marketing-content min-w-0 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 flex flex-col justify-center animate-fade-in outline-none"
      >
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
