/**
 * Money is always held as integer fils (1 BHD = 1000 fils). Never use floats for stored amounts.
 */
export type Fils = number;

export const FILS_PER_BHD = 1000;

export function bhd(amount: number): Fils {
  return Math.round(amount * FILS_PER_BHD);
}

export function toBhd(fils: Fils): number {
  return fils / FILS_PER_BHD;
}

export type Locale = 'en' | 'ar';

/**
 * Arabic uses Latin digits (ar-BH-u-nu-latn), matching Flutter's `intl` Arabic formatting,
 * so web and mobile render identical numbers. Product decision; revisit with brand guidelines.
 */
export const NUMBER_LOCALE: Record<Locale, string> = { en: 'en-BH', ar: 'ar-BH-u-nu-latn' };

export function formatBhd(
  fils: Fils,
  locale: Locale = 'en',
  opts: { decimals?: 0 | 3 } = {},
): string {
  const decimals = opts.decimals ?? 3;
  const n = new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toBhd(fils));
  return locale === 'ar' ? `${n} د.ب.` : `BHD ${n}`;
}
