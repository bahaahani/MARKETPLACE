import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  applicationSteps,
  ApplicationTransitionError,
  assertTransition,
  bhd,
  decide,
  fulfilmentPath,
  maxMonthlyInstallment,
  MURABAHA_STEPS,
  OriginationError,
  QuoteError,
  quoteFinance,
  SandboxOriginationService,
  type ApplicationRequest,
  type CustomerFinancials,
} from '../src';

// Salary BHD 1,400 with BHD 326.753 of existing installments: BHD 373.247 headroom under the 50% DBR cap.
const applicant: CustomerFinancials = { monthlySalaryFils: bhd(1_400), existingObligationsFils: 326_753 };

const crv: ApplicationRequest = {
  productLine: 'vehicle',
  structure: 'murabaha',
  assetPriceFils: bhd(14_900),
  downPaymentFils: bhd(3_000),
  tenureMonths: 60,
  reference: 'v-honda-crv-2026',
  idempotencyKey: 'key-crv-0001',
};

function fixedClock() {
  let t = Date.UTC(2026, 9, 3, 9, 0, 0);
  return () => new Date((t += 1000));
}

const quoteOf = (r: ApplicationRequest) => quoteFinance(r);

describe('decide', () => {
  it('approves an affordable application within the pre-approval (OK)', () => {
    const d = decide({ productLine: 'vehicle', quote: quoteOf(crv) }, applicant);
    expect(d.outcome).toBe('APPROVED');
    expect(d.reasons).toEqual(['OK']);
    expect(d.maxMonthlyFils).toBe(maxMonthlyInstallment(applicant));
    expect(d.monthlyFils).toBe(233_042);
    expect(d.preApprovedLimitFils).toBe(bhd(25_100));
    // (326.753 + 233.042) / 1,400 = 39.99%
    expect(d.dbrAfterPct).toBe(39.99);
  });

  it('declines when the installment is above the DBR headroom (DBR_EXCEEDED)', () => {
    const q = quoteOf({ ...crv, assetPriceFils: bhd(24_800), downPaymentFils: bhd(5_000) });
    expect(q.monthlyFils).toBeGreaterThan(maxMonthlyInstallment(applicant));
    const d = decide({ productLine: 'vehicle', quote: q }, applicant);
    expect(d.outcome).toBe('DECLINED');
    expect(d.reasons).toEqual(['DBR_EXCEEDED']);
  });

  it('returns every failing reason, most severe first', () => {
    const q = quoteOf({ ...crv, assetPriceFils: bhd(46_500), downPaymentFils: bhd(9_300) });
    const d = decide({ productLine: 'vehicle', quote: q }, applicant);
    expect(d.outcome).toBe('DECLINED');
    expect(d.reasons).toEqual(['DBR_EXCEEDED', 'AMOUNT_ABOVE_PREAPPROVAL']);
  });

  it('refers an affordable amount above the pre-approved limit (AMOUNT_ABOVE_PREAPPROVAL)', () => {
    // The limit is rounded down to BHD 100, so a facility just above it can still be affordable.
    const q = quoteOf(crv);
    const limit = decide({ productLine: 'vehicle', quote: q }, applicant).preApprovedLimitFils;
    const d = decide({ productLine: 'vehicle', quote: { ...q, financedFils: limit + 1 } }, applicant);
    expect(d.outcome).toBe('REFERRED');
    expect(d.reasons).toEqual(['AMOUNT_ABOVE_PREAPPROVAL']);
  });

  it('refers when the installment uses most of the headroom (HIGH_DBR_UTILISATION)', () => {
    const q = quoteOf({ ...crv, assetPriceFils: bhd(19_500), downPaymentFils: bhd(3_900) });
    const d = decide({ productLine: 'vehicle', quote: q }, applicant);
    expect(d.outcome).toBe('REFERRED');
    expect(d.reasons).toEqual(['HIGH_DBR_UTILISATION']);
  });

  it('declines when there is no headroom at all', () => {
    const d = decide({ productLine: 'personal', quote: quoteOf({ ...crv, productLine: 'personal', downPaymentFils: 0, assetPriceFils: bhd(1_000) }) }, {
      monthlySalaryFils: bhd(1_000),
      existingObligationsFils: bhd(600),
    });
    expect(d.outcome).toBe('DECLINED');
    expect(d.reasons[0]).toBe('DBR_EXCEEDED');
  });

  it('is deterministic', () => {
    const a = decide({ productLine: 'vehicle', quote: quoteOf(crv) }, applicant);
    const b = decide({ productLine: 'vehicle', quote: quoteOf(crv) }, applicant);
    expect(a).toEqual(b);
  });
});

describe('application state machine', () => {
  it('shares the path up to the signed contract', () => {
    for (const s of ['conventional', 'murabaha'] as const) {
      expect(allowedTransitions(s, 'DRAFT')).toEqual(['SUBMITTED']);
      expect(allowedTransitions(s, 'SUBMITTED')).toEqual(['APPROVED', 'REFERRED', 'DECLINED']);
      expect(allowedTransitions(s, 'APPROVED')).toEqual(['OFFER_ACCEPTED']);
      expect(allowedTransitions(s, 'DECLINED')).toEqual([]);
      expect(allowedTransitions(s, 'COMPLETED')).toEqual([]);
    }
  });

  it('conventional goes straight from contract to disbursement', () => {
    expect(fulfilmentPath('vehicle', 'conventional')).toEqual(['OFFER_ACCEPTED', 'CONTRACT_SIGNED', 'DISBURSED', 'COMPLETED']);
    expect(() => assertTransition('conventional', 'CONTRACT_SIGNED', 'ASSET_PURCHASED_BY_BCFC')).toThrow(ApplicationTransitionError);
  });

  it('Murabaha: BCFC buys and owns the asset before selling it', () => {
    expect(fulfilmentPath('vehicle', 'murabaha')).toEqual([
      'OFFER_ACCEPTED',
      'CONTRACT_SIGNED',
      'ASSET_PURCHASED_BY_BCFC',
      'OWNERSHIP_TRANSFERRED_TO_BCFC',
      'SALE_TO_CUSTOMER',
      'COMPLETED',
    ]);
    // Personal (commodity) Murabaha pays out the commodity sale proceeds.
    expect(fulfilmentPath('personal', 'murabaha')).toEqual([
      'OFFER_ACCEPTED',
      'CONTRACT_SIGNED',
      ...MURABAHA_STEPS,
      'DISBURSED',
      'COMPLETED',
    ]);
  });

  it.each([
    ['CONTRACT_SIGNED', 'DISBURSED'],
    ['CONTRACT_SIGNED', 'OWNERSHIP_TRANSFERRED_TO_BCFC'],
    ['CONTRACT_SIGNED', 'SALE_TO_CUSTOMER'],
    ['ASSET_PURCHASED_BY_BCFC', 'SALE_TO_CUSTOMER'],
    ['ASSET_PURCHASED_BY_BCFC', 'COMPLETED'],
    ['OWNERSHIP_TRANSFERRED_TO_BCFC', 'COMPLETED'],
    ['OFFER_ACCEPTED', 'ASSET_PURCHASED_BY_BCFC'],
  ] as const)('Murabaha: skipping a step (%s → %s) throws', (from, to) => {
    expect(() => assertTransition('murabaha', from, to)).toThrow(ApplicationTransitionError);
  });

  it('Murabaha after the sale: personal (commodity) must disburse, vehicle completes on the sale', () => {
    expect(allowedTransitions('murabaha', 'SALE_TO_CUSTOMER', 'personal')).toEqual(['DISBURSED']);
    expect(allowedTransitions('murabaha', 'SALE_TO_CUSTOMER', 'vehicle')).toEqual(['COMPLETED']);
    expect(() => assertTransition('murabaha', 'SALE_TO_CUSTOMER', 'COMPLETED', 'personal')).toThrow(ApplicationTransitionError);
    expect(() => assertTransition('murabaha', 'SALE_TO_CUSTOMER', 'DISBURSED', 'vehicle')).toThrow(ApplicationTransitionError);
  });

  it('the service will not skip the cash payout of a personal Murabaha', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const personal: ApplicationRequest = {
      ...crv,
      productLine: 'personal',
      assetPriceFils: bhd(3_000),
      downPaymentFils: 0,
      tenureMonths: 36,
      reference: 'personal',
      idempotencyKey: 'key-personal-skip',
    };
    const { id, status } = svc.apply(personal, applicant, 'demo-customer');
    expect(status).toBe('APPROVED');
    for (const s of ['OFFER_ACCEPTED', 'CONTRACT_SIGNED', ...MURABAHA_STEPS] as const) svc.advance(id, s);
    expect(() => svc.advance(id, 'COMPLETED')).toThrow(ApplicationTransitionError);
    expect(svc.advance(id, 'DISBURSED').status).toBe('DISBURSED');
  });

  it('cannot accept an offer that was not approved', () => {
    expect(() => assertTransition('conventional', 'DECLINED', 'OFFER_ACCEPTED')).toThrow(/DECLINED to OFFER_ACCEPTED/);
    expect(() => assertTransition('conventional', 'REFERRED', 'OFFER_ACCEPTED')).toThrow(ApplicationTransitionError);
    expect(() => assertTransition('murabaha', 'SUBMITTED', 'CONTRACT_SIGNED')).toThrow(ApplicationTransitionError);
  });
});

describe('SandboxOriginationService', () => {
  it('creates a DRAFT with the server-side quote', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const app = svc.create(crv, applicant, 'demo-customer');
    expect(app.status).toBe('DRAFT');
    expect(app.quote).toEqual(quoteOf(crv));
    expect(app.timeline).toEqual([{ status: 'DRAFT', at: '2026-10-03T09:00:01.000Z' }]);
  });

  it('create is idempotent on the key', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const a = svc.create(crv, applicant, 'demo-customer');
    const b = svc.create({ ...crv, tenureMonths: 48 }, applicant, 'demo-customer');
    expect(b.id).toBe(a.id);
    expect(b.quote.tenureMonths).toBe(60);
    expect(svc.list('demo-customer')).toHaveLength(1);
  });

  it('apply submits and decides immediately, and is idempotent', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const app = svc.apply(crv, applicant, 'demo-customer');
    expect(app.status).toBe('APPROVED');
    expect(app.decision?.reasons).toEqual(['OK']);
    expect(app.timeline.map((e) => e.status)).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED']);
    expect(svc.apply(crv, applicant, 'demo-customer')).toBe(app);
  });

  it('accept runs the Murabaha sequence in order with timestamps', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const { id } = svc.apply(crv, applicant, 'demo-customer');
    const done = svc.accept(id);
    expect(done.status).toBe('COMPLETED');
    const statuses = done.timeline.map((e) => e.status);
    expect(statuses).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED', ...fulfilmentPath('vehicle', 'murabaha')]);
    expect(statuses.indexOf('OWNERSHIP_TRANSFERRED_TO_BCFC')).toBeLessThan(statuses.indexOf('SALE_TO_CUSTOMER'));
    const times = done.timeline.map((e) => Date.parse(e.at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // Accepting again is harmless.
    expect(svc.accept(id)).toBe(done);
  });

  it('accept refuses declined and referred applications', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const declined = svc.apply({ ...crv, assetPriceFils: bhd(46_500), downPaymentFils: bhd(9_300), idempotencyKey: 'key-escalade' }, applicant, 'demo-customer');
    expect(declined.status).toBe('DECLINED');
    expect(() => svc.accept(declined.id)).toThrow(OriginationError);
    const referred = svc.apply({ ...crv, assetPriceFils: bhd(19_500), downPaymentFils: bhd(3_900), idempotencyKey: 'key-patrol' }, applicant, 'demo-customer');
    expect(referred.status).toBe('REFERRED');
    expect(() => svc.accept(referred.id)).toThrow(/only APPROVED/);
  });

  it('advance enforces the state machine', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const { id } = svc.apply(crv, applicant, 'demo-customer');
    svc.advance(id, 'OFFER_ACCEPTED');
    svc.advance(id, 'CONTRACT_SIGNED');
    expect(() => svc.advance(id, 'SALE_TO_CUSTOMER')).toThrow(ApplicationTransitionError);
    expect(svc.get(id)?.status).toBe('CONTRACT_SIGNED');
  });

  it('validates requests and quote terms', () => {
    const svc = new SandboxOriginationService(fixedClock());
    expect(() => svc.apply({ ...crv, idempotencyKey: 'short' }, applicant, 'c')).toThrow(OriginationError);
    // A non-string key (e.g. a JSON number) used to slip past the length check.
    expect(() => svc.apply({ ...crv, idempotencyKey: 123456789 as never }, applicant, 'c')).toThrow(OriginationError);
    expect(() => svc.apply({ ...crv, structure: 'ijara' as never, idempotencyKey: 'key-ijara-1' }, applicant, 'c')).toThrow(OriginationError);
    expect(() => svc.apply({ ...crv, tenureMonths: 120, idempotencyKey: 'key-tenure-1' }, applicant, 'c')).toThrow(QuoteError);
    expect(() =>
      svc.apply({ ...crv, productLine: 'personal', assetPriceFils: bhd(100), downPaymentFils: 0, idempotencyKey: 'key-small-1' }, applicant, 'c'),
    ).toThrow(OriginationError);
    expect(() => svc.accept('nope')).toThrow(OriginationError);
  });

  it('lists a customer’s applications, newest first', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const a = svc.apply(crv, applicant, 'demo-customer');
    const b = svc.apply({ ...crv, idempotencyKey: 'key-crv-0002' }, applicant, 'demo-customer');
    svc.apply({ ...crv, idempotencyKey: 'key-other-01' }, applicant, 'someone-else');
    expect(svc.list('demo-customer').map((x) => x.id)).toEqual([b.id, a.id]);
  });
});

describe('applicationSteps', () => {
  it('shows done steps with timestamps, then the planned Murabaha steps', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const app = svc.apply(crv, applicant, 'demo-customer');
    const steps = applicationSteps(app);
    expect(steps.map((s) => s.status)).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED', ...fulfilmentPath('vehicle', 'murabaha')]);
    expect(steps.filter((s) => s.done).every((s) => s.at)).toBe(true);
    expect(steps.filter((s) => !s.done).some((s) => s.at)).toBe(false);
    expect(steps.filter((s) => s.murabaha).map((s) => s.status)).toEqual(MURABAHA_STEPS);
  });

  it('stops at the decision for declined applications', () => {
    const svc = new SandboxOriginationService(fixedClock());
    const app = svc.apply({ ...crv, structure: 'conventional', assetPriceFils: bhd(46_500), downPaymentFils: bhd(9_300) }, applicant, 'c');
    expect(applicationSteps(app).map((s) => s.status)).toEqual(['DRAFT', 'SUBMITTED', 'DECLINED']);
  });
});
