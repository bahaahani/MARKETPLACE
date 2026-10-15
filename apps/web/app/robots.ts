import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

/**
 * Crawlers may read the public marketplace pages; the API, customer, dealer and staff areas are disallowed
 * (`*` matches the locale segment). Disallowing keeps crawlers out; the pages are also `noindex` in their metadata
 * and X-Robots-Tag for the case a link to them is found elsewhere. Keep in step with app/sitemap.ts.
 */
export const PRIVATE_PATHS = [
  '/api/',
  '/*/account',
  '/*/applications',
  '/*/backoffice',
  '/*/dealer',
  '/*/claims',
  '/*/checkout',
  '/*/requests',
  '/*/notifications',
  '/*/rewards',
  '/*/onboarding',
  '/*/trade-in',
  '/*/finance',
  '/*/cards/*/apply',
  '/*/life-events/*',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
