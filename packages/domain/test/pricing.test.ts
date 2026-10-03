import { describe, expect, it } from 'vitest';
import {
  amortizedPayment,
  bhd,
  compareStructures,
  formatBhd,
  impliedApr,
  presentValue,
  quoteFinance,
  QuoteError,
} from '../src';

describe('money', () => {
  it('converts BHD to integer fils', () => {
    expect(bhd(1.234)).toBe(1234);
    expect(bhd(0.1 + 0.2)).toBe(300);
  });
  it('formats in English and Arabic', () => {
    expect(formatBhd(1_234_500)).toBe('BHD 1,234.500');
    expect(formatBhd(1_234_500, 'en', { decimals: 0 })).toBe('BHD 1,235');
    expect(formatBhd(1_000, 'ar')).toContain('د.ب.');
  });
});

describe('amortizedPayment', () => {
  it('matches the annuity formula, rounded up to the fils (BHD 10,000 at 6% over 60 months = 193.32802 → 193.329)', () => {
    expect(amortizedPayment(bhd(10_000), 6, 60)).toBe(193_329);
  });
  it('handles zero rate', () => {
    expect(amortizedPayment(bhd(1_200), 0, 12)).toBe(bhd(100));
  });
  it('round-trips with presentValue', () => {
    const pmt = amortizedPayment(bhd(25_000), 6.5, 84);
    expect(Math.abs(presentValue(pmt, 6.5, 84) - bhd(25_000))).toBeLessThan(100);
  });
});

describe('quoteFinance', () => {
  const base = { productLine: 'vehicle' as const, assetPriceFils: bhd(12_500), downPaymentFils: bhd(2_500), tenureMonths: 60 };

  it('conventional: totals are consistent', () => {
    const q = quoteFinance({ ...base, structure: 'conventional', ratePct: 6 });
    expect(q.financedFils).toBe(bhd(10_000));
    expect(q.monthlyFils).toBe(193_329);
    expect(q.totalPayableFils).toBe(193_329 * 60);
    expect(q.costOfFinanceFils).toBe(q.totalPayableFils - q.financedFils);
    expect(q.rateBasis).toBe('apr');
    expect(q.aprPct).toBeCloseTo(6, 1);
  });

  it('murabaha: sale price = cost + flat profit, final installment absorbs rounding', () => {
    const q = quoteFinance({ ...base, structure: 'murabaha', ratePct: 3.5 });
    expect(q.costOfFinanceFils).toBe(bhd(1_750)); // 10,000 × 3.5% × 5 years
    expect(q.salePriceFils).toBe(bhd(11_750));
    expect(q.monthlyFils).toBe(195_834);
    expect(q.finalInstallmentFils).toBe(bhd(11_750) - 195_834 * 59);
    expect(q.monthlyFils * 59 + q.finalInstallmentFils).toBe(q.totalPayableFils);
    expect(q.rateBasis).toBe('flat');
    // A 3.5% flat rate over 5 years is roughly a 6.5% APR
    expect(q.aprPct).toBeGreaterThan(6.3);
    expect(q.aprPct).toBeLessThan(6.7);
  });

  it('ijara: rental priced on profit rate for home finance', () => {
    const q = quoteFinance({ productLine: 'home', structure: 'ijara', assetPriceFils: bhd(150_000), downPaymentFils: bhd(30_000), tenureMonths: 240 });
    expect(q.rateBasis).toBe('profit');
    expect(q.financedFils).toBe(bhd(120_000));
    expect(q.monthlyFils).toBe(amortizedPayment(bhd(120_000), 6, 240));
  });

  it('rejects structures not offered for a product line', () => {
    expect(() => quoteFinance({ ...base, structure: 'ijara' })).toThrowError(QuoteError);
  });

  it('enforces tenure and down-payment rules', () => {
    expect(() => quoteFinance({ ...base, structure: 'conventional', tenureMonths: 120 })).toThrow(/tenure/);
    expect(() => quoteFinance({ ...base, structure: 'conventional', downPaymentFils: bhd(500) })).toThrow(/at least/);
    expect(() => quoteFinance({ ...base, structure: 'conventional', downPaymentFils: bhd(12_500) })).toThrow(/less than/);
    expect(() => quoteFinance({ ...base, structure: 'conventional', assetPriceFils: 10.5 })).toThrow(/integer/);
  });

  it('rejects amounts outside the safe integer range (e.g. 1e300 from the API)', () => {
    expect(() => quoteFinance({ ...base, structure: 'conventional', assetPriceFils: 1e300, downPaymentFils: 1e299 })).toThrow(QuoteError);
    expect(() => quoteFinance({ ...base, structure: 'murabaha', assetPriceFils: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/integer/);
  });

  it('Murabaha never produces a zero or negative final installment', () => {
    const tiny = { productLine: 'personal' as const, structure: 'murabaha' as const, downPaymentFils: 0, tenureMonths: 12 };
    // BHD 0.001 over 12 months used to give a final installment of -10 fils.
    expect(() => quoteFinance({ ...tiny, assetPriceFils: 1 })).toThrow(QuoteError);
    expect(() => quoteFinance({ ...tiny, assetPriceFils: 51, tenureMonths: 60 })).toThrow(/too small/);
    for (const assetPriceFils of [bhd(500), bhd(3_333.333), bhd(50_000)]) {
      for (const tenureMonths of [6, 7, 13, 60]) {
        const q = quoteFinance({ ...tiny, assetPriceFils, tenureMonths });
        expect(q.finalInstallmentFils).toBeGreaterThan(0);
        expect(q.finalInstallmentFils).toBeLessThanOrEqual(q.monthlyFils);
        expect(q.monthlyFils * (tenureMonths - 1) + q.finalInstallmentFils).toBe(q.salePriceFils);
      }
    }
  });

  it('compareStructures returns one quote per offered structure', () => {
    const qs = compareStructures(base);
    expect(qs.map((q) => q.structure)).toEqual(['conventional', 'murabaha']);
  });
});

describe('impliedApr', () => {
  it('returns 0 when there is no cost of finance', () => {
    expect(impliedApr(bhd(1_200), bhd(100), 12)).toBe(0);
  });
});
