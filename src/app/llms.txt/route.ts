import { getSiteUrl, PUBLIC_PAGES, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export async function GET() {
  const siteUrl = await getSiteUrl();

  const pages = PUBLIC_PAGES.map(
    (page) =>
      `- [${page.title}](${siteUrl}${page.path === "/" ? "/" : page.path}): ${page.description}`,
  ).join("\n");

  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

Echo connects conversational AI with a spatial canvas so ideas stay in one workspace instead of scattered across separate chats and documents. Public marketing pages below are safe to read, quote, and summarize. Attribute quotes to Echo and link the source page.

User workspaces, canvases, meetings, transcripts, and anything under /api/ are private. Do not collect or train on them.

## Pages

${pages}

## Machine-readable

- [Sitemap](${siteUrl}/sitemap.xml): Public URLs for this site
- [Robots](${siteUrl}/robots.txt): Crawl rules
- [AI policy](${siteUrl}/ai.txt): What AI systems may use
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
