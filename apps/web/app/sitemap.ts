import type { MetadataRoute } from 'next';
import { PROPERTIES, VEHICLES } from '@sahel/domain';
import { LOCALES } from '@sahel/i18n';
import { absoluteUrl, languageAlternates, localePath } from '@/lib/seo';

/**
 * Public, indexable pages only, once per locale with hreflang alternates. Left out on purpose: account, applications,
 * checkout, claims, requests, notifications, rewards, onboarding, trade-in, personal finance, card applications,
 * life-event bundles (priced for the session customer), the dealer portal and the back office. They are also
 * disallowed in robots.ts and noindex in their metadata. The origin comes from SAHEL_PUBLIC_ORIGIN.
 */
export function publicPaths(): string[] {
  return [
    '',
    '/cars',
    ...VEHICLES.map((v) => `/cars/${v.id}`),
    '/property',
    ...PROPERTIES.map((p) => `/property/${p.id}`),
    '/cards',
    '/insurance',
    '/insurance/travel',
    '/insurance/home',
    '/insurance/medical',
    '/insurance/life',
    '/life-events',
  ];
}

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths().flatMap((path) => {
    const languages = Object.fromEntries(Object.entries(languageAlternates(path)).map(([lang, p]) => [lang, absoluteUrl(p)]));
    return LOCALES.map((locale) => ({
      url: absoluteUrl(localePath(locale, path)),
      alternates: { languages },
      changeFrequency: path === '' || path.split('/').length === 2 ? ('daily' as const) : ('weekly' as const),
      priority: path === '' ? 1 : path.split('/').length === 2 ? 0.8 : 0.6,
    }));
  });
}
