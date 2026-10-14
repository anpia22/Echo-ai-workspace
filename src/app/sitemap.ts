import type { MetadataRoute } from "next";
import { getSiteUrl, PUBLIC_PAGES } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getSiteUrl();
  const lastModified = new Date();

  return PUBLIC_PAGES.map((page) => ({
    url: `${siteUrl}${page.path === "/" ? "" : page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
