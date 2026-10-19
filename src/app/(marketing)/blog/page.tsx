import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { withSeo } from "@/lib/seo";
import { BLOG_POSTS, formatBlogDate } from "@/lib/blog";
import { FadeIn } from "../../components/marketing/motion";

export const metadata: Metadata = withSeo("/blog", {
  title: "Blog",
  description:
    "Notes on AI workspaces, live meetings, screen presence, and collaborative visual thinking with Echo.",
  keywords: [
    "AI workspace",
    "live meeting",
    "screen presence",
    "screen sharing",
    "visual workspace",
    "collaborative AI",
  ],
  openGraph: {
    title: "Blog",
    description:
      "Notes on AI workspaces, live meetings, screen presence, and collaborative visual thinking with Echo.",
    type: "website",
  },
});

export default function BlogIndexPage() {
  const posts = [...BLOG_POSTS].sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : -1,
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-12">
      <FadeIn>
        <header className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
            Blog
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
            Thinking in an AI workspace
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            Practical notes on live meetings, screen presence, and the visual
            workspace teams use when a chat thread is not enough.
          </p>
        </header>
      </FadeIn>

      <ul className="flex flex-col gap-4">
        {posts.map((post) => (
          <li key={post.slug}>
            <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-indigo-500/40">
              <Link href={`/blog/${post.slug}`} className="relative block aspect-video">
                <Image
                  src={post.image}
                  alt={post.imageAlt}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                />
              </Link>
              <div className="p-6">
                <p className="text-xs text-zinc-500">
                  <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
                  <span aria-hidden="true"> · </span>
                  <span>{post.readingMinutes} min read</span>
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                  <Link href={`/blog/${post.slug}`} className="hover:text-indigo-600 dark:hover:text-indigo-300">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {post.excerpt}
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {post.keywords.slice(0, 3).map((keyword) => (
                    <li
                      key={keyword}
                      className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                    >
                      {keyword}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
