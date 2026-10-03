import { describe, expect, it } from 'vitest';
import {
  bhd,
  buildSchedule,
  CARDS,
  demoCustomer,
  maxMonthlyInstallment,
  motorQuotes,
  PROPERTIES,
  preApprove,
  quoteFinance,
  SandboxPaymentGateway,
  searchProperties,
  searchVehicles,
  transition,
  VEHICLES,
} from '../src';

describe('catalog integrity', () => {
  it('has unique ids and integer prices', () => {
    for (const list of [VEHICLES, PROPERTIES, CARDS]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const v of VEHICLES) expect(Number.isInteger(v.priceFils)).toBe(true);
  });
});

describe('searchVehicles', () => {
  it('filters by condition and body type and sorts by price', () => {
    const rows = searchVehicles(VEHICLES, { condition: 'new', bodyType: 'suv' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((v) => v.condition === 'new' && v.bodyType === 'suv')).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.priceFils).toBeGreaterThanOrEqual(rows[i - 1]!.priceFils);
  });
  it('filters by maximum monthly payment', () => {
    const rows = searchVehicles(VEHICLES, { maxMonthlyFils: bhd(150) });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((v) => v.fromMonthlyFils <= bhd(150))).toBe(true);
  });
  it('free-text search', () => {
    expect(searchVehicles(VEHICLES, { q: 'escalade' }).map((v) => v.model)).toEqual(['Escalade']);
  });
});

describe('searchProperties', () => {
  it('rentals show their rent as the monthly figure', () => {
    const rents = searchProperties(PROPERTIES, { purpose: 'rent' });
    expect(rents.every((p) => p.fromMonthlyFils === p.priceFils)).toBe(true);
  });
  it('searches Arabic area names', () => {
    expect(searchProperties(PROPERTIES, { q: 'سار' }).length).toBe(1);
  });
});

describe('affordability', () => {
  it('applies the DBR cap', () => {
    expect(maxMonthlyInstallment({ monthlySalaryFils: bhd(1_000), existingObligationsFils: bhd(200) })).toBe(bhd(300));
    expect(maxMonthlyInstallment({ monthlySalaryFils: bhd(1_000), existingObligationsFils: bhd(900) })).toBe(0);
  });
  it('pre-approves larger amounts for longer tenures', () => {
    const p = preApprove({ monthlySalaryFils: bhd(1_500), existingObligationsFils: bhd(100) });
    const byLine = Object.fromEntries(p.limits.map((l) => [l.productLine, l.maxFinanceFils]));
    expect(byLine.home!).toBeGreaterThan(byLine.vehicle!);
    expect(byLine.vehicle!).toBeGreaterThan(byLine.personal!);
    expect(p.cardLimitFils).toBe(bhd(3_000));
  });
});

describe('insurance', () => {
  it('sorts quotes by premium and honors takaful-only', () => {
    const qs = motorQuotes({ vehicleValueFils: bhd(14_900), cover: 'comprehensive', takafulOnly: true });
    expect(qs.length).toBe(2);
    expect(qs.every((q) => q.takaful)).toBe(true);
    expect(qs[0]!.annualPremiumFils).toBeLessThanOrEqual(qs[1]!.annualPremiumFils);
  });
  it('applies the minimum premium', () => {
    const qs = motorQuotes({ vehicleValueFils: bhd(3_000), cover: 'comprehensive' });
    expect(qs.every((q) => q.annualPremiumFils >= bhd(150))).toBe(true);
  });
});

describe('account', () => {
  it('builds a schedule whose sum equals total payable', () => {
    const q = quoteFinance({ productLine: 'vehicle', structure: 'murabaha', assetPriceFils: bhd(10_000), downPaymentFils: bhd(1_000), tenureMonths: 48 });
    const s = buildSchedule(q, new Date('2026-01-31'), 0, new Date('2026-01-31'));
    expect(s).toHaveLength(48);
    expect(s.reduce((a, i) => a + i.amountFils, 0)).toBe(q.totalPayableFils);
    expect(s[0]!.dueDate).toBe('2026-02-28'); // month-end clamping
    expect(s[0]!.status).toBe('due');
  });
  it('demo customer has a next installment due soon', () => {
    const today = new Date('2026-10-03');
    const c = demoCustomer(today);
    expect(c.contracts).toHaveLength(2);
    const next = c.contracts[0]!.nextInstallment!;
    expect(next.status).toBe('due');
    expect(next.dueDate >= '2026-10-03').toBe(true);
  });
});

describe('payments', () => {
  it('enforces the state machine', () => {
    expect(transition('INITIATED', 'authorize')).toBe('AUTHORIZED');
    expect(transition('AUTHORIZED', 'capture')).toBe('CAPTURED');
    expect(() => transition('CAPTURED', 'void')).toThrow();
  });
  it('sandbox gateway is idempotent and confirms', async () => {
    const gw = new SandboxPaymentGateway();
    const req = { amountFils: bhd(100), method: 'benefitpay' as const, purpose: 'reservation_deposit' as const, reference: 'v-honda-city-2026', idempotencyKey: 'abc12345' };
    const a = await gw.createCharge(req);
    const b = await gw.createCharge(req);
    expect(a.id).toBe(b.id);
    expect(a.nextAction).toBe('benefitpay_qr');
    expect((await gw.confirm(a.id)).status).toBe('CAPTURED');
    await expect(gw.createCharge({ ...req, amountFils: 0, idempotencyKey: 'zzz99999' })).rejects.toThrow();
  });
});
