import { faqJsonLd } from "@/lib/geo";
import JsonLd from "./JsonLd";

type FaqItem = { question: string; answer: string };

/** Visible Q&A with matching FAQPage markup, so answer engines can quote it directly. */
export default function FaqSection({
  items,
  heading = "Frequently asked questions",
}: {
  items: FaqItem[];
  heading?: string;
}) {
  return (
    <section aria-labelledby="faq-heading" className="mx-auto w-full max-w-3xl py-14 sm:py-20">
      <JsonLd data={faqJsonLd(items)} />
      <div className="mb-8 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
          FAQ
        </span>
        <h2
          id="faq-heading"
          className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl"
        >
          {heading}
        </h2>
      </div>
      <dl className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.question}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:shadow-none sm:p-6"
          >
            <dt className="text-base font-semibold text-zinc-900 dark:text-white">
              {item.question}
            </dt>
            <dd className="mt-2 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
