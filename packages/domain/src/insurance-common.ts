/**
 * Shared pieces of the non-motor insurance lines (travel, home) and policies.
 * ⚠️ Sandbox: Tasheelat Insurance acts as a broker; insurers, rates and rules are illustrative demo data.
 */

export type InsuranceLine = 'motor' | 'travel' | 'home' | 'medical' | 'life';

export const INSURANCE_LINES: InsuranceLine[] = ['motor', 'travel', 'home', 'medical', 'life'];

export type InsuranceQuoteErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_DATES'
  | 'TRIP_TOO_LONG'
  | 'INVALID_TRAVELLERS'
  | 'INVALID_SUM_INSURED'
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_NOT_INSURABLE'
  | 'INVALID_MEMBERS'
  | 'INVALID_AGE'
  | 'INVALID_SUM_ASSURED'
  | 'INVALID_TERM'
  | 'REFERRED_TO_INSURER';

/** Invalid quote input (HTTP 422). */
export class InsuranceQuoteError extends Error {
  constructor(
    public readonly code: InsuranceQuoteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InsuranceQuoteError';
  }
}

/** Bahrain is UTC+3 all year (no daylight saving). */
const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's calendar date in Bahrain, as YYYY-MM-DD. */
export function bahrainToday(now: Date = new Date()): string {
  return new Date(now.getTime() + BAHRAIN_OFFSET_MS).toISOString().slice(0, 10);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** `iso` plus `days` calendar days (may be negative). */
export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (0 when equal). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Last day of a one-year policy that starts on `start` (e.g. 2026-10-03 → 2027-10-02). */
export function oneYearEndIso(start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  const next = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
  // 29 Feb + 1 year rolls to 1 Mar, so the policy still ends on 28 Feb.
  return addDaysIso(next.toISOString().slice(0, 10), -1);
}

export function isSafeNonNegativeInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

/** Whole years of age on `today` (both YYYY-MM-DD, Bahrain dates) for someone born on `dateOfBirth`. */
export function ageOnIso(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Date of birth of someone who turns exactly `age` today (a starting point for forms). */
export function dateOfBirthForAge(age: number, today: string): string {
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  // 29 Feb minus whole years may not exist: use 28 Feb then, which still gives the same age today.
  const d = new Date(Date.UTC(ty - age, tm - 1, td));
  if (d.getUTCMonth() !== tm - 1) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
