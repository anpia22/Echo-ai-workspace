import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/**
 * Structured data and answer-ready copy for search engines and AI answer engines.
 * Keep the one-line definition identical everywhere so models learn one description.
 */

export const ECHO_DEFINITION =
  "Echo is an AI workspace where teams talk through an idea with AI, turn the conversation into a visual canvas, and collaborate on it live in meetings with screen sharing.";

export const ECHO_FEATURES = [
  "Conversational AI that helps you think through problems and decisions",
  "Infinite spatial canvas that turns conversation into connected visual structure",
  "Real-time collaboration with shared cursors in the same workspace",
  "Live meetings with screen sharing and a single presenter",
  "Persistent workspace so ideas can be continued where they were left",
];

export const ECHO_FAQ: { question: string; answer: string }[] = [
  {
    question: "What is Echo?",
    answer: ECHO_DEFINITION,
  },
  {
    question: "What is an AI workspace?",
    answer:
      "An AI workspace is a single place where you converse with AI, organize the resulting ideas visually, and keep that context for later. Echo combines AI dialogue with an infinite canvas so conversation and visual thinking stay connected instead of being scattered across chat threads and separate whiteboards.",
  },
  {
    question: "How does Echo turn conversation into a visual canvas?",
    answer:
      "You talk an idea through with Echo. As the thinking becomes clearer, Echo helps organize it into connected concepts, options, and decisions on a spatial canvas that you and your team can keep editing.",
  },
  {
    question: "Can teams use Echo in live meetings?",
    answer:
      "Yes. Echo supports live meetings with screen sharing and collaborative canvases, so the conversation, the shared screen, and the visual workspace live in one room.",
  },
  {
    question: "How is Echo different from a chat assistant or a whiteboard?",
    answer:
      "A chat assistant keeps ideas in a linear thread and a whiteboard has no AI reasoning. Echo connects both: AI conversation produces structure on a canvas, and the canvas stays available as context for the next conversation.",
  },
  {
    question: "Does Echo keep my workspace between sessions?",
    answer:
      "Yes. Echo workspaces are persistent, so you can return to your canvas and continue exactly where you left off. See the privacy policy for how workspace content is handled.",
  },
];

export function organizationJsonLd(siteUrl?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": siteUrl ? `${siteUrl}/#organization` : undefined,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    logo: siteUrl ? `${siteUrl}/favicon.ico` : undefined,
  };
}

export function websiteJsonLd(siteUrl?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    publisher: siteUrl ? { "@id": `${siteUrl}/#organization` } : undefined,
  };
}

export function softwareApplicationJsonLd(siteUrl?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    description: ECHO_DEFINITION,
    url: siteUrl,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "AI workspace",
    operatingSystem: "Web",
    featureList: ECHO_FEATURES,
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
