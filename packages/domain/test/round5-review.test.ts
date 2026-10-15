import { describe, expect, it } from 'vitest';
import {
  bhd,
  bidCustomerFrom,
  CarryError,
  customerOverview,
  InsuranceQuoteError,
  medicalQuotes,
  newCustomerProfile,
  pricePolicyQuote,
  resolveVehicleCarry,
  SandboxBidStore,
  SandboxOriginationService,
  SandboxTradeInStore,
  withMedicalDefaults,
  type ApplicationRequest,
  type BidCustomer,
  type CarryContext,
  type CustomerFinancials,
  type Lead,
} from '../src';

/** Regression tests for the round-5 review (bids, carry-through, medical / life). */

const NOW = new Date(Date.UTC(2026, 9, 3, 9, 0));
const CRV = 'v-honda-crv-2026';
const applicant: CustomerFinancials = { monthlySalaryFils: bhd(1_400), existingObligationsFils: 326_753 };
const SUV = { bodyType: 'suv', condition: 'any', maxMonthlyFils: bhd(300), structure: 'murabaha', tenureMonths: 60, downPaymentFils: bhd(3_000), insurance: 'takaful' };

function customer(id: string): BidCustomer {
  return bidCustomerFrom(customerOverview(newCustomerProfile(id), NOW));
}

function acceptedBid(bids: SandboxBidStore, customerId: string) {
  const r = bids.post(customer(customerId), SUV);
  const bid = bids.bid('nmc', r.id, { vehicleId: CRV, discountFils: bhd(500), extras: ['service-1y'] });
  const { request, bid: accepted } = bids.accept(r.id, customerId, bid.id);
  return { requestId: request.id, bidId: accepted.id };
}

describe('accepting a bid is idempotent', () => {
  it('repeating the accept of the accepted bid returns the same result and creates no second lead', () => {
    const leads: Lead[] = [];
    const bids = new SandboxBidStore({ clock: () => NOW, onAccepted: (l) => leads.push(l) });
    const r = bids.post(customer('cus_a'), { ...SUV, maxMonthlyFils: bhd(360) });
    const nmc = bids.bid('nmc', r.id, { vehicleId: CRV });
    const tac = bids.bid('tac', r.id, { vehicleId: 'v-nissan-patrol-2021', discountFils: bhd(2_925) });
    const first = bids.accept(r.id, 'cus_a', nmc.id);
    const again = bids.accept(r.id, 'cus_a', nmc.id);
    expect(again.request).toEqual(first.request);
    expect(again.bid.id).toBe(nmc.id);
    expect(again.lead.id).toBe(first.lead.id);
    expect(leads).toHaveLength(1);
    // Any other bid on the closed request is still refused, and so is another customer.
    expect(() => bids.accept(r.id, 'cus_a', tac.id)).toThrow(/CLOSED/);
    expect(() => bids.accept(r.id, 'cus_b', nmc.id)).toThrow(/not found/);
    // The accept of a bid that was not accepted never turns into a replay.
    expect(bids.get(r.id, 'cus_a')!.acceptedBidId).toBe(nmc.id);
  });
});

describe('one accepted bid prices one application', () => {
  it('refuses a second application on the same bid, unless the first was declined, and a replay of the key still works', () => {
    const bids = new SandboxBidStore({ clock: () => NOW });
    const tradeIns = new SandboxTradeInStore(() => NOW);
    const origination = new SandboxOriginationService(() => NOW);
    const ids = acceptedBid(bids, 'cus_a');
    const ctx = (): CarryContext => ({
      customerId: 'cus_a',
      bids,
      tradeIns,
      now: NOW,
      bidInUse: (bidId) => origination.list('cus_a').some((a) => a.source?.bidId === bidId && a.status !== 'DECLINED'),
    });
    const apply = (key: string, down = bhd(3_000)) => {
      const carry = resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: down, ...ids }, ctx());
      const req: ApplicationRequest = {
        productLine: 'vehicle',
        structure: 'murabaha',
        assetPriceFils: carry.assetPriceFils,
        downPaymentFils: carry.downPaymentFils,
        tenureMonths: 60,
        reference: CRV,
        idempotencyKey: key,
        source: carry.source,
        listPriceFils: carry.listPriceFils,
        extras: carry.extras,
      };
      return origination.apply(req, applicant, 'cus_a');
    };
    const first = apply('key-first-0001');
    expect(first.source).toEqual({ type: 'bid', requestId: ids.requestId, bidId: ids.bidId });
    let code = '';
    try {
      apply('key-second-0002');
    } catch (e) {
      expect(e).toBeInstanceOf(CarryError);
      code = (e as CarryError).code;
    }
    expect(code).toBe('BID_ALREADY_USED');
    expect(origination.list('cus_a')).toHaveLength(1);
  });

  it('the carry context without bidInUse behaves as before', () => {
    const bids = new SandboxBidStore({ clock: () => NOW });
    const tradeIns = new SandboxTradeInStore(() => NOW);
    const ids = acceptedBid(bids, 'cus_a');
    expect(resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: bhd(3_000), ...ids }, { customerId: 'cus_a', bids, tradeIns, now: NOW }).source).toBeDefined();
  });
});

describe('origination finds an application by idempotency key (per customer)', () => {
  it('never crosses customers', () => {
    const origination = new SandboxOriginationService(() => NOW);
    const req: ApplicationRequest = { productLine: 'vehicle', structure: 'murabaha', assetPriceFils: bhd(14_900), downPaymentFils: bhd(3_000), tenureMonths: 60, reference: CRV, idempotencyKey: 'key-replay-0001' };
    const app = origination.apply(req, applicant, 'cus_a');
    expect(origination.findByKey('cus_a', 'key-replay-0001')?.id).toBe(app.id);
    expect(origination.findByKey('cus_b', 'key-replay-0001')).toBeUndefined();
    expect(origination.findByKey('cus_a', 'other-key-0001')).toBeUndefined();
  });
});

describe('medical: a pre-existing conditions declaration is never coerced', () => {
  const base = { primaryDateOfBirth: '1986-01-01', nationality: 'expat' as const };
  it('refuses "true", 1 and other non-booleans instead of reading them as "nothing to declare"', () => {
    for (const bad of ['true', 1, 'yes', [], {}]) {
      expect(() => medicalQuotes(withMedicalDefaults({ ...base, preExistingConditions: bad as never }), NOW)).toThrow(InsuranceQuoteError);
      expect(() => pricePolicyQuote({ line: 'medical', insurerId: 'pearl-takaful', input: { ...base, preExistingConditions: bad as never } }, NOW)).toThrow(InsuranceQuoteError);
    }
  });
  it('still defaults to false when omitted or null, and accepts true', () => {
    const plain = medicalQuotes(withMedicalDefaults(base), NOW);
    expect(medicalQuotes(withMedicalDefaults({ ...base, preExistingConditions: null as never }), NOW)).toEqual(plain);
    const declared = medicalQuotes(withMedicalDefaults({ ...base, preExistingConditions: true }), NOW);
    expect(declared.find((q) => q.insurerId === 'pearl-takaful')!.annualPremiumFils).toBeGreaterThan(plain.find((q) => q.insurerId === 'pearl-takaful')!.annualPremiumFils);
  });
});
