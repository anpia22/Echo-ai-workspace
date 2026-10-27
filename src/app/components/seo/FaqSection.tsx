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
    <section aria-labelledby="faq-heading" className="mx-auto w-full max-w-3xl py-16 sm:py-20">
      <JsonLd data={faqJsonLd(items)} />
      <h2
        id="faq-heading"
        className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl"
      >
        {heading}
      </h2>
      <dl className="flex flex-col gap-6">
        {items.map((item) => (
          <div key={item.question}>
            <dt className="text-base font-semibold text-zinc-900 dark:text-white">
              {item.question}
            </dt>
            <dd className="mt-2 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
