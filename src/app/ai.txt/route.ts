import { getSiteUrl, PRIVATE_PATHS } from "@/lib/site";

export async function GET() {
  const siteUrl = await getSiteUrl();
  const disallows = PRIVATE_PATHS.map((path) => `Disallow: ${path}`).join("\n");

  const body = `# ai.txt for ${siteUrl}
# Public pages may be retrieved and cited. Private product data may not.

User-agent: *
Allow: /
${disallows}

# Usage
# Search and answers: yes, for the public pages listed in llms.txt.
# Attribution: quote Echo and link the source URL.
# Training: public marketing pages only. Do not train on user workspaces,
# canvases, meetings, transcripts, or API responses.

Sitemap: ${siteUrl}/sitemap.xml
Llms-Txt: ${siteUrl}/llms.txt
Robots: ${siteUrl}/robots.txt
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
