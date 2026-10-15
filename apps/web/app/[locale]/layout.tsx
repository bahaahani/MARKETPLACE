import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { LOCALES, t, type AppLocale } from '@sahel/i18n';
import { AssistantLauncher } from '@/components/AssistantLauncher';
import { Header } from '@/components/Header';
import { resolveLocale, translator } from '@/lib/i18n';
import { BRAND_COLOR, OG_LOCALE } from '@/lib/seo';
import { publicOrigin } from '@/lib/origins';
import '../globals.css';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: BRAND_COLOR };

// Defaults for every page. Public pages complete canonical, hreflang and Open Graph with pageMetadata() (lib/seo.ts);
// private ones add noindex (privateMetadata). metadataBase makes the relative URLs absolute (SAHEL_PUBLIC_ORIGIN).
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = (LOCALES as string[]).includes(locale) ? (locale as AppLocale) : 'en';
  return {
    metadataBase: new URL(publicOrigin()),
    applicationName: t(l, 'appName'),
    title: { default: `${t(l, 'appName')} · BCFC`, template: `%s · ${t(l, 'appName')}` },
    description: t(l, 'tagline'),
    manifest: '/manifest.webmanifest',
    icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icons/192', sizes: '192x192', type: 'image/png' }], apple: '/icons/180' },
    openGraph: { type: 'website', siteName: t(l, 'appName'), locale: OG_LOCALE[l] },
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const tr = translator(locale);
  return (
    <html lang={locale} dir={tr.dir}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen">
        <Header locale={locale} />
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
        <footer className="border-t border-border py-6 text-center text-xs text-text-muted">
          Bahrain Commercial Facilities Company B.S.C. · {tr.t('sandboxNotice')}
          <span className="mx-2" aria-hidden>·</span>
          <Link href={`/${locale}/dealer`} className="underline hover:text-text" data-testid="footer-dealer-link">
            {tr.t('dealerPortalLink')}
          </Link>
          <span className="mx-2" aria-hidden>·</span>
          <Link href={`/${locale}/backoffice`} className="underline hover:text-text" data-testid="footer-backoffice-link">
            {tr.t('boLink')}
          </Link>
        </footer>
        <AssistantLauncher locale={locale} />
      </body>
    </html>
  );
}
