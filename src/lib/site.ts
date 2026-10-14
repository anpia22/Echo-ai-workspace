import { headers } from "next/headers";

export const SITE_NAME = "Echo";

export const SITE_DESCRIPTION =
  "Echo is an AI workspace that helps you think, organize ideas, analyze information, and turn conversations into a visual workspace.";

/** Paths crawlers may index. */
export const PUBLIC_PAGES = [
  {
    path: "/",
    title: "Home",
    description:
      "Open Echo, the AI workspace that thinks with you and turns conversation into a visual canvas.",
    changeFrequency: "weekly" as const,
    priority: 1,
  },
  {
    path: "/about",
    title: "About",
    description:
      "Why Echo was built: one workspace for conversational AI and visual thinking.",
    changeFrequency: "monthly" as const,
    priority: 0.8,
  },
  {
    path: "/how-it-works",
    title: "How it works",
    description:
      "How Echo turns conversation into structured visual thinking on a spatial canvas.",
    changeFrequency: "monthly" as const,
    priority: 0.8,
  },
  {
    path: "/use-cases",
    title: "Use cases",
    description:
      "Explore problems, plan projects, evaluate decisions, and create ideas with Echo.",
    changeFrequency: "monthly" as const,
    priority: 0.8,
  },
  {
    path: "/demo",
    title: "Demo",
    description:
      "Walkthrough of Echo's AI dialogue, infinite canvas, live collaboration, and meetings.",
    changeFrequency: "monthly" as const,
    priority: 0.7,
  },
];

/** Paths that must not be crawled or used as AI training material. */
export const PRIVATE_PATHS = ["/api/", "/meeting-test"];

export async function getSiteUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");

  if (host) return `${proto}://${host}`;
  return "http://localhost:3003";
}
