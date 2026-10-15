/**
 * JSON-LD (schema.org) helpers. Pure, so they are unit-tested (lib/json-ld.test.ts).
 *
 * JSON-LD goes into a <script type="application/ld+json"> through dangerouslySetInnerHTML, so the serialized JSON
 * must never be able to close the script element or open a comment. `JSON.stringify` does not escape `<`, so a
 * value like `</script><script>alert(1)</script>` (a dealer name, a listing title) would break out. jsonLdString
 * escapes `<`, `>` and `&` as unicode escapes (still valid JSON, same parsed value) and the two line separators
 * (U+2028, U+2029) that are valid in JSON but were line terminators in older JavaScript.
 *
 * ⚠️ Structured data is public: never put personal or session data (names, balances, pre-approval, ids of a
 * customer) into it. Only catalog facts.
 */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const UNSAFE = new RegExp(`[<>&${LS}${PS}]`, 'g');

const unicodeEscape = (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;

export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, unicodeEscape);
}
