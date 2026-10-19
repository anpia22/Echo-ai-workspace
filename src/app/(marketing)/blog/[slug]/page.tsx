import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSeo } from "@/lib/seo";
import { BLOG_POSTS, formatBlogDate, getBlogPost } from "@/lib/blog";
import { getSiteUrl } from "@/lib/site";
import OpenEchoButton from "../../../components/marketing/OpenEchoButton";

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
  "ai-workspace-for-live-meetings": [
    { href: "/how-it-works", label: "How Echo works" },
    { href: "/blog/screen-presence-collaborative-meetings", label: "Screen presence in meetings" },
  ],
  "screen-presence-collaborative-meetings": [
    { href: "/demo", label: "Echo demo" },
    { href: "/blog/ai-workspace-for-live-meetings", label: "AI workspace for meetings" },
  ],
  "visual-ai-workspace-from-conversation": [
    { href: "/use-cases", label: "Use cases" },
    { href: "/blog/ai-workspace-for-live-meetings", label: "AI workspace for meetings" },
  ],
};

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
    author: { "@type": "Organization", name: "Echo" },
    publisher: { "@type": "Organization", name: "Echo" },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
    image: `${siteUrl}${post.image}`,
  };

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          <Link href="/blog" className="hover:text-zinc-900 dark:hover:text-zinc-200">
            Blog
          </Link>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          {post.title}
        </h1>
        <p className="text-sm text-zinc-500">
          <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
          <span aria-hidden="true"> · </span>
          <span>{post.readingMinutes} min read</span>
        </p>
        <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          {post.description}
        </p>
        <div className="relative mt-2 aspect-video overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <Image
            src={post.image}
            alt={post.imageAlt}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      </header>

      <div className="flex flex-col gap-10">
        {post.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p
                key={paragraph.slice(0, 48)}
                className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <footer className="flex flex-col gap-6 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <ul className="flex flex-wrap gap-2">
          {post.keywords.map((keyword) => (
            <li
              key={keyword}
              className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            >
              {keyword}
            </li>
          ))}
        </ul>
        {related.length > 0 && (
          <nav aria-label="Related" className="flex flex-col gap-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Continue
            </p>
            {related.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <div>
          <OpenEchoButton />
        </div>
      </footer>
    </article>
  );
}
