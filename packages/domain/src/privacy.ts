import { toLatinDigits } from './assistant/normalize';

/**
 * Shared privacy helpers (07-security-compliance §4, data minimization): redaction of identifiers typed into free
 * text, and masking of plates. Used by the assistant (its replies and memory), by claims (description, location,
 * police report) and by trade-in / My Garage (plates).
 */

export const REDACTED = '[•••]';

const PII = new RegExp(
  [
    /(?<!\d)(?:\d[ ._/-]?){8,}\d(?!\d)/.source, // CPR, card number, phone (digits split by space, dash, dot, slash or underscore)
    /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u.source, // e-mail
    /\b[A-Z]{2}\d{2}[A-Z]{4}[\dA-Z]{10,30}\b/.source, // IBAN
  ].join('|'),
  'giu',
);

/**
 * Bahrain phone numbers are 8 digits starting with 1 (landline), 3 or 6 (mobile) or 7, alone or as "4 + 4" groups,
 * with an optional +973 / 00973 prefix. Years and dates ("2026-10-03", "2026-0042") and amounts ("1,200.000") do not
 * have that shape.
 */
const PHONE = /(?<![\d.,])(?:(?:\+|00)973[ -]?)?[1367]\d{3}[ -]?\d{4}(?!\d)/g;

function redactMatches(text: string, re: RegExp): string {
  // Match on Latin digits so "٨٨٠٤١٢٣٤٥" is caught (same length: one digit per character), but keep the original
  // text wherever nothing is redacted.
  const latin = toLatinDigits(text);
  let out = '';
  let last = 0;
  for (const m of [...latin.matchAll(re)]) {
    out += text.slice(last, m.index) + REDACTED;
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

export function redactPii(text: string): string {
  return redactMatches(text, PII);
}

/** True when the text still contains something redactPii would remove. */
export function containsPii(text: string): boolean {
  return redactPii(text) !== text;
}

/**
 * For free text a customer types into a form (claim description, location, police report): redactPii() plus 8-digit
 * Bahrain phone numbers. The assistant does not use the phone rule: its replies carry amounts and short references.
 */
export function redactFreeText(text: string): string {
  return redactMatches(redactPii(text), PHONE);
}

/** Most characters of a plate ever shown, and the most as a share of its length (40%). */
export const PLATE_MAX_VISIBLE = 2;
export const PLATE_MAX_VISIBLE_SHARE = 0.4;

/**
 * Masks a plate, showing only its last characters: never more than 2, and never more than 40% of its length (rounded
 * down). "123456" → "****56", "12345" → "***45", "1234" → "***4", "123" → "**3", and plates of 1 or 2 characters
 * are fully masked ("**", "*").
 */
export function maskPlate(plate: string): string {
  const visible = Math.min(PLATE_MAX_VISIBLE, Math.floor(plate.length * PLATE_MAX_VISIBLE_SHARE));
  return '*'.repeat(plate.length - visible) + (visible > 0 ? plate.slice(-visible) : '');
}

/** Unambiguous upper-case letters and digits (no 0/O, 1/I/L). */
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * A random reference of `length` characters from ID_ALPHABET (crypto random, no counters), so ids built from a
 * process-wide counter cannot reveal how many replies or hand-offs the service handled for other customers.
 */
export function randomReference(length: number): string {
  const bytes = new Uint8Array(length);
  (globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }).crypto.getRandomValues(bytes);
  // 256 is not a multiple of the alphabet size, so some characters are very slightly likelier: fine for a reference.
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}
