'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';

const NAV: { href: string; key: MessageKey }[] = [
  { href: '', key: 'navHome' },
  { href: '/cars', key: 'navCars' },
  { href: '/property', key: 'navProperty' },
  { href: '/cards', key: 'navCards' },
  { href: '/insurance', key: 'navInsurance' },
  { href: '/account', key: 'navAccount' },
];

export function Header({ locale }: { locale: AppLocale }) {
  const pathname = usePathname() ?? `/${locale}`;
  const other: AppLocale = locale === 'en' ? 'ar' : 'en';
  const switchHref = pathname.replace(/^\/(en|ar)/, `/${other}`);
  const rest = pathname.replace(/^\/(en|ar)/, '');

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href={`/${locale}`} className="flex items-center gap-2 text-xl font-bold text-brand">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm text-white">S</span>
          {t(locale, 'appName')}
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => {
            const active = n.href === '' ? rest === '' : rest.startsWith(n.href);
            return (
              <Link
                key={n.key}
                href={`/${locale}${n.href}`}
                className={`rounded-md px-3 py-2 text-sm font-medium ${active ? 'bg-brand-soft text-brand' : 'text-text-muted hover:text-text'}`}
              >
                {t(locale, n.key)}
              </Link>
            );
          })}
        </nav>
        <Link href={switchHref} className="ms-auto rounded-md border border-border px-3 py-1.5 text-sm font-medium md:ms-0" hrefLang={other}>
          {t(locale, 'languageSwitch')}
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Main mobile">
        {NAV.map((n) => (
          <Link key={n.key} href={`/${locale}${n.href}`} className="whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs">
            {t(locale, n.key)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
