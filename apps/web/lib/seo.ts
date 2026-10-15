import type { Metadata } from 'next';
import { LOCALES, t, type AppLocale } from '@sahel/i18n';
import tokens from '../../../packages/design-tokens/tokens.json';
import { publicOrigin } from './origins';

/**
 * Page metadata helpers: canonical URL, hreflang alternates (en, ar, x-default), Open Graph and Twitter tags.
 *
 * Every public page builds its metadata with pageMetadata() so the tags cannot drift apart. URLs are relative paths
 * here; `metadataBase` (set in app/[locale]/layout.tsx from SAHEL_PUBLIC_ORIGIN) makes them absolute. Where an
 * absolute URL is needed (JSON-LD, sitemap) use absoluteUrl().
 */
export const COLORS = tokens.color;
export const BRAND_COLOR = tokens.color.brand;
export const OG_LOCALE: Record<AppLocale, string> = { en: 'en_US', ar: 'ar_BH' };
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const DEFAULT_LOCALE: AppLocale = 'en';

/** `/en/cars/veh_1` from (`en`, `/cars/veh_1`). The home page is path ''. */
export function localePath(locale: AppLocale, path = ''): string {
  return `/${locale}${path}`;
}

export function absoluteUrl(path: string): string {
  return new URL(path, publicOrigin()).toString();
}

/** hreflang map for one page, with x-default pointing to the English page. */
export function languageAlternates(path = ''): Record<string, string> {
  return {
    ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])),
    'x-default': localePath(DEFAULT_LOCALE, path),
  };
}

export interface PageMeta {
  locale: AppLocale;
  /** Path without the locale prefix: '', '/cars', '/cars/veh_1' */
  path: string;
  title: string;
  description: string;
  /** Use the title as is (no " · Sahel" suffix), for the home page */
  absoluteTitle?: boolean;
  ogType?: 'website' | 'article';
}

export function pageMetadata({ locale, path, title, description, absoluteTitle, ogType = 'website' }: PageMeta): Metadata {
  const url = localePath(locale, path);
  const image = { url: `/og/${locale}`, ...OG_IMAGE_SIZE, alt: t(locale, 'seoOgImageAlt') };
  const fullTitle = absoluteTitle ? title : `${title} · ${t(locale, 'appName')}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: ogType,
      siteName: t(locale, 'appName'),
      title: fullTitle,
      description,
      url,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: fullTitle, description, images: [image.url] },
  };
}

/** Private pages (customer, dealer, staff, checkout): not indexed, links not followed. */
export const privateMetadata: Metadata = { robots: { index: false, follow: false } };

/** schema.org BreadcrumbList; the last crumb is the current page. Paths have no locale prefix. */
export function breadcrumbLd(locale: AppLocale, crumbs: { name: string; path: string }[]) {
  const all = [{ name: t(locale, 'navHome'), path: '' }, ...crumbs];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(localePath(locale, c.path)) })),
  };
}
