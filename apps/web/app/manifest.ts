import type { MetadataRoute } from 'next';
import { t } from '@sahel/i18n';
import { BRAND_COLOR, COLORS } from '@/lib/seo';

/** Web app manifest. Icons are generated from the brand "S" mark by app/icons/[size]/route.tsx. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sahel',
    short_name: 'Sahel',
    description: t('en', 'tagline'),
    start_url: '/en',
    scope: '/',
    display: 'standalone',
    background_color: COLORS.background,
    theme_color: BRAND_COLOR,
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
