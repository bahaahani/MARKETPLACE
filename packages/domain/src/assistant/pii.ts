import { toLatinDigits } from './normalize';

/**
 * PII guard for the assistant (07-security-compliance §4, data minimization).
 *
 * - Replies are built from tool results that never carry the CPR or the salary, and replies never echo the
 *   customer's text. As a second line of defence every reply text, and every customer message before it is kept
 *   in the conversation memory, goes through redactPii().
 * - Long digit runs (a 9-digit CPR, a 16-digit card number, an IBAN's digits, phone numbers) and e-mail addresses
 *   are replaced. Amounts are formatted with thousands separators ("BHD 4,320.000"), so they are never 9+ digits
 *   in a row and stay readable. Arabic-Indic digits are checked too.
 */
export const REDACTED = '[•••]';

const PII = new RegExp(
  [
    /(?<!\d)(?:\d[ -]?){8,}\d(?!\d)/.source, // CPR, card number, phone
    /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u.source, // e-mail
    /\b[A-Z]{2}\d{2}[A-Z]{4}[\dA-Z]{10,30}\b/.source, // IBAN
  ].join('|'),
  'giu',
);

export function redactPii(text: string): string {
  // Match on Latin digits so "٨٨٠٤١٢٣٤٥" is caught (same length: one digit per character), but keep the original
  // text wherever nothing is redacted.
  const latin = toLatinDigits(text);
  let out = '';
  let last = 0;
  for (const m of [...latin.matchAll(PII)]) {
    out += text.slice(last, m.index) + REDACTED;
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

/** True when the text still contains something redactPii would remove. */
export function containsPii(text: string): boolean {
  return redactPii(text) !== text;
}
