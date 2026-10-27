import type { MetadataRoute } from "next";
import { getSiteUrl, PRIVATE_PATHS } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // Explicitly welcome AI search and answer-engine crawlers.
      {
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "Claude-SearchBot",
          "Claude-User",
          "PerplexityBot",
          "Perplexity-User",
          "Google-Extended",
          "Applebot-Extended",
          "Bingbot",
        ],
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
