/**
 * PII guard for the assistant (07-security-compliance §4, data minimization).
 *
 * - Replies are built from tool results that never carry the CPR or the salary, and replies never echo the
 *   customer's text. As a second line of defence every reply text, and every customer message before it is kept
 *   in the conversation memory, goes through redactPii().
 * - Long digit runs (a 9-digit CPR, a 16-digit card number, an IBAN's digits, phone numbers) and e-mail addresses
 *   are replaced. Amounts are formatted with thousands separators ("BHD 4,320.000"), so they are never 9+ digits
 *   in a row and stay readable. Arabic-Indic digits are checked too.
 *
 * The implementation is shared with claims (src/privacy.ts).
 */
export { REDACTED, redactPii, containsPii } from '../privacy';
