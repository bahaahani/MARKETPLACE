import type { Locale } from '../money';

/**
 * Text normalization for the assistant's intent rules (Suhail & Suhaila 2.0).
 *
 * Arabic is written many ways for the same word, especially in chat Gulf / Bahraini Arabic, so both the customer's
 * text and every keyword are normalized the same way before matching:
 * - Arabic-Indic (٠١٢…) and Persian (۰۱۲…) digits become Latin digits; the Arabic decimal and thousands separators
 *   become "." and ",";
 * - tatweel (ـ) and diacritics (tashkeel, superscript alef) are removed;
 * - alef variants (أ إ آ ٱ) become ا, alef maqsura ى becomes ي, ta marbuta ة becomes ه, ؤ becomes و, ئ becomes ي;
 * - Persian / Urdu letters often typed on Gulf keyboards (ک ی گ) become ك ي ك;
 * - Latin text is lower-cased; punctuation becomes spaces; whitespace is collapsed.
 */

const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;

export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/٫/g, '.') // Arabic decimal separator
    .replace(/٬/g, ','); // Arabic thousands separator
}

export function normalizeArabic(s: string): string {
  return s
    .replace(/ـ/g, '') // tatweel
    .replace(/[ً-ٰٟۖ-ۭ]/g, '') // tashkeel and Quranic marks
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/ؤ/g, 'و') // ؤ -> و
    .replace(/ئ/g, 'ي') // ئ -> ي
    .replace(/[کگ]/g, 'ك') // ک گ -> ك
    .replace(/[ی]/g, 'ي'); // ی -> ي
}

/** Normalized form used for matching. Keeps letters, digits, "." and "," inside numbers, and single spaces. */
export function normalizeText(s: string): string {
  const t = normalizeArabic(toLatinDigits(s.normalize('NFKC'))).toLowerCase();
  return t
    .replace(/(\d)[,](?=\d{3}\b)/g, '$1') // 1,500 -> 1500
    .replace(/[^\p{L}\p{N}.\s-]/gu, ' ')
    .replace(/(?<!\d)[.]|[.](?!\d)/g, ' ')
    .replace(/(?<![\p{L}\p{N}])-|-(?![\p{L}\p{N}])/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARABIC_LETTER = /[؀-ۿ]/g;
const LATIN_LETTER = /[a-z]/gi;

/**
 * The language to answer in: Arabic when the text is mostly Arabic letters, English when mostly Latin letters,
 * otherwise (digits only, emoji) the app's locale.
 */
export function detectLanguage(text: string, fallback: Locale): Locale {
  const ar = text.match(ARABIC_LETTER)?.length ?? 0;
  const en = text.match(LATIN_LETTER)?.length ?? 0;
  if (ar === 0 && en === 0) return fallback;
  return ar >= en ? 'ar' : 'en';
}
