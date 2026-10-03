import { describe, expect, it } from 'vitest';
import {
  applyForCard,
  bhd,
  buildPreApproval,
  cardEligibility,
  CARDS,
  clientConfig,
  CONSENT_VALIDITY_DAYS,
  customerCardOffers,
  customerFinancials,
  customerOverview,
  demoCustomer,
  financeLimits,
  findCard,
  grantConsent,
  MIN_PERSONAL_FINANCE_FILS,
  newCustomerProfile,
  OriginationError,
  personalFinanceRange,
  PreApprovalTokenStore,
  preApprove,
  SandboxCardIssuer,
  SandboxOriginationService,
  SandboxPaymentGateway,
  simulateEKeyLogin,
  withIdentity,
  withOnboarding,
  type ApplicationRequest,
  type CustomerProfile,
} from '../src';

const NOW = new Date('2026-10-03T09:00:00Z');

function onboard(profile: CustomerProfile, monthlySalaryFils: number, existingObligationsFils: number): CustomerProfile {
  const employment = { monthlySalaryFils, existingObligationsFils };
  return withOnboarding(profile, employment, buildPreApproval(employment, grantConsent(['CRB', 'OPEN_BANKING'], NOW), NOW), NOW);
}

describe('customer profile (sandbox session)', () => {
  it('starts as the demo customer, under its own customer id', () => {
    const p = newCustomerProfile('cus_a');
    const me = customerOverview(p, NOW);
    const demo = demoCustomer(NOW);
    expect(me.customerId).toBe('cus_a');
    expect(me.onboarded).toBe(false);
    expect(me.preApproval).toEqual(demo.preApproval);
    expect(customerFinancials(p, NOW)).toEqual({ monthlySalaryFils: demo.monthlySalaryFils, existingObligationsFils: demo.existingObligationsFils });
  });

  it('after onboarding uses the customer\'s own name, financials and pre-approval', () => {
    const id = simulateEKeyLogin('880412345', NOW);
    const p = onboard(withIdentity(newCustomerProfile('cus_b'), id), bhd(900), bhd(100));
    const me = customerOverview(p, NOW);
    expect(me.onboarded).toBe(true);
    expect(me.name).toEqual(id.name);
    expect(me.cprMasked).toBe('******345');
    expect(me.monthlySalaryFils).toBe(bhd(900));
    expect(me.existingObligationsFils).toBe(bhd(100));
    expect(me.preApproval).toEqual(preApprove({ monthlySalaryFils: bhd(900), existingObligationsFils: bhd(100) }, NOW));
    expect(customerFinancials(p)).toEqual({ monthlySalaryFils: bhd(900), existingObligationsFils: bhd(100) });
    // Never keeps the full CPR or extra fields (e.g. employer text) in the financials.
    expect(JSON.stringify(p)).not.toContain('880412345');
  });

  it('card offers follow the customer: eligibility and reason match what card apply decides', () => {
    const rich = onboard(newCustomerProfile('cus_rich'), bhd(3_000), 0);
    const stretched = onboard(newCustomerProfile('cus_stretched'), bhd(1_400), bhd(800));
    for (const p of [rich, stretched, newCustomerProfile('cus_demo')]) {
      const f = customerFinancials(p, NOW);
      for (const offer of customerCardOffers(p, NOW)) {
        const decision = applyForCard(offer.id, f, { now: NOW, last4: '0000' });
        expect(offer.eligible, `${p.customerId} ${offer.id}`).toBe(decision.decision === 'APPROVED');
        if (decision.decision === 'DECLINED') expect(offer.ineligibleReason).toBe(decision.reason);
        else expect(offer.offeredLimitFils).toBe(decision.limitFils);
      }
    }
    expect(customerCardOffers(rich, NOW).find((c) => c.id === 'imtiaz-world-elite')?.eligible).toBe(true);
    const elite = customerCardOffers(stretched, NOW).find((c) => c.id === 'imtiaz-world')!;
    expect(elite).toMatchObject({ eligible: false, ineligibleReason: 'NO_DBR_HEADROOM', offeredLimitFils: 0 });
    expect(customerCardOffers(stretched, NOW)).toHaveLength(CARDS.length);
  });

  it('cardEligibility: prepaid needs neither salary nor headroom', () => {
    const prepaid = findCard('imtiaz-prepaid')!;
    expect(cardEligibility(prepaid, { monthlySalaryFils: bhd(300), existingObligationsFils: bhd(300) }, NOW)).toEqual({ eligible: true, offeredLimitFils: 0 });
  });
});

describe('product rules served to the apps', () => {
  it('finance limits carry the listing defaults and slider steps', () => {
    expect(financeLimits('vehicle', bhd(14_900))).toMatchObject({ downPaymentStepFils: bhd(100), tenureStepMonths: 12, defaultDownPaymentFils: bhd(3_000), defaultTenureMonths: 60 });
    // Land plot BHD 72,000: 20% is BHD 14,400; rounding to the BHD 1,000 step would go below the minimum.
    expect(financeLimits('home', bhd(72_000))).toMatchObject({ downPaymentStepFils: bhd(1_000), defaultDownPaymentFils: bhd(14_400), defaultTenureMonths: 240 });
    expect(financeLimits('personal', bhd(5_000))).toMatchObject({ tenureStepMonths: 6, defaultDownPaymentFils: 0, defaultTenureMonths: 48 });
  });

  it('personal finance range stops at the pre-approved limit, never below the minimum', () => {
    const demo = personalFinanceRange(demoCustomer(NOW).preApproval);
    expect(demo.minAmountFils).toBe(MIN_PERSONAL_FINANCE_FILS);
    expect(demo.maxAmountFils % demo.amountStepFils).toBe(0);
    expect(demo.maxAmountFils).toBeLessThanOrEqual(demo.preApprovedFils);
    expect(demo.defaultAmountFils).toBe(Math.min(bhd(5_000), demo.maxAmountFils));
    const none = personalFinanceRange(preApprove({ monthlySalaryFils: bhd(500), existingObligationsFils: bhd(400) }, NOW));
    expect(none).toMatchObject({ preApprovedFils: 0, maxAmountFils: MIN_PERSONAL_FINANCE_FILS, defaultAmountFils: MIN_PERSONAL_FINANCE_FILS });
  });

  it('client config: consent period, calculators and the customer\'s personal finance range', () => {
    const cfg = clientConfig(demoCustomer(NOW).preApproval);
    expect(cfg.consent).toEqual({ scopes: ['CRB', 'OPEN_BANKING'], validityDays: CONSENT_VALIDITY_DAYS });
    expect(cfg.finance.vehicle).toMatchObject({ defaultDownPaymentPct: 20, defaultTenureMonths: 60, downPaymentStepFils: bhd(100), tenureStepMonths: 12 });
    expect(cfg.finance.home).toMatchObject({ defaultTenureMonths: 240, downPaymentStepFils: bhd(1_000) });
    expect(cfg.finance.personal).toMatchObject({ defaultTenureMonths: 48, tenureStepMonths: 6, minTenureMonths: 6, maxTenureMonths: 60 });
    expect(cfg.personalFinance).toEqual(personalFinanceRange(demoCustomer(NOW).preApproval));
    expect(cfg.reservationDepositFils).toBe(bhd(100));
  });
});

describe('per-customer isolation of sandbox stores', () => {
  const f = { monthlySalaryFils: bhd(1_400), existingObligationsFils: bhd(200) };

  it('cards: each customer only sees their own', () => {
    const issuer = new SandboxCardIssuer();
    const a = issuer.apply('cus_a', 'imtiaz-world', f, { now: NOW, last4: '1111' });
    expect(a.decision).toBe('APPROVED');
    expect(issuer.list('cus_b')).toEqual([]);
    const id = a.decision === 'APPROVED' ? a.virtualCard.id : '';
    expect(issuer.get('cus_a', id)?.last4).toBe('1111');
    expect(issuer.get('cus_b', id)).toBeUndefined();
    // B applying for the same product gets its own card, not A's.
    const b = issuer.apply('cus_b', 'imtiaz-world', f, { now: NOW, last4: '2222', id: 'vc_b' });
    expect(b.decision === 'APPROVED' && b.virtualCard.last4).toBe('2222');
    expect(issuer.list('cus_a').map((c) => c.last4)).toEqual(['1111']);
  });

  it('applications: ids and idempotency keys are scoped to the customer', () => {
    const svc = new SandboxOriginationService();
    const req: ApplicationRequest = {
      productLine: 'vehicle',
      structure: 'murabaha',
      assetPriceFils: bhd(14_900),
      downPaymentFils: bhd(3_000),
      tenureMonths: 60,
      reference: 'v-honda-crv-2026',
      idempotencyKey: 'same-key-0001',
    };
    const a = svc.apply(req, f, 'cus_a');
    const b = svc.apply(req, f, 'cus_b');
    expect(b.id).not.toBe(a.id);
    expect(svc.apply(req, f, 'cus_a').id).toBe(a.id);
    expect(svc.get(a.id, 'cus_a')?.id).toBe(a.id);
    expect(svc.get(a.id, 'cus_b')).toBeUndefined();
    expect(svc.list('cus_b').map((x) => x.id)).toEqual([b.id]);
    expect(() => svc.accept(a.id, 'cus_b')).toThrow(OriginationError);
    expect(svc.get(a.id)?.status).toBe('APPROVED');
    expect(svc.accept(a.id, 'cus_a').status).toBe('COMPLETED');
  });

  it('payments: idempotency keys and confirmation are scoped to the owner', async () => {
    const gw = new SandboxPaymentGateway();
    const req = { amountFils: 100_000, method: 'card' as const, purpose: 'installment' as const, reference: 'c-1001-15', idempotencyKey: 'pay-key-0001' };
    const a = await gw.createCharge(req, 'cus_a');
    const b = await gw.createCharge(req, 'cus_b');
    expect(b.id).not.toBe(a.id);
    expect((await gw.createCharge(req, 'cus_a')).id).toBe(a.id);
    await expect(gw.confirm(a.id, 'cus_b')).rejects.toThrow(/unknown payment/);
    expect((await gw.confirm(a.id, 'cus_a')).status).toBe('CAPTURED');
  });

  it('pre-approval share tokens carry the issuing customer\'s own limits', () => {
    const store = new PreApprovalTokenStore();
    const demo = customerOverview(newCustomerProfile('cus_demo'), NOW);
    const own = customerOverview(onboard(withIdentity(newCustomerProfile('cus_own'), simulateEKeyLogin('880412345', NOW)), bhd(3_000), 0), NOW);
    const t1 = store.issue(demo, NOW);
    const t2 = store.issue(own, NOW);
    const vehicle = (c: typeof demo) => c.preApproval.limits.find((l) => l.productLine === 'vehicle')!.maxFinanceFils;
    expect(store.redeem(t1.token, NOW).vehicleLimitFils).toBe(vehicle(demo));
    expect(store.redeem(t2.token, NOW)).toMatchObject({ vehicleLimitFils: vehicle(own), maxMonthlyFils: own.preApproval.maxMonthlyFils, firstName: { en: own.name.en.split(' ')[0] } });
    expect(vehicle(own)).not.toBe(vehicle(demo));
  });
});
