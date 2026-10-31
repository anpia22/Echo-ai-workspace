"use client";

import { useState, type ReactNode } from "react";

export type UseCaseTab = {
  id: string;
  label: string;
  tagline: string;
  heading: string;
  description: string;
  prompts: string[];
  visual: ReactNode;
};

export default function UseCaseTabs({ tabs }: { tabs: UseCaseTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Ways to think with Echo"
        className="mx-auto mb-8 grid max-w-3xl grid-cols-2 gap-1.5 rounded-2xl border border-zinc-200 bg-white/70 p-1.5 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/50 sm:grid-cols-4"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveId(tab.id)}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                selected
                  ? "bg-gradient-to-br from-indigo-500 to-violet-500 !text-white shadow-md shadow-indigo-500/25"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${active.id}`}
        aria-labelledby={`tab-${active.id}`}
        className="grid items-center gap-10 rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/50 dark:shadow-none md:grid-cols-2 md:gap-14 md:p-10"
      >
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
            {active.tagline}
          </span>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 text-balance dark:text-white sm:text-3xl">
            {active.heading}
          </h3>
          <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">{active.description}</p>
          <ul className="mt-6 space-y-2.5">
            {active.prompts.map((prompt) => (
              <li
                key={prompt}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm italic text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-300"
              >
                &ldquo;{prompt}&rdquo;
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center">{active.visual}</div>
      </div>

      {/* Crawlable text for the tabs that are not currently shown */}
      <div className="sr-only">
        {tabs
          .filter((tab) => tab.id !== active.id)
          .map((tab) => (
            <section key={tab.id}>
              <h3>{tab.heading}</h3>
              <p>{tab.description}</p>
            </section>
          ))}
      </div>
    </div>
  );
}
