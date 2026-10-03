import en from './en.json';
import ar from './ar.json';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export type AppLocale = 'en' | 'ar';

export const LOCALES: AppLocale[] = ['en', 'ar'];
export const MESSAGES: Record<AppLocale, Messages> = { en, ar: ar as Messages };

export function isLocale(x: string): x is AppLocale {
  return (LOCALES as string[]).includes(x);
}

export function dir(locale: AppLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Translate with {placeholder} interpolation. Same placeholders as the Flutter ARB files. */
export function t(locale: AppLocale, key: MessageKey, vars: Record<string, string | number> = {}): string {
  return MESSAGES[locale][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
