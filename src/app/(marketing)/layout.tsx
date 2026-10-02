import React from "react";
import MarketingNavbar from "../components/marketing/MarketingNavbar";
import MarketingFooter from "../components/marketing/MarketingFooter";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col selection:bg-indigo-100 selection:text-indigo-900 dark:selection:bg-zinc-800 dark:selection:text-white transition-colors duration-200">
      <MarketingNavbar />
      <main className="marketing-content flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 flex flex-col justify-center animate-fade-in">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
