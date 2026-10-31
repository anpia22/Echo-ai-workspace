import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSeo } from "@/lib/seo";
import { BLOG_POSTS, formatBlogDate, getBlogPost } from "@/lib/blog";
import { getSiteUrl } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/geo";
import OpenEchoButton from "../../../components/marketing/OpenEchoButton";
import { CtaBand } from "../../../components/marketing/ui";
import JsonLd from "../../../components/seo/JsonLd";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  return withSeo(`/blog/${post.slug}`, {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.publishedAt,
      images: [{ url: post.image, alt: post.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [post.image],
    },
  });
}

const RELATED: Record<string, { href: string; label: string }[]> = {
  "what-problem-does-ai-solve-context-fragmentation": [
    { href: "/use-cases", label: "Echo use cases" },
    { href: "/blog/spatial-ai-canvas-screen-meetings-collaboration", label: "Spatial AI canvas & screen meetings" },
    { href: "/blog/future-of-remote-meetings-ai-workspace-screen-sharing", label: "Future of remote meetings" },
  ],
  "ai-workspace-for-live-meetings": [
    { href: "/how-it-works", label: "How Echo works" },
    { href: "/blog/what-problem-does-ai-solve-context-fragmentation", label: "What problem does AI solve?" },
  ],
  "screen-presence-collaborative-meetings": [
    { href: "/demo", label: "Echo demo" },
    { href: "/blog/what-problem-does-ai-solve-context-fragmentation", label: "What problem does AI solve?" },
  ],
  "visual-ai-workspace-from-conversation": [
    { href: "/use-cases", label: "Use cases" },
    { href: "/blog/what-problem-does-ai-solve-context-fragmentation", label: "What problem does AI solve?" },
  ],
  "future-of-remote-meetings-ai-workspace-screen-sharing": [
    { href: "/demo", label: "Echo demo" },
    { href: "/blog/what-problem-does-ai-solve-context-fragmentation", label: "What problem does AI solve?" },
  ],
  "spatial-ai-canvas-screen-meetings-collaboration": [
    { href: "/how-it-works", label: "How Echo works" },
    { href: "/blog/what-problem-does-ai-solve-context-fragmentation", label: "What problem does AI solve?" },
  ],
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const label = match[1];
    const href = match[2];
    const isInternal = href.startsWith("/");

    if (isInternal) {
      parts.push(
        <Link
          key={`${match.index}-${href}`}
          href={href}
          className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-4 transition-colors hover:text-indigo-700 hover:decoration-indigo-500 dark:text-indigo-400 dark:decoration-indigo-500/60 dark:hover:text-indigo-300"
        >
          {label}
        </Link>
      );
    } else {
      parts.push(
        <a
          key={`${match.index}-${href}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-4 transition-colors hover:text-indigo-700 hover:decoration-indigo-500 dark:text-indigo-400 dark:decoration-indigo-500/60 dark:hover:text-indigo-300"
        >
          {label}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts.length > 0 ? parts : text}</>;
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const siteUrl = await getSiteUrl();
  const related = RELATED[post.slug] ?? [];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    keywords: post.keywords.join(", "),
    author: { "@type": "Organization", name: "Echo", url: siteUrl },
    publisher: {
      "@type": "Organization",
      name: "Echo",
      url: siteUrl,
      logo: { "@type": "ImageObject", url: `${siteUrl}/favicon.ico` },
    },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
    image: `${siteUrl}${post.image}`,
  };
  const breadcrumbs = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Blog", url: `${siteUrl}/blog` },
    { name: post.title, url: `${siteUrl}/blog/${post.slug}` },
  ]);
  const faqSchema = post.faqs && post.faqs.length > 0 ? faqJsonLd(post.faqs) : null;

  const tocItems = [
    ...post.sections.map((section) => ({ id: slugify(section.heading), label: section.heading })),
    ...(post.faqs && post.faqs.length > 0 ? [{ id: "frequently-asked-questions", label: "Questions & Answers (AEO)" }] : []),
  ];
  const relatedPosts = BLOG_POSTS.filter((candidate) => candidate.slug !== post.slug).slice(0, 2);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbs} />
      {faqSchema && <JsonLd data={faqSchema} />}

      <article>
        <header className="mx-auto max-w-3xl pt-4 text-center sm:pt-10">
          <nav aria-label="Breadcrumb" className="text-sm text-zinc-500 dark:text-zinc-400">
            <Link href="/blog" className="hover:text-zinc-900 dark:hover:text-white">
              ← All articles
            </Link>
          </nav>
          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-indigo-700 dark:text-indigo-300">
              {post.keywords[0]}
            </span>
            <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.readingMinutes} min read</span>
          </p>
          <h1 className="mt-5 text-3xl font-semibold leading-[1.12] tracking-tight text-zinc-900 text-balance dark:text-white sm:text-4xl md:text-5xl">
            {post.title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-zinc-600 text-pretty dark:text-zinc-300">
            {post.description}
          </p>
        </header>

        <div className="relative mx-auto mt-10 aspect-video max-w-5xl overflow-hidden rounded-3xl border border-zinc-200 shadow-xl shadow-indigo-500/10 dark:border-zinc-700/60">
          <Image
            src={post.image}
            alt={post.imageAlt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
          />
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-16">
          <div className="flex min-w-0 flex-col gap-12">
            {post.sections.map((section) => (
              <section key={section.heading} id={slugify(section.heading)} className="flex scroll-mt-28 flex-col gap-5">
                <h2 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900 text-balance dark:text-white">
                  {section.heading}
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.slice(0, 48)}
                    className="max-w-[68ch] text-[17px] leading-8 text-zinc-700 dark:text-zinc-300"
                  >
                    <RichText text={paragraph} />
                  </p>
                ))}
              </section>
            ))}

            {/* In-content Discover Echo Banner */}
            <div className="relative overflow-hidden rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/50 p-6 sm:p-8 dark:border-indigo-500/20 dark:from-indigo-950/30 dark:via-zinc-900/40 dark:to-violet-950/20">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                  Explore Echo AI Workspace
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                  Experience thinking and collaborating in one persistent room
                </h3>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Discover how Echo unifies conversational AI, an infinite visual canvas, and live screen meetings without tool switching.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                  <Link
                    href="/demo"
                    className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white/80 p-3.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:border-indigo-400/50 dark:hover:text-indigo-300"
                  >
                    <span>🎯 Interactive Demo</span>
                    <span className="text-zinc-400">→</span>
                  </Link>
                  <Link
                    href="/how-it-works"
                    className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white/80 p-3.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:border-indigo-400/50 dark:hover:text-indigo-300"
                  >
                    <span>⚡ How It Works</span>
                    <span className="text-zinc-400">→</span>
                  </Link>
                  <Link
                    href="/use-cases"
                    className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white/80 p-3.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:border-indigo-400/50 dark:hover:text-indigo-300"
                  >
                    <span>💡 Explore Use Cases</span>
                    <span className="text-zinc-400">→</span>
                  </Link>
                  <Link
                    href="/about"
                    className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white/80 p-3.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:border-indigo-400/50 dark:hover:text-indigo-300"
                  >
                    <span>🏢 About Echo</span>
                    <span className="text-zinc-400">→</span>
                  </Link>
                </div>
              </div>
            </div>

            {post.faqs && post.faqs.length > 0 && (
              <section id="frequently-asked-questions" className="flex scroll-mt-28 flex-col gap-6 border-t border-zinc-200 pt-10 dark:border-zinc-800">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    AEO & GEO Knowledge Vault
                  </span>
                  <h2 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900 text-balance dark:text-white">
                    Frequently Asked Questions & Answers
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Concise, authoritative answers optimized for search query understanding, answer engines (AEO), and LLM knowledge graphs (GEO).
                  </p>
                </div>
                <div className="flex flex-col gap-4">
                  {post.faqs.map((faq, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-6 dark:border-zinc-800/80 dark:bg-zinc-900/40"
                    >
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                        {faq.question}
                      </h3>
                      <p className="mt-2.5 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                        <RichText text={faq.answer} />
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <ul className="flex flex-wrap gap-2 border-t border-zinc-200 pt-8 dark:border-zinc-800">
              {post.keywords.map((keyword) => (
                <li
                  key={keyword}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-28 flex flex-col gap-6">
              <nav aria-label="On this page">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
                  On this page
                </p>
                <ul className="mt-3 flex flex-col gap-2.5 border-l border-zinc-200 pl-4 text-sm dark:border-zinc-800">
                  {tocItems.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="text-zinc-600 transition-colors hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-300"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <OpenEchoButton className="w-full justify-center" />

              <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/40">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
                  Discover Echo
                </p>
                <ul className="mt-3 flex flex-col gap-2.5 text-xs">
                  <li>
                    <Link
                      href="/demo"
                      className="flex items-center justify-between font-medium text-zinc-700 transition-colors hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400"
                    >
                      <span>🎯 Interactive Demo</span>
                      <span>→</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/how-it-works"
                      className="flex items-center justify-between font-medium text-zinc-700 transition-colors hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400"
                    >
                      <span>⚡ How It Works</span>
                      <span>→</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/use-cases"
                      className="flex items-center justify-between font-medium text-zinc-700 transition-colors hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400"
                    >
                      <span>💡 Use Cases</span>
                      <span>→</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/about"
                      className="flex items-center justify-between font-medium text-zinc-700 transition-colors hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400"
                    >
                      <span>🏢 About Echo</span>
                      <span>→</span>
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </article>

      {(related.length > 0 || relatedPosts.length > 0) && (
        <section className="mx-auto mt-20 max-w-5xl" aria-labelledby="keep-reading">
          <h2 id="keep-reading" className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            Keep reading
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {relatedPosts.map((candidate) => (
              <li key={candidate.slug}>
                <Link
                  href={`/blog/${candidate.slug}`}
                  className="group flex h-full flex-col gap-2 rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/10 dark:border-zinc-700/60 dark:bg-zinc-900/50 dark:shadow-none dark:hover:border-indigo-400/40"
                >
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{candidate.readingMinutes} min read</span>
                  <span className="text-base font-semibold leading-snug text-zinc-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-300">
                    {candidate.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {related.length > 0 && (
            <nav aria-label="Related pages" className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {related.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
                >
                  {item.label} →
                </Link>
              ))}
            </nav>
          )}
        </section>
      )}

      <CtaBand
        title="Think it through in Echo"
        subtitle="Open the workspace and turn a conversation into a canvas."
        secondary={{ href: "/demo", label: "See the demo" }}
      />
    </div>
  );
}
