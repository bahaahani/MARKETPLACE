import { describe, expect, it } from 'vitest';
import {
  bhd,
  buildPreApproval,
  CONSENT_VALIDITY_DAYS,
  grantConsent,
  isValidCpr,
  maskCpr,
  missingConsentScopes,
  OnboardingError,
  parseBhdInput,
  preApprove,
  simulateEKeyLogin,
  validateEmployment,
} from '../src';

const NOW = new Date('2026-10-03T09:00:00Z');
const DAY = 24 * 3600 * 1000;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof OnboardingError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('CPR', () => {
  it('accepts exactly 9 digits', () => {
    expect(isValidCpr('880412345')).toBe(true);
    expect(isValidCpr('88041234')).toBe(false);
    expect(isValidCpr('8804123456')).toBe(false);
    expect(isValidCpr('88041234a')).toBe(false);
    expect(isValidCpr(' 880412345')).toBe(false);
  });
  it('masks all but the last 3 digits', () => {
    expect(maskCpr('880412345')).toBe('******345');
    expect(codeOf(() => maskCpr('123'))).toBe('INVALID_CPR');
  });
});

describe('simulateEKeyLogin (sandbox)', () => {
  it('returns a verified identity with a masked CPR and never the full CPR', () => {
    const id = simulateEKeyLogin('880412345', NOW);
    expect(id.provider).toBe('ekey-sandbox');
    expect(id.verified).toBe(true);
    expect(id.cprMasked).toBe('******345');
    expect(id.name.en).toBeTruthy();
    expect(id.name.ar).toBeTruthy();
    expect(id.nationality.en).toBeTruthy();
    expect(id.verifiedAt).toBe(NOW.toISOString());
    expect(JSON.stringify(id)).not.toContain('880412345');
  });
  it('is deterministic per CPR', () => {
    expect(simulateEKeyLogin('900101234', NOW)).toEqual(simulateEKeyLogin('900101234', NOW));
  });
  it('rejects an invalid CPR', () => {
    expect(codeOf(() => simulateEKeyLogin('12345', NOW))).toBe('INVALID_CPR');
  });
});

describe('employment validation', () => {
  it('requires a positive integer salary in fils', () => {
    expect(codeOf(() => validateEmployment({ monthlySalaryFils: 0, existingObligationsFils: 0 }))).toBe('INVALID_SALARY');
    expect(codeOf(() => validateEmployment({ monthlySalaryFils: -5, existingObligationsFils: 0 }))).toBe('INVALID_SALARY');
    expect(codeOf(() => validateEmployment({ monthlySalaryFils: 1000.5, existingObligationsFils: 0 }))).toBe('INVALID_SALARY');
    expect(codeOf(() => validateEmployment({ monthlySalaryFils: bhd(1_000), existingObligationsFils: 0 }))).toBeUndefined();
  });
  it('requires obligations of 0 or more', () => {
    expect(codeOf(() => validateEmployment({ monthlySalaryFils: bhd(1_000), existingObligationsFils: -1 }))).toBe('INVALID_OBLIGATIONS');
    expect(codeOf(() => validateEmployment({ monthlySalaryFils: bhd(1_000), existingObligationsFils: 0.5 }))).toBe('INVALID_OBLIGATIONS');
  });
  it('rejects amounts outside the safe integer range', () => {
    expect(codeOf(() => validateEmployment({ monthlySalaryFils: 1e300, existingObligationsFils: 0 }))).toBe('INVALID_SALARY');
    expect(codeOf(() => validateEmployment({ monthlySalaryFils: bhd(1_000), existingObligationsFils: 2 ** 60 }))).toBe('INVALID_OBLIGATIONS');
  });
});

describe('parseBhdInput', () => {
  it('parses BHD text into integer fils without floats', () => {
    expect(parseBhdInput('1400')).toBe(1_400_000);
    expect(parseBhdInput('1,400.5')).toBe(1_400_500);
    expect(parseBhdInput('0.105')).toBe(105);
    expect(parseBhdInput(' 250.25 ')).toBe(250_250);
  });
  it('rejects junk, negatives and more than 3 decimals', () => {
    expect(parseBhdInput('')).toBeUndefined();
    expect(parseBhdInput('-1')).toBeUndefined();
    expect(parseBhdInput('1.2345')).toBeUndefined();
    expect(parseBhdInput('abc')).toBeUndefined();
  });
});

describe('consent', () => {
  it(`is valid for ${CONSENT_VALIDITY_DAYS} days and records the timestamp`, () => {
    const c = grantConsent(['CRB', 'OPEN_BANKING'], NOW);
    expect(c.scopes).toEqual(['CRB', 'OPEN_BANKING']);
    expect(c.grantedAt).toBe(NOW.toISOString());
    expect(new Date(c.expiresAt).getTime() - NOW.getTime()).toBe(90 * DAY);
  });
  it('ignores unknown scopes and reports what is missing', () => {
    const c = grantConsent(['CRB', 'MARKETING'], NOW);
    expect(c.scopes).toEqual(['CRB']);
    expect(missingConsentScopes(c, NOW)).toEqual(['OPEN_BANKING']);
    expect(missingConsentScopes(undefined, NOW)).toEqual(['CRB', 'OPEN_BANKING']);
  });
  it('an expired consent counts as missing', () => {
    const c = grantConsent(['CRB', 'OPEN_BANKING'], NOW);
    expect(missingConsentScopes(c, new Date(NOW.getTime() + 89 * DAY))).toEqual([]);
    expect(missingConsentScopes(c, new Date(NOW.getTime() + 91 * DAY))).toEqual(['CRB', 'OPEN_BANKING']);
  });
});

describe('buildPreApproval', () => {
  const employment = { monthlySalaryFils: bhd(1_400), existingObligationsFils: bhd(300), employer: '  Bahrain Co. ' };
  const consent = grantConsent(['CRB', 'OPEN_BANKING'], NOW);

  it('matches preApprove() for the same financials', () => {
    const r = buildPreApproval(employment, consent, NOW);
    expect(r.preApproval).toEqual(preApprove({ monthlySalaryFils: bhd(1_400), existingObligationsFils: bhd(300) }, NOW));
    expect(r.preApproval.limits.map((l) => l.productLine)).toEqual(['vehicle', 'personal', 'home']);
    expect(r.preApproval.limits.every((l) => Number.isInteger(l.maxFinanceFils))).toBe(true);
    expect(r.employer).toBe('Bahrain Co.');
    expect(r.consent).toBe(consent);
    expect(r.sandbox).toBe(true);
  });
  it('rejects missing consent', () => {
    expect(codeOf(() => buildPreApproval(employment, undefined, NOW))).toBe('CONSENT_REQUIRED');
    expect(codeOf(() => buildPreApproval(employment, grantConsent(['CRB'], NOW), NOW))).toBe('CONSENT_REQUIRED');
  });
  it('rejects expired consent', () => {
    expect(codeOf(() => buildPreApproval(employment, consent, new Date(NOW.getTime() + 100 * DAY)))).toBe('CONSENT_EXPIRED');
  });
  it('validates the salary before anything else', () => {
    expect(codeOf(() => buildPreApproval({ monthlySalaryFils: 0, existingObligationsFils: 0 }, consent, NOW))).toBe('INVALID_SALARY');
  });
  it('gives zero limits when obligations use up the DBR headroom', () => {
    const r = buildPreApproval({ monthlySalaryFils: bhd(1_000), existingObligationsFils: bhd(600) }, consent, NOW);
    expect(r.preApproval.maxMonthlyFils).toBe(0);
    expect(r.preApproval.cardLimitFils).toBe(0);
  });
});
