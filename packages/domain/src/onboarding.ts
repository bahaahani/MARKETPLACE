import type { Fils } from './money';
import { FILS_PER_BHD } from './money';
import { preApprove, type CustomerFinancials, type PreApproval } from './affordability';
import type { Localized } from './types';

/**
 * Onboarding (journey J1): eKey identity → employment and salary → consent → live pre-approval.
 *
 * ⚠️ SANDBOX. Nothing here calls the real eKey 2.0 (iGA), the Credit Reference Bureau or any
 * Open Banking provider. The identity is simulated from the CPR number, and the obligations
 * figure is what the customer declares. Production replaces these with the eKey OIDC flow,
 * a CRB pull and an Open Banking (AISP) salary check, all under the consent recorded here.
 */

export type ConsentScope = 'CRB' | 'OPEN_BANKING';

export const CONSENT_SCOPES: ConsentScope[] = ['CRB', 'OPEN_BANKING'];

/** Consents are time-limited (plain-language promise on the consent screen). ⚠️ VERIFY with CBB Open Banking rules. */
export const CONSENT_VALIDITY_DAYS = 90;

export type OnboardingErrorCode =
  | 'INVALID_CPR'
  | 'INVALID_SALARY'
  | 'INVALID_OBLIGATIONS'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_EXPIRED';

export class OnboardingError extends Error {
  constructor(
    public readonly code: OnboardingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OnboardingError';
  }
}

// ---- Identity (eKey, simulated)

/** A CPR (Central Population Register) number is 9 digits. */
export function isValidCpr(cpr: string): boolean {
  return /^\d{9}$/.test(cpr);
}

/** Shows only the last 3 digits ("******789"). The full CPR is never returned by the API. */
export function maskCpr(cpr: string): string {
  if (!isValidCpr(cpr)) throw new OnboardingError('INVALID_CPR', 'CPR must be exactly 9 digits');
  return `${'*'.repeat(6)}${cpr.slice(-3)}`;
}

export interface EKeyIdentity {
  /** ⚠️ Sandbox marker: always 'ekey-sandbox' until the real iGA integration exists. */
  provider: 'ekey-sandbox';
  verified: true;
  name: Localized;
  cprMasked: string;
  nationality: Localized;
  verifiedAt: string;
}

// Fictional demo people. ⚠️ Sandbox only: real eKey returns the verified civil-registry record.
const DEMO_NAMES: Localized[] = [
  { en: 'Fatima Ahmed', ar: 'فاطمة أحمد' },
  { en: 'Ali Hasan', ar: 'علي حسن' },
  { en: 'Maryam Yusuf', ar: 'مريم يوسف' },
  { en: 'Khalid Ebrahim', ar: 'خالد إبراهيم' },
  { en: 'Noora Abdulla', ar: 'نورة عبدالله' },
];
const DEMO_NATIONALITIES: Localized[] = [
  { en: 'Bahraini', ar: 'بحريني' },
  { en: 'Bahraini', ar: 'بحريني' },
  { en: 'Saudi', ar: 'سعودي' },
  { en: 'Indian', ar: 'هندي' },
];

/**
 * ⚠️ SANDBOX: simulates "Log in with eKey". Any valid 9-digit CPR returns a verified, fictional
 * identity, chosen deterministically from the digits so the same CPR always gives the same person.
 */
export function simulateEKeyLogin(cpr: string, now: Date = new Date()): EKeyIdentity {
  const cprMasked = maskCpr(cpr);
  const digitSum = [...cpr].reduce((s, d) => s + Number(d), 0);
  return {
    provider: 'ekey-sandbox',
    verified: true,
    name: DEMO_NAMES[digitSum % DEMO_NAMES.length]!,
    cprMasked,
    nationality: DEMO_NATIONALITIES[Number(cpr[8]) % DEMO_NATIONALITIES.length]!,
    verifiedAt: now.toISOString(),
  };
}

// ---- Employment and salary

export interface EmploymentInput extends CustomerFinancials {
  employer?: string;
}

export function validateEmployment(e: EmploymentInput): void {
  if (!Number.isSafeInteger(e.monthlySalaryFils) || e.monthlySalaryFils <= 0) {
    throw new OnboardingError('INVALID_SALARY', 'monthlySalaryFils must be a positive integer (fils)');
  }
  if (!Number.isSafeInteger(e.existingObligationsFils) || e.existingObligationsFils < 0) {
    throw new OnboardingError('INVALID_OBLIGATIONS', 'existingObligationsFils must be an integer of 0 or more (fils)');
  }
}

/**
 * Parses what a customer types in a BHD amount field ("1400", "1,400.5") into fils, without floats.
 * Returns undefined for anything that is not a non-negative amount with at most 3 decimals.
 */
export function parseBhdInput(text: string): Fils | undefined {
  const m = /^(\d+)(?:\.(\d{1,3}))?$/.exec(text.trim().replace(/,/g, ''));
  if (!m) return undefined;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(3, '0'));
  const fils = whole * FILS_PER_BHD + frac;
  return Number.isSafeInteger(fils) ? fils : undefined;
}

// ---- Consent

export interface ConsentRecord {
  scopes: ConsentScope[];
  grantedAt: string;
  expiresAt: string;
}

/** Records the customer's consent now, valid for CONSENT_VALIDITY_DAYS. Unknown scopes are ignored. */
export function grantConsent(scopes: readonly string[], now: Date = new Date()): ConsentRecord {
  const granted = CONSENT_SCOPES.filter((s) => scopes.includes(s));
  return {
    scopes: granted,
    grantedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CONSENT_VALIDITY_DAYS * 24 * 3600 * 1000).toISOString(),
  };
}

/** Scopes the pre-approval still needs: everything not granted, or everything when the consent has expired. */
export function missingConsentScopes(consent: ConsentRecord | undefined, now: Date = new Date()): ConsentScope[] {
  if (!consent || new Date(consent.expiresAt) <= now) return [...CONSENT_SCOPES];
  return CONSENT_SCOPES.filter((s) => !consent.scopes.includes(s));
}

// ---- Pre-approval

export interface OnboardingPreApproval {
  preApproval: PreApproval;
  consent: ConsentRecord;
  employer?: string;
  /** Always true in the prototype: no real CRB / Open Banking data was used. */
  sandbox: true;
}

/**
 * Live pre-approval at the end of onboarding. Requires a valid CRB + Open Banking consent,
 * then reuses preApprove() so the limits match the rest of the app.
 * ⚠️ SANDBOX: obligations are self-declared; production pulls them from the CRB under this consent.
 */
export function buildPreApproval(
  employment: EmploymentInput,
  consent: ConsentRecord | undefined,
  now: Date = new Date(),
): OnboardingPreApproval {
  validateEmployment(employment);
  const missing = missingConsentScopes(consent, now);
  if (consent && missing.length && new Date(consent.expiresAt) <= now) {
    throw new OnboardingError('CONSENT_EXPIRED', 'consent has expired; ask the customer again');
  }
  if (!consent || missing.length) {
    throw new OnboardingError('CONSENT_REQUIRED', `consent required for: ${missing.join(', ')}`);
  }
  const { monthlySalaryFils, existingObligationsFils } = employment;
  const employer = employment.employer?.trim() || undefined;
  return {
    preApproval: preApprove({ monthlySalaryFils, existingObligationsFils }, now),
    consent,
    ...(employer ? { employer } : {}),
    sandbox: true,
  };
}
