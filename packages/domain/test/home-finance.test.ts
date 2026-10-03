import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  applicationView,
  ApplicationTransitionError,
  assertServerAmount,
  AuditLog,
  backOfficeKpis,
  assertTransition,
  bhd,
  buildLifeEventBundle,
  cardOffers,
  customerCardOffers,
  customerFinancials,
  customerOverview,
  decide,
  demoCustomer,
  findContract,
  findProperty,
  findValuationPayment,
  fulfilmentPath,
  homeApplicationRequest,
  IJARA_STEPS,
  maxMonthlyInstallment,
  newCustomerProfile,
  OriginationError,
  PaymentAmountError,
  preApprove,
  refundOrphanPremium,
  refundQueue,
  RESERVATION_DEPOSIT_FILS,
  SANDBOX_STAFF,
  SandboxContractSettings,
  SandboxOriginationService,
  SandboxPaymentGateway,
  serverPaymentPrice,
  settlementQuote,
  VALUATION_FEE_FILS,
  withOnboarding,
  withSettledContracts,
  type ApplicationRequest,
  type CustomerFinancials,
  type OriginationStructure,
} from '../src';

// Salary BHD 5,000 and no obligations: BHD 2,500 a month of headroom, a home limit well above BHD 98,000.
const wealthy: CustomerFinancials = { monthlySalaryFils: bhd(5_000), existingObligationsFils: 0 };

const amwaj = (structure: OriginationStructure, key = `key-amwaj-${structure}`): ApplicationRequest =>
  homeApplicationRequest({ structure, propertyId: 'p-amwaj-apt-2br', downPaymentFils: bhd(19_600), tenureMonths: 240, idempotencyKey: key });

function fixedClock() {
  let t = Date.UTC(2026, 9, 3, 9, 0, 0);
  return () => new Date((t += 1000));
}

const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error).name;
  }
  return undefined;
};

describe('home finance applications', () => {
  it('takes the price from the catalog and only offers conventional and Ijara', () => {
    const req = amwaj('ijara');
    expect(req).toMatchObject({ productLine: 'home', assetPriceFils: findProperty('p-amwaj-apt-2br')!.priceFils, reference: 'p-amwaj-apt-2br' });
    expect(code(() => homeApplicationRequest({ structure: 'ijara', propertyId: 'p-nope', tenureMonths: 240, idempotencyKey: 'key-nope-01' }))).toBe('NOT_FOUND');
    // For rent: no home finance.
    expect(code(() => homeApplicationRequest({ structure: 'ijara', propertyId: 'p-seef-apt-1br', tenureMonths: 240, idempotencyKey: 'key-rent-01' }))).toBe(
      'INVALID_REQUEST',
    );
    expect(code(() => homeApplicationRequest({ structure: 'ijara', propertyId: undefined, tenureMonths: 240, idempotencyKey: 'key-none-01' }))).toBe(
      'INVALID_REQUEST',
    );
    const svc = new SandboxOriginationService(fixedClock());
    expect(code(() => svc.apply({ ...amwaj('murabaha' as OriginationStructure), idempotencyKey: 'key-home-mur' }, wealthy, 'c'))).toBe('INVALID_REQUEST');
    // Vehicles do not offer Ijara (unchanged rule).
    const car: ApplicationRequest = { productLine: 'vehicle', structure: 'ijara', assetPriceFils: bhd(14_900), downPaymentFils: bhd(3_000), tenureMonths: 60, reference: 'v-honda-crv-2026', idempotencyKey: 'key-car-ijara' };
    expect(() => svc.apply(car, wealthy, 'c')).toThrow(OriginationError);
    // Home quote rules still apply (20% minimum down payment).
    expect(code(() => svc.apply({ ...amwaj('ijara'), downPaymentFils: 0, idempotencyKey: 'key-home-down0' }, wealthy, 'c'))).toBe('DOWN_PAYMENT_TOO_LOW');
  });

  it('decides against the customer DBR headroom and the HOME pre-approval limit', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const app = svc.apply(amwaj('ijara'), wealthy, 'cus-1');
    const homeLimit = preApprove(wealthy).limits.find((l) => l.productLine === 'home')!.maxFinanceFils;
    expect(app.decision).toMatchObject({ outcome: 'APPROVED', reasons: ['OK'], preApprovedLimitFils: homeLimit, maxMonthlyFils: maxMonthlyInstallment(wealthy) });
    // The demo customer's financials cannot carry a BHD 78,400 home: declined on DBR, above the home limit.
    const demo = customerFinancials(newCustomerProfile('cus-demo'));
    const declined = svc.apply({ ...amwaj('conventional'), idempotencyKey: 'key-demo-home' }, demo, 'cus-demo');
    expect(declined.decision!.outcome).toBe('DECLINED');
    expect(declined.decision!.reasons).toEqual(['DBR_EXCEEDED', 'AMOUNT_ABOVE_PREAPPROVAL']);
    expect(decide(declined, demo).preApprovedLimitFils).toBe(preApprove(demo).limits.find((l) => l.productLine === 'home')!.maxFinanceFils);
  });

  it('Ijara: BCFC buys, then leases; acceptance stops at LEASE_STARTED and ownership transfer stays a future step', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const { id } = svc.apply(amwaj('ijara'), wealthy, 'cus-1');
    const leased = svc.accept(id, 'cus-1');
    expect(leased.status).toBe('LEASE_STARTED');
    expect(leased.timeline.map((e) => e.status)).toEqual([
      'DRAFT',
      'SUBMITTED',
      'APPROVED',
      'OFFER_ACCEPTED',
      'CONTRACT_SIGNED',
      'ASSET_PURCHASED_BY_BCFC',
      'LEASE_STARTED',
    ]);
    const steps = applicationView(leased).steps;
    expect(steps.filter((s) => !s.done).map((s) => s.status)).toEqual(['OWNERSHIP_TRANSFERRED_TO_CUSTOMER', 'COMPLETED']);
    expect(steps.filter((s) => s.ijara).map((s) => s.status)).toEqual(IJARA_STEPS);
    expect(steps.some((s) => s.murabaha)).toBe(false);
    expect(applicationView(leased).nextAction).toBeUndefined();
    // Accepting again changes nothing: the transfer happens after the final rental.
    expect(svc.accept(id, 'cus-1')).toEqual(leased);
  });

  it('Ijara order is enforced: no lease before BCFC owns the home, no transfer before the lease', () => {
    expect(fulfilmentPath('home', 'ijara')).toEqual(['OFFER_ACCEPTED', 'CONTRACT_SIGNED', ...IJARA_STEPS, 'COMPLETED']);
    expect(() => assertTransition('ijara', 'CONTRACT_SIGNED', 'LEASE_STARTED', 'home')).toThrow(ApplicationTransitionError);
    expect(() => assertTransition('ijara', 'CONTRACT_SIGNED', 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER', 'home')).toThrow(ApplicationTransitionError);
    expect(() => assertTransition('ijara', 'ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER', 'home')).toThrow(ApplicationTransitionError);
    expect(() => assertTransition('ijara', 'LEASE_STARTED', 'COMPLETED', 'home')).toThrow(ApplicationTransitionError);
    expect(() => assertTransition('ijara', 'CONTRACT_SIGNED', 'DISBURSED', 'home')).toThrow(ApplicationTransitionError);
    const svc = new SandboxOriginationService(fixedClock());
    const { id } = svc.apply(amwaj('ijara'), wealthy, 'cus-1');
    svc.advance(id, 'OFFER_ACCEPTED');
    svc.advance(id, 'CONTRACT_SIGNED');
    expect(() => svc.advance(id, 'LEASE_STARTED')).toThrow(ApplicationTransitionError);
    svc.advance(id, 'ASSET_PURCHASED_BY_BCFC');
    svc.advance(id, 'LEASE_STARTED');
    expect(() => svc.advance(id, 'COMPLETED')).toThrow(ApplicationTransitionError);
    svc.advance(id, 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER');
    expect(svc.advance(id, 'COMPLETED').status).toBe('COMPLETED');
  });

  it('conventional: waits at CONTRACT_SIGNED for a captured valuation fee, then VALUATION_CONFIRMED → DISBURSED → COMPLETED', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const { id } = svc.apply(amwaj('conventional'), wealthy, 'cus-1');
    const signed = svc.accept(id, 'cus-1');
    expect(signed.status).toBe('CONTRACT_SIGNED');
    const view = applicationView(signed);
    expect(view.nextAction).toEqual({ type: 'PAY_VALUATION_FEE', purpose: 'valuation_fee', reference: 'p-amwaj-apt-2br', feePaid: false });
    // With the customer's captured fee as evidence, the apps show "Continue" instead of "Pay valuation fee".
    expect(applicationView(signed, { valuationPaymentId: 'pay_1' }).nextAction?.feePaid).toBe(true);
    expect(view.steps.filter((s) => !s.done).map((s) => s.status)).toEqual(['VALUATION_CONFIRMED', 'DISBURSED', 'COMPLETED']);
    // Neither skipping the valuation nor confirming it without a payment is possible.
    expect(() => svc.advance(id, 'DISBURSED')).toThrow(ApplicationTransitionError);
    expect(code(() => svc.advance(id, 'VALUATION_CONFIRMED'))).toBe('VALUATION_REQUIRED');
    expect(svc.accept(id, 'cus-1').status).toBe('CONTRACT_SIGNED');

    const done = svc.accept(id, 'cus-1', { valuationPaymentId: 'pay_1' });
    expect(done.status).toBe('COMPLETED');
    expect(done.valuationPaymentId).toBe('pay_1');
    expect(done.timeline.map((e) => e.status).slice(-5)).toEqual(['OFFER_ACCEPTED', 'CONTRACT_SIGNED', 'VALUATION_CONFIRMED', 'DISBURSED', 'COMPLETED']);
    expect(applicationView(done).nextAction).toBeUndefined();
  });

  it('a valuation paid before acceptance runs conventional home finance to the end', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const { id } = svc.apply(amwaj('conventional'), wealthy, 'cus-1');
    expect(svc.accept(id, 'cus-1', { valuationPaymentId: 'pay_1' }).status).toBe('COMPLETED');
  });

  it('vehicle and personal flows are unchanged', () => {
    expect(fulfilmentPath('vehicle', 'conventional')).toEqual(['OFFER_ACCEPTED', 'CONTRACT_SIGNED', 'DISBURSED', 'COMPLETED']);
    expect(allowedTransitions('conventional', 'CONTRACT_SIGNED', 'vehicle')).toEqual(['DISBURSED']);
    expect(allowedTransitions('conventional', 'CONTRACT_SIGNED', 'personal')).toEqual(['DISBURSED']);
    expect(allowedTransitions('conventional', 'CONTRACT_SIGNED', 'home')).toEqual(['VALUATION_CONFIRMED']);
    const svc = new SandboxOriginationService(fixedClock());
    const car: ApplicationRequest = { productLine: 'vehicle', structure: 'conventional', assetPriceFils: bhd(7_450), downPaymentFils: bhd(1_500), tenureMonths: 60, reference: 'v-honda-city-2026', idempotencyKey: 'key-city-01' };
    const app = svc.accept(svc.apply(car, wealthy, 'cus-1').id, 'cus-1');
    expect(app.status).toBe('COMPLETED');
    expect(applicationView(app).steps.every((s) => !s.ijara && !s.murabaha)).toBe(true);
    // A referred or declined application still cannot be accepted.
    const declined = svc.apply({ ...amwaj('ijara'), idempotencyKey: 'key-poor-home' }, { monthlySalaryFils: bhd(500), existingObligationsFils: 0 }, 'cus-2');
    expect(code(() => svc.accept(declined.id, 'cus-2'))).toBe('NOT_APPROVED');
  });
});

describe('server-side payment amounts (P1)', () => {
  it('the server prices reservation deposits and valuation fees from the catalog', () => {
    expect(serverPaymentPrice('reservation_deposit', 'v-honda-crv-2026')).toMatchObject({ amountFils: RESERVATION_DEPOSIT_FILS, currency: 'BHD' });
    expect(serverPaymentPrice('valuation_fee', 'p-saar-villa-4br').amountFils).toBe(VALUATION_FEE_FILS);
    expect(code(() => serverPaymentPrice('valuation_fee', 'p-seef-apt-1br'))).toBe('UNKNOWN_REFERENCE');
    expect(code(() => serverPaymentPrice('reservation_deposit', 'v-nope'))).toBe('UNKNOWN_REFERENCE');
    expect(code(() => serverPaymentPrice('insurance_premium', 'q-1'))).toBe('NOT_SERVER_PRICED');
    // GET /payments/price without a purpose is a bad request (400), not "not server priced".
    expect(code(() => serverPaymentPrice(null, 'p-saar-villa-4br'))).toBe('INVALID_REQUEST');
    expect(code(() => serverPaymentPrice('', 'p-saar-villa-4br'))).toBe('INVALID_REQUEST');
    expect(code(() => serverPaymentPrice('valuation_fee', ''))).toBe('INVALID_REQUEST');
  });

  it('any other amount is AMOUNT_MISMATCH; other purposes are not checked here', () => {
    expect(() => assertServerAmount({ purpose: 'valuation_fee', reference: 'p-saar-villa-4br', amountFils: VALUATION_FEE_FILS })).not.toThrow();
    expect(code(() => assertServerAmount({ purpose: 'valuation_fee', reference: 'p-saar-villa-4br', amountFils: 1 }))).toBe('AMOUNT_MISMATCH');
    expect(code(() => assertServerAmount({ purpose: 'reservation_deposit', reference: 'v-honda-crv-2026', amountFils: RESERVATION_DEPOSIT_FILS + 1 }))).toBe(
      'AMOUNT_MISMATCH',
    );
    expect(() => assertServerAmount({ purpose: 'installment', reference: 'c-1001-15', amountFils: 1 })).not.toThrow();
    expect(new PaymentAmountError('AMOUNT_MISMATCH', 'x').name).toBe('PaymentAmountError');
  });

  it('a valuation counts only when captured, for that property, at the server amount, in the customer’s own payments', async () => {
    const gw = new SandboxPaymentGateway();
    const fee = { amountFils: VALUATION_FEE_FILS, method: 'card' as const, purpose: 'valuation_fee' as const, reference: 'p-amwaj-apt-2br' };
    const pending = await gw.createCharge({ ...fee, idempotencyKey: 'val-key-001' }, 'cus-1');
    expect(findValuationPayment(gw.list('cus-1'), 'p-amwaj-apt-2br')).toBeUndefined();
    await gw.confirm(pending.id, 'cus-1');
    expect(findValuationPayment(gw.list('cus-1'), 'p-amwaj-apt-2br')?.id).toBe(pending.id);
    expect(findValuationPayment(gw.list('cus-1'), 'p-saar-villa-4br')).toBeUndefined();
    expect(findValuationPayment(gw.list('cus-2'), 'p-amwaj-apt-2br')).toBeUndefined();
    expect(findValuationPayment([{ ...pending, status: 'CAPTURED', amountFils: 1 }], 'p-amwaj-apt-2br')).toBeUndefined();
    // A refunded valuation fee is no longer evidence for VALUATION_CONFIRMED.
    await gw.refund(pending.id);
    expect(findValuationPayment(gw.list('cus-1'), 'p-amwaj-apt-2br')).toBeUndefined();
  });

  it('the back-office refund queue ignores captured valuation fees and deposits (only unbound premiums)', async () => {
    const gw = new SandboxPaymentGateway();
    const fee = await gw.createCharge(
      { amountFils: VALUATION_FEE_FILS, method: 'card', purpose: 'valuation_fee', reference: 'p-amwaj-apt-2br', idempotencyKey: 'val-key-002' },
      'cus-1',
    );
    await gw.confirm(fee.id, 'cus-1');
    const dep = await gw.createCharge(
      { amountFils: RESERVATION_DEPOSIT_FILS, method: 'card', purpose: 'reservation_deposit', reference: 'v-honda-crv-2026', idempotencyKey: 'dep-key-002' },
      'cus-1',
    );
    await gw.confirm(dep.id, 'cus-1');
    const ops = SANDBOX_STAFF.operations;
    expect(refundQueue(ops, gw.listAll(), () => false)).toEqual([]);
    expect(backOfficeKpis(ops, [], gw.listAll(), () => false).refundsPending).toBe(0);
    await expect(refundOrphanPremium(ops, gw, new AuditLog(), fee.id, () => false)).rejects.toMatchObject({ code: 'NOT_REFUNDABLE' });
    expect(findValuationPayment(gw.list('cus-1'), 'p-amwaj-apt-2br')?.id).toBe(fee.id);
  });
});

describe('settled contracts no longer count as obligations', () => {
  const TODAY = new Date(Date.UTC(2026, 9, 3, 9, 0, 0));
  const demo = demoCustomer(TODAY);
  const c1001 = findContract(demo, 'c-1001');

  it('obligations, pre-approval, card offers, bundles and decisions exclude a settled contract', () => {
    const before = newCustomerProfile('cus-1');
    const after = withSettledContracts(before, ['c-1001']);
    const f0 = customerFinancials(before, TODAY);
    const f1 = customerFinancials(after, TODAY);
    expect(f1.existingObligationsFils).toBe(f0.existingObligationsFils - c1001.quote.monthlyFils);
    expect(f1.monthlySalaryFils).toBe(f0.monthlySalaryFils);

    const o1 = customerOverview(after, TODAY);
    expect(o1.existingObligationsFils).toBe(f1.existingObligationsFils);
    expect(o1.preApproval).toEqual(preApprove(f1, TODAY));
    expect(o1.preApproval.maxMonthlyFils).toBe(customerOverview(before, TODAY).preApproval.maxMonthlyFils + c1001.quote.monthlyFils);

    expect(customerCardOffers(after, TODAY)).toEqual(cardOffers(f1, TODAY));
    expect(buildLifeEventBundle('married', 'islamic', f1, TODAY).maxMonthlyFils).toBe(maxMonthlyInstallment(f1));
    expect(buildLifeEventBundle('married', 'islamic', f1, TODAY).maxMonthlyFils).toBeGreaterThan(buildLifeEventBundle('married', 'islamic', f0, TODAY).maxMonthlyFils);

    // A thin-margin application referred before settling is approved once the headroom is freed.
    const svc = new SandboxOriginationService(fixedClock());
    const patrol: ApplicationRequest = { productLine: 'vehicle', structure: 'murabaha', assetPriceFils: bhd(19_500), downPaymentFils: bhd(3_900), tenureMonths: 60, reference: 'v-nissan-patrol-2021', idempotencyKey: 'key-patrol-1' };
    expect(svc.apply(patrol, f0, 'cus-1').decision!.outcome).toBe('REFERRED');
    expect(svc.apply({ ...patrol, idempotencyKey: 'key-patrol-2' }, f1, 'cus-1').decision!.outcome).toBe('APPROVED');
  });

  it('self-declared obligations (onboarding) are reduced by the settled installment, never below zero', () => {
    const onboarded = (obligations: number) =>
      withOnboarding(newCustomerProfile('cus-2'), { monthlySalaryFils: bhd(2_000), existingObligationsFils: obligations }, {
        preApproval: preApprove({ monthlySalaryFils: bhd(2_000), existingObligationsFils: obligations }, TODAY),
      } as never);
    expect(customerFinancials(withSettledContracts(onboarded(bhd(500)), ['c-1001']), TODAY).existingObligationsFils).toBe(bhd(500) - c1001.quote.monthlyFils);
    expect(customerFinancials(withSettledContracts(onboarded(bhd(100)), ['c-1001', 'c-1002']), TODAY).existingObligationsFils).toBe(0);
    // Unknown ids change nothing.
    expect(customerFinancials(withSettledContracts(onboarded(bhd(500)), ['c-404']), TODAY).existingObligationsFils).toBe(bhd(500));
  });

  it('SandboxContractSettings reports each customer’s settled contracts', async () => {
    const settings = new SandboxContractSettings();
    const gw = new SandboxPaymentGateway();
    const me = { ...demo, customerId: 'cus-3' };
    const amount = settlementQuote(findContract(me, 'c-1002'), TODAY).settlementAmountFils;
    const p = await gw.createCharge({ amountFils: amount, method: 'card', purpose: 'early_settlement', reference: 'c-1002-settle', idempotencyKey: 'settle-key-1' }, 'cus-3');
    expect(settings.settledContractIds('cus-3')).toEqual([]);
    settings.settle(me, await gw.confirm(p.id, 'cus-3'), TODAY);
    expect(settings.settledContractIds('cus-3')).toEqual(['c-1002']);
    expect(settings.settledContractIds('cus-30')).toEqual([]);
    const profile = withSettledContracts(newCustomerProfile('cus-3'), settings.settledContractIds('cus-3'));
    expect(customerFinancials(profile, TODAY).existingObligationsFils).toBe(demo.existingObligationsFils - findContract(demo, 'c-1002').quote.monthlyFils);
    // No settlements: the profile is returned as is.
    const plain = newCustomerProfile('cus-4');
    expect(withSettledContracts(plain, [])).toBe(plain);
  });
});
