import { dir, isLocale, t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { formatBhd, NUMBER_LOCALE, type Fils } from '@sahel/domain';
import { notFound } from 'next/navigation';

export function resolveLocale(raw: string): AppLocale {
  if (!isLocale(raw)) notFound();
  return raw;
}

export function translator(locale: AppLocale) {
  return {
    locale,
    dir: dir(locale),
    t: (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars),
    money: (fils: Fils, decimals: 0 | 3 = 3) => formatBhd(fils, locale, { decimals }),
    num: (n: number) => new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(n),
    date: (iso: string) =>
      new Intl.DateTimeFormat(locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)),
  };
}

export type Translator = ReturnType<typeof translator>;
