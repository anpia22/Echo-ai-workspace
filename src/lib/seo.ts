// Merges the AI agent's title/description overrides into your Next.js metadata.
// The same metadata is served to every visitor and to Google (no cloaking).
import type { Metadata } from 'next';
import overridesJson from '../../seo/meta-overrides.json';

type Override = { title: string; description: string; updatedAt?: string };
const overrides = overridesJson as Record<string, Override>;

const normalize = (path: string) => {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '');
  return p === '' ? '/' : p;
};

/**
 * Wrap the metadata for a page with the AI's latest version, if any.
 *
 *   export async function generateMetadata({ params }) {
 *     const { slug } = await params;
 *     const post = await getPost(slug);
 *     return withSeo(`/blog/${slug}`, { title: post.title, description: post.excerpt });
 *   }
 */
/** Share card served by src/app/opengraph-image.tsx. Pages that set their own openGraph would otherwise drop it. */
const DEFAULT_SHARE_IMAGE = '/opengraph-image';

export function withSeo(path: string, base: Metadata = {}): Metadata {
  const o = overrides[normalize(path)];
  const merged: Metadata = o
    ? {
        ...base,
        // `absolute` stops a layout's title template from adding a second brand suffix.
        title: { absolute: o.title },
        description: o.description,
        openGraph: { ...(base.openGraph ?? {}), title: o.title, description: o.description },
        twitter: { ...(base.twitter ?? {}), title: o.title, description: o.description },
      }
    : base;
  return {
    ...merged,
    openGraph: { images: [DEFAULT_SHARE_IMAGE], ...(merged.openGraph ?? {}) },
    twitter: { card: 'summary_large_image', images: [DEFAULT_SHARE_IMAGE], ...(merged.twitter ?? {}) },
  } as Metadata;
}
