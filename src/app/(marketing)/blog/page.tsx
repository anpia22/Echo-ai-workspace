import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { withSeo } from "@/lib/seo";
import { BLOG_POSTS, formatBlogDate, type BlogPost } from "@/lib/blog";
import { FadeIn } from "../../components/marketing/motion";
import { Badge, CtaBand, GradientText } from "../../components/marketing/ui";

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

function PostMeta({ post }: { post: BlogPost }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
      <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-indigo-700 dark:text-indigo-300">
        {post.keywords[0]}
      </span>
      <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>
      <span aria-hidden="true">·</span>
      <span>{post.readingMinutes} min read</span>
    </p>
  );
}

export default function BlogIndexPage() {
  const posts = [...BLOG_POSTS].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const [featured, ...rest] = posts;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="relative pt-6 pb-12 text-center sm:pt-12 sm:pb-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-64 max-w-3xl rounded-full bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-sky-500/20 blur-3xl"
        />
        <FadeIn>
          <Badge>The Echo blog</Badge>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-zinc-900 text-balance dark:text-white sm:text-5xl md:text-6xl">
            Thinking in an <GradientText>AI workspace</GradientText>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-600 text-balance dark:text-zinc-300 sm:text-lg">
            Practical notes on live meetings, screen presence, and the visual workspace teams use when a chat
            thread is not enough.
          </p>
        </FadeIn>
      </header>

      {featured ? (
        <FadeIn direction="up">
          <article className="group overflow-hidden rounded-3xl border border-zinc-200 bg-white/80 shadow-sm backdrop-blur transition-all duration-300 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-zinc-700/60 dark:bg-zinc-900/50 dark:shadow-none dark:hover:border-indigo-400/40">
            <div className="grid md:grid-cols-[1.15fr_1fr]">
              <Link href={`/blog/${featured.slug}`} className="relative block aspect-video md:aspect-auto md:min-h-[22rem]" tabIndex={-1} aria-hidden="true">
                <Image
                  src={featured.image}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 640px"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                />
              </Link>
              <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
                <PostMeta post={featured} />
                <h2 className="text-2xl font-semibold leading-tight tracking-tight text-zinc-900 text-balance dark:text-white sm:text-3xl">
                  <Link href={`/blog/${featured.slug}`} className="hover:text-indigo-600 dark:hover:text-indigo-300">
                    {featured.title}
                  </Link>
                </h2>
                <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">{featured.excerpt}</p>
                <Link
                  href={`/blog/${featured.slug}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
                >
                  Read the article <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </article>
        </FadeIn>
      ) : null}

      <ul className="mt-6 grid gap-5 sm:mt-8 md:grid-cols-2">
        {rest.map((post, i) => (
          <li key={post.slug}>
            <FadeIn direction="up" delay={i * 60} className="h-full">
              <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white/80 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/10 dark:border-zinc-700/60 dark:bg-zinc-900/50 dark:shadow-none dark:hover:border-indigo-400/40">
                <Link href={`/blog/${post.slug}`} className="relative block aspect-video overflow-hidden" tabIndex={-1} aria-hidden="true">
                  <Image
                    src={post.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 560px"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                </Link>
                <div className="flex flex-1 flex-col gap-3 p-6">
                  <PostMeta post={post} />
                  <h2 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900 text-balance dark:text-white">
                    <Link href={`/blog/${post.slug}`} className="hover:text-indigo-600 dark:hover:text-indigo-300">
                      {post.title}
                    </Link>
                  </h2>
                  <p className="line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{post.excerpt}</p>
                </div>
              </article>
            </FadeIn>
          </li>
        ))}
      </ul>

      <CtaBand
        title="Try the workspace behind the writing"
        subtitle="Open Echo, talk through a problem, and watch the canvas take shape."
        secondary={{ href: "/demo", label: "See the demo" }}
      />
    </div>
  );
}
