import { describe, expect, it } from 'vitest';
import { applyForCard, bhd, CardApplicationError, CARDS, maskPan, preApprove, SandboxCardIssuer } from '../src';

const NOW = new Date('2026-10-03T09:00:00Z');
const FATIMA = { monthlySalaryFils: bhd(1_400), existingObligationsFils: bhd(200) };

describe('applyForCard', () => {
  it('approves with the pre-approved card limit and issues an ACTIVE virtual card', () => {
    const r = applyForCard('imtiaz-world', FATIMA, { now: NOW, last4: '1234' });
    expect(r.decision).toBe('APPROVED');
    if (r.decision !== 'APPROVED') return;
    expect(r.limitFils).toBe(preApprove(FATIMA, NOW).cardLimitFils);
    expect(r.limitFils).toBeGreaterThan(0);
    const vc = r.virtualCard;
    expect(vc.status).toBe('ACTIVE');
    expect(vc.panMasked).toBe('5xxx xxxx xxxx 1234');
    expect(vc.last4).toBe('1234');
    expect(vc.expiry).toBe('10/29');
    expect(vc.wallet).toEqual({ applePay: true, googlePay: true, samsungPay: true, sandbox: true });
    expect(vc.limitFils).toBe(r.limitFils);
  });

  it('never returns a full PAN or CVV', () => {
    for (let i = 0; i < 20; i++) {
      const r = applyForCard('imtiaz-platinum', FATIMA, { now: NOW });
      const json = JSON.stringify(r);
      // A PAN is 13 to 19 digits, possibly grouped with spaces.
      expect(json).not.toMatch(/\d(?:[ -]?\d){12,18}/);
      expect(json.toLowerCase()).not.toContain('cvv');
      expect(json.toLowerCase()).not.toContain('cvc');
      if (r.decision === 'APPROVED') {
        expect(r.virtualCard.panMasked).toMatch(/^5xxx xxxx xxxx \d{4}$/);
        expect(r.virtualCard.panMasked.replace(/\D/g, '')).toHaveLength(5);
      }
    }
  });

  it('respects a lower requested limit but never exceeds the offer', () => {
    const offered = preApprove(FATIMA, NOW).cardLimitFils;
    const lower = applyForCard('imtiaz-world', FATIMA, { now: NOW, last4: '0001', requestedLimitFils: bhd(500) });
    expect(lower.decision === 'APPROVED' && lower.limitFils).toBe(bhd(500));
    const higher = applyForCard('imtiaz-world', FATIMA, { now: NOW, last4: '0001', requestedLimitFils: offered * 10 });
    expect(higher.decision === 'APPROVED' && higher.limitFils).toBe(offered);
  });

  it('declines below the card minimum salary', () => {
    expect(applyForCard('imtiaz-world-elite', FATIMA, { now: NOW })).toEqual({
      decision: 'DECLINED',
      cardId: 'imtiaz-world-elite',
      reason: 'BELOW_MIN_SALARY',
    });
  });

  it('declines a credit card without DBR headroom', () => {
    const stretched = { monthlySalaryFils: bhd(1_400), existingObligationsFils: bhd(800) };
    expect(applyForCard('imtiaz-platinum', stretched, { now: NOW })).toMatchObject({ decision: 'DECLINED', reason: 'NO_DBR_HEADROOM' });
  });

  it('approves prepaid without salary or headroom, with no credit limit', () => {
    const r = applyForCard('imtiaz-prepaid', { monthlySalaryFils: bhd(300), existingObligationsFils: bhd(300) }, { now: NOW, last4: '4321' });
    expect(r).toMatchObject({ decision: 'APPROVED', limitFils: 0 });
  });

  it('throws for an unknown card', () => {
    expect(() => applyForCard('nope', FATIMA)).toThrow(CardApplicationError);
  });

  it('approved limits are integer fils for every card', () => {
    for (const c of CARDS) {
      const r = applyForCard(c.id, { monthlySalaryFils: bhd(3_000), existingObligationsFils: 0 }, { now: NOW });
      expect(r.decision).toBe('APPROVED');
      if (r.decision === 'APPROVED') expect(Number.isInteger(r.limitFils)).toBe(true);
    }
  });
});

describe('maskPan', () => {
  it('shows only the last 4 digits', () => {
    expect(maskPan('9876')).toBe('5xxx xxxx xxxx 9876');
    expect(() => maskPan('12345')).toThrow(CardApplicationError);
  });
});

describe('SandboxCardIssuer', () => {
  it('keeps issued cards and returns the same card on a repeat application', () => {
    const issuer = new SandboxCardIssuer();
    const a = issuer.apply('imtiaz-world', FATIMA, { now: NOW, last4: '1111' });
    const b = issuer.apply('imtiaz-world', FATIMA, { now: NOW, last4: '2222' });
    expect(a.decision === 'APPROVED' && b.decision === 'APPROVED' && b.virtualCard.id === a.virtualCard.id).toBe(true);
    issuer.apply('imtiaz-world-elite', FATIMA, { now: NOW });
    expect(issuer.list().map((c) => c.cardId)).toEqual(['imtiaz-world']);
  });
});
