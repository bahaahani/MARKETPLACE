import { describe, expect, it } from 'vitest';
import {
  appendLead,
  bhd,
  BID_MAX_DISCOUNT_FILS,
  BID_MIN_MONTHLY_FILS,
  BID_REQUEST_VALIDITY_HOURS,
  BidError,
  bidCustomerFrom,
  bidRequestView,
  bidRules,
  criteriaMismatches,
  customerOverview,
  dealerRequestView,
  findVehicle,
  instantMatches,
  LeadStore,
  maxBidDiscount,
  newCustomerProfile,
  parseBidCriteria,
  quoteFinance,
  SandboxBidStore,
  sortBids,
  VEHICLES,
  withOnboarding,
  preApprove,
  type BidCustomer,
  type BidTerms,
  type Lead,
} from '../src';

const NOW = new Date(Date.UTC(2026, 9, 3, 9, 0));

function customer(id = 'cus_a'): BidCustomer {
  return bidCustomerFrom(customerOverview(newCustomerProfile(id), NOW));
}

/** A family SUV under BHD 300 a month, Murabaha over 5 years, BHD 3,000 down, Takaful. */
const SUV = {
  bodyType: 'suv',
  condition: 'any',
  maxMonthlyFils: bhd(300),
  structure: 'murabaha',
  tenureMonths: 60,
  downPaymentFils: bhd(3_000),
  insurance: 'takaful',
};

function setup(opts: { leads?: LeadStore } = {}) {
  let now = NOW;
  const leads = opts.leads ?? new LeadStore([]);
  const accepted: Lead[] = [];
  const store = new SandboxBidStore({
    clock: () => now,
    onAccepted: (lead) => {
      accepted.push(lead);
      appendLead(leads, lead);
    },
  });
  return {
    store,
    leads,
    accepted,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

function err(fn: () => unknown): BidError {
  try {
    fn();
  } catch (e) {
    return e as BidError;
  }
  throw new Error('expected a BidError');
}

describe('Bid For Me: posting a request', () => {
  it('serves the form rules from the customer headroom (on the monthly step)', () => {
    const c = customer();
    const rules = bidRules(c.maxMonthlyFils, null, NOW);
    expect(rules.maxMonthlyFils).toBeLessThanOrEqual(c.maxMonthlyFils);
    expect(rules.maxMonthlyFils % rules.monthlyStepFils).toBe(0);
    expect(rules.canPost).toBe(true);
    expect(rules.defaultMonthlyFils).toBeLessThanOrEqual(rules.maxMonthlyFils);
    expect(rules.structures).toEqual(['conventional', 'murabaha']);
    expect(rules.validityHours).toBe(72);
    expect(rules.minYear).toBe(2016);
    expect(bidRules(BID_MIN_MONTHLY_FILS - 1).canPost).toBe(false);
  });

  it('opens a request valid for 72 hours with instant matches from the whole catalogue, cheapest monthly first', () => {
    const { store } = setup();
    const r = store.post(customer(), SUV);
    expect(r.status).toBe('OPEN');
    expect(Date.parse(r.expiresAt) - Date.parse(r.createdAt)).toBe(BID_REQUEST_VALIDITY_HOURS * 3600 * 1000);
    expect(r.preApproved).toBe(true);
    expect(r.firstName).toEqual({ en: 'Fatima', ar: 'فاطمة' });
    expect(r.displayName).toEqual({ en: 'Fatima A.', ar: 'فاطمة أ.' });
    expect(r.terms.downPaymentFils).toBe(bhd(3_000));

    // Jolion, H9, CR-V fit; Patrol and Land Cruiser are over BHD 300; the Escalade needs more than BHD 3,000 down.
    expect(r.instantMatches.map((m) => m.vehicle.id)).toEqual(['v-haval-jolion-2026', 'v-haval-h9-2026', 'v-honda-crv-2026']);
    for (const m of r.instantMatches) {
      expect(m.pricing.monthlyFils).toBeLessThanOrEqual(SUV.maxMonthlyFils);
      expect(m.vehicle.bodyType).toBe('suv');
      expect(m.href).toBe(`/cars/${m.vehicle.id}`);
      expect(m.pricing.insurance?.takaful).toBe(true);
      const v = findVehicle(m.vehicle.id)!;
      const q = quoteFinance({ productLine: 'vehicle', structure: 'murabaha', assetPriceFils: v.priceFils, downPaymentFils: bhd(3_000), tenureMonths: 60 });
      expect(m.pricing.monthlyFils).toBe(q.monthlyFils);
      expect(m.pricing.totalCostFils).toBe(bhd(3_000) + q.totalPayableFils);
      expect(Number.isSafeInteger(m.pricing.totalCostFils)).toBe(true);
    }
  });

  it('rejects a maximum monthly above the DBR headroom (OVER_BUDGET) instead of flagging it', () => {
    const { store } = setup();
    const c = customer();
    const e = err(() => store.post(c, { ...SUV, maxMonthlyFils: c.maxMonthlyFils + 1 }));
    expect(e.code).toBe('OVER_BUDGET');
    expect(e.message).toContain(String(c.maxMonthlyFils));
    // Exactly the headroom is fine.
    expect(store.post(c, { ...SUV, maxMonthlyFils: c.maxMonthlyFils }).status).toBe('OPEN');
  });

  it("uses the onboarded customer's own headroom", () => {
    const { store } = setup();
    const financials = { monthlySalaryFils: bhd(600), existingObligationsFils: bhd(200) };
    const result = { preApproval: preApprove(financials, NOW) } as Parameters<typeof withOnboarding>[2];
    const profile = withOnboarding(newCustomerProfile('cus_low'), financials, result, NOW);
    const c = bidCustomerFrom(customerOverview(profile, NOW));
    expect(c.maxMonthlyFils).toBe(bhd(100));
    expect(err(() => store.post(c, SUV)).code).toBe('OVER_BUDGET');
    expect(store.post(c, { ...SUV, maxMonthlyFils: bhd(100) }).status).toBe('OPEN');
  });

  it('validates the request', () => {
    const { store } = setup();
    const c = customer();
    expect(err(() => store.post(c, { ...SUV, structure: 'ijara' })).code).toBe('INVALID_REQUEST');
    expect(err(() => store.post(c, { ...SUV, tenureMonths: 96 })).code).toBe('INVALID_REQUEST');
    expect(err(() => store.post(c, { ...SUV, maxMonthlyFils: 12.5 })).code).toBe('INVALID_REQUEST');
    expect(err(() => store.post(c, { ...SUV, maxMonthlyFils: BID_MIN_MONTHLY_FILS - 1 })).code).toBe('INVALID_REQUEST');
    expect(err(() => store.post(c, { ...SUV, downPaymentFils: -1 })).code).toBe('INVALID_REQUEST');
    expect(err(() => store.post(c, { ...SUV, bodyType: 'van' })).code).toBe('INVALID_REQUEST');
    expect(err(() => store.post(c, { ...SUV, minYear: 1990 })).code).toBe('INVALID_REQUEST');
    expect(err(() => store.post(c, { ...SUV, minSeats: 6 })).code).toBe('INVALID_REQUEST');
    expect(err(() => store.post(c, { ...SUV, useTradeIn: true })).code).toBe('NO_TRADE_IN');
    expect(err(() => store.post(c, null)).code).toBe('INVALID_REQUEST');
    expect(parseBidCriteria({}, NOW)).toEqual({ bodyType: 'any', condition: 'any', minYear: null, maxMileageKm: null, fuel: 'any', minSeats: null });
  });

  it('adds an active trade-in offer to the down payment', () => {
    const { store } = setup();
    const tradeIn = { offerId: 'ti_1', offerFils: bhd(4_000), validUntil: '2026-10-10' };
    const r = store.post(customer(), { ...SUV, downPaymentFils: bhd(1_000), useTradeIn: true }, tradeIn);
    expect(r.terms.tradeIn).toEqual(tradeIn);
    expect(r.terms.cashDownPaymentFils).toBe(bhd(1_000));
    expect(r.terms.downPaymentFils).toBe(bhd(5_000));
    // Not used unless asked for.
    const other = setup().store.post(customer(), SUV, tradeIn);
    expect(other.terms.tradeIn).toBeNull();
  });

  it('allows one open request per customer (other customers are independent)', () => {
    const { store } = setup();
    store.post(customer('cus_a'), SUV);
    expect(err(() => store.post(customer('cus_a'), SUV)).code).toBe('REQUEST_ALREADY_OPEN');
    expect(store.post(customer('cus_b'), SUV).status).toBe('OPEN');
  });
});

describe('Bid For Me: dealer bids', () => {
  it('shows a request only to dealers with matching stock', () => {
    const { store } = setup();
    const r = store.post(customer(), SUV);
    expect(store.openForDealer('nmc').map((x) => x.id)).toEqual([r.id]);
    expect(store.openForDealer('tac').map((x) => x.id)).toEqual([r.id]);
    // The partner dealer sells no SUV.
    expect(store.openForDealer('demo-dealer')).toEqual([]);
    const view = store.openForDealer('tac')[0]!;
    expect(view.matchingVehicles.map((m) => m.vehicle.id).sort()).toEqual(['v-nissan-patrol-2021', 'v-toyota-landcruiser-2022']);
    expect(view.matchingVehicles.every((m) => !m.withinBudget)).toBe(true);
  });

  it('computes the monthly on the server from the discounted price and the customer terms', () => {
    const { store } = setup();
    const r = store.post(customer(), SUV);
    const patrol = findVehicle('v-nissan-patrol-2021')!;
    const cap = maxBidDiscount(patrol.priceFils);
    expect(cap).toBe(Math.min(BID_MAX_DISCOUNT_FILS, Math.floor(patrol.priceFils * 0.15)));
    const bid = store.bid('tac', r.id, { vehicleId: patrol.id, discountFils: cap, extras: ['service-3y', 'window-tint'], monthlyFils: 1 });
    const q = quoteFinance({ productLine: 'vehicle', structure: 'murabaha', assetPriceFils: patrol.priceFils - cap, downPaymentFils: bhd(3_000), tenureMonths: 60 });
    expect(bid.pricing.monthlyFils).toBe(q.monthlyFils);
    expect(bid.pricing.priceFils).toBe(patrol.priceFils - cap);
    expect(bid.pricing.discountFils).toBe(cap);
    expect(bid.extras).toEqual(['service-3y', 'window-tint']);
    expect(bid.status).toBe('ACTIVE');
  });

  it('rejects bids over the maximum monthly, foreign or unknown cars, criteria mismatches, big discounts and bad extras', () => {
    const { store } = setup();
    const r = store.post(customer(), SUV);
    const code = (seller: string, body: unknown) => err(() => store.bid(seller, r.id, body)).code;
    // Patrol at list price is over BHD 300 a month.
    expect(code('tac', { vehicleId: 'v-nissan-patrol-2021' })).toBe('OVER_MAX_MONTHLY');
    expect(code('nmc', { vehicleId: 'v-toyota-landcruiser-2022' })).toBe('VEHICLE_NOT_IN_INVENTORY');
    expect(code('nmc', { vehicleId: 'v-nope' })).toBe('VEHICLE_NOT_FOUND');
    expect(code('nmc', { vehicleId: 'v-honda-city-2026' })).toBe('CRITERIA_MISMATCH');
    expect(code('nmc', { vehicleId: 'v-cadillac-escalade-2026' })).toBe('DOWN_PAYMENT_TOO_LOW');
    expect(code('tac', { vehicleId: 'v-nissan-patrol-2021', discountFils: maxBidDiscount(bhd(19_500)) + 1 })).toBe('DISCOUNT_TOO_HIGH');
    expect(code('tac', { vehicleId: 'v-nissan-patrol-2021', discountFils: -5 })).toBe('INVALID_DISCOUNT');
    expect(code('nmc', { vehicleId: 'v-honda-crv-2026', extras: ['gold-plating'] })).toBe('INVALID_EXTRAS');
    expect(code('nmc', { vehicleId: 'v-honda-crv-2026', extras: ['service-1y', 'service-2y'] })).toBe('INVALID_EXTRAS');
    expect(code('nmc', {})).toBe('INVALID_REQUEST');
    expect(err(() => store.bid('nmc', 'breq_missing', { vehicleId: 'v-honda-crv-2026' })).code).toBe('REQUEST_NOT_FOUND');
    expect(criteriaMismatches(findVehicle('v-honda-city-2026')!, r.criteria)).toEqual(['bodyType']);
    expect(store.get(r.id, 'cus_a')!.bids).toEqual([]);
  });

  it('keeps one bid per dealer: a new bid replaces the previous one', () => {
    const { store } = setup();
    const r = store.post(customer(), SUV);
    const first = store.bid('nmc', r.id, { vehicleId: 'v-honda-crv-2026' });
    const second = store.bid('nmc', r.id, { vehicleId: 'v-haval-h9-2026', discountFils: bhd(500) });
    const now = store.get(r.id, 'cus_a')!;
    expect(now.bids.map((b) => b.id)).toEqual([second.id]);
    expect(second.id).not.toBe(first.id);
    expect(store.openForDealer('nmc')[0]!.myBid!.id).toBe(second.id);
    // The customer cannot accept the version that was replaced.
    expect(err(() => store.accept(r.id, 'cus_a', first.id)).code).toBe('BID_NOT_FOUND');
  });

  it('ranks bids by monthly, total cost or extras', () => {
    const { store } = setup();
    const r = store.post(customer(), SUV);
    const crv = store.bid('nmc', r.id, { vehicleId: 'v-honda-crv-2026', extras: ['service-3y', 'window-tint', 'floor-mats'] });
    const patrol = store.bid('tac', r.id, { vehicleId: 'v-nissan-patrol-2021', discountFils: maxBidDiscount(bhd(19_500)) });
    const view = bidRequestView(store.get(r.id, 'cus_a')!, 'monthly');
    expect(view.bids.map((b) => b.id)).toEqual(crv.pricing.monthlyFils <= patrol.pricing.monthlyFils ? [crv.id, patrol.id] : [patrol.id, crv.id]);
    expect(view.bids.map((b) => b.rank)).toEqual([1, 2]);
    expect(view.bidCount).toBe(2);
    expect(bidRequestView(store.get(r.id, 'cus_a')!, 'extras').bids[0]!.id).toBe(crv.id);
    const byTotal = sortBids([patrol, crv], 'total');
    expect(byTotal[0]!.pricing.totalCostFils).toBeLessThanOrEqual(byTotal[1]!.pricing.totalCostFils);
  });
});

describe('Bid For Me: accept, cancel, expiry', () => {
  it('accepting a bid closes the request, marks the others LOST and gives the dealer a lead', () => {
    const leads = new LeadStore([]);
    const { store, accepted } = setup({ leads });
    const r = store.post(customer(), SUV);
    const crv = store.bid('nmc', r.id, { vehicleId: 'v-honda-crv-2026' });
    const patrol = store.bid('tac', r.id, { vehicleId: 'v-nissan-patrol-2021', discountFils: maxBidDiscount(bhd(19_500)) });

    const { request, bid, lead } = store.accept(r.id, 'cus_a', patrol.id);
    expect(request.status).toBe('CLOSED');
    expect(request.acceptedBidId).toBe(patrol.id);
    expect(bid.status).toBe('ACCEPTED');
    expect(request.bids.find((b) => b.id === crv.id)!.status).toBe('LOST');

    expect(accepted).toEqual([lead]);
    expect(lead).toMatchObject({ sellerId: 'tac', vehicleId: 'v-nissan-patrol-2021', source: 'bid', status: 'NEW', preApproved: true });
    expect(lead.customerName).toEqual({ en: 'Fatima A.', ar: 'فاطمة أ.' });
    expect(leads.list('tac').map((l) => l.id)).toEqual([lead.id]);
    expect(leads.list('nmc')).toEqual([]);
    // The dealer can work the lead like any other.
    expect(leads.updateStatus('tac', lead.id, 'CONTACTED').status).toBe('CONTACTED');
    expect(appendLead(leads, lead).status).toBe('CONTACTED');

    const view = bidRequestView(request);
    expect(view.accepted).toEqual({ bidId: patrol.id, vehicleId: 'v-nissan-patrol-2021', sellerId: 'tac', applyHref: '/cars/v-nissan-patrol-2021' });
    expect(view.canAccept).toBe(false);
    expect(view.bids.find((b) => b.status === 'LOST')!.rank).toBeNull();

    expect(err(() => store.accept(r.id, 'cus_a', crv.id)).code).toBe('REQUEST_CLOSED');
    expect(err(() => store.bid('nmc', r.id, { vehicleId: 'v-honda-crv-2026' })).code).toBe('REQUEST_CLOSED');
    expect(store.openForDealer('tac')).toEqual([]);
    // A new request can be posted now.
    expect(store.post(customer(), SUV).status).toBe('OPEN');
  });

  it("only the owner can see, accept or cancel a request", () => {
    const { store } = setup();
    const r = store.post(customer('cus_a'), SUV);
    const bid = store.bid('nmc', r.id, { vehicleId: 'v-honda-crv-2026' });
    expect(store.get(r.id, 'cus_b')).toBeUndefined();
    expect(store.list('cus_b')).toEqual([]);
    expect(err(() => store.accept(r.id, 'cus_b', bid.id)).code).toBe('REQUEST_NOT_FOUND');
    expect(err(() => store.cancel(r.id, 'cus_b')).code).toBe('REQUEST_NOT_FOUND');
    expect(err(() => store.accept(r.id, 'cus_a', 'bid_unknown')).code).toBe('BID_NOT_FOUND');
    expect(err(() => store.accept(r.id, 'cus_a', undefined)).code).toBe('INVALID_REQUEST');
  });

  it('cancelling closes the request and its bids', () => {
    const { store } = setup();
    const r = store.post(customer(), SUV);
    store.bid('nmc', r.id, { vehicleId: 'v-honda-crv-2026' });
    const cancelled = store.cancel(r.id, 'cus_a');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.bids.every((b) => b.status === 'LOST')).toBe(true);
    expect(err(() => store.cancel(r.id, 'cus_a')).code).toBe('REQUEST_CLOSED');
    expect(store.openForDealer('nmc')).toEqual([]);
  });

  it('expires 72 hours after posting', () => {
    const { store, advance } = setup();
    const r = store.post(customer(), SUV);
    store.bid('nmc', r.id, { vehicleId: 'v-honda-crv-2026' });
    advance(BID_REQUEST_VALIDITY_HOURS * 3600 * 1000 - 1);
    expect(store.get(r.id, 'cus_a')!.status).toBe('OPEN');
    advance(1);
    const expired = store.get(r.id, 'cus_a')!;
    expect(expired.status).toBe('EXPIRED');
    expect(expired.closedAt).toBe(r.expiresAt);
    expect(expired.bids.every((b) => b.status === 'LOST')).toBe(true);
    expect(err(() => store.bid('tac', r.id, { vehicleId: 'v-nissan-patrol-2021' })).code).toBe('REQUEST_EXPIRED');
    expect(err(() => store.accept(r.id, 'cus_a', expired.bids[0]!.id)).code).toBe('REQUEST_EXPIRED');
    expect(store.openForDealer('nmc')).toEqual([]);
    expect(store.post(customer(), SUV).status).toBe('OPEN');
  });
});

describe('Bid For Me: privacy of the dealer view', () => {
  it('shows criteria, first name and pre-approval only: no customer id, salary, obligations, headroom or trade-in', () => {
    const { store } = setup();
    const c = customer('cus_private');
    const tradeIn = { offerId: 'ti_secret', offerFils: bhd(2_000), validUntil: '2026-10-10' };
    const r = store.post(c, { ...SUV, downPaymentFils: bhd(1_000), useTradeIn: true }, tradeIn);
    store.bid('tac', r.id, { vehicleId: 'v-nissan-patrol-2021', discountFils: maxBidDiscount(bhd(19_500)) });
    const view = store.openForDealer('nmc')[0]!;
    expect(view.firstName).toEqual({ en: 'Fatima', ar: 'فاطمة' });
    expect(view.preApproved).toBe(true);
    expect(view.terms).toEqual({ maxMonthlyFils: bhd(300), structure: 'murabaha', tenureMonths: 60, downPaymentFils: bhd(3_000), insurance: 'takaful' });
    expect(view.bidCount).toBe(1);
    expect(view.myBid).toBeNull();

    const json = JSON.stringify(view);
    for (const secret of ['cus_private', 'Ahmed', 'أحمد', 'ti_secret', 'tradeIn', 'cashDownPayment', 'customerId', 'salary', 'Salary', 'obligation', 'cpr', '"sellerId":"tac"']) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain(String(c.maxMonthlyFils));
    // Another dealer's bid stays hidden: only the count is shared.
    expect(dealerRequestView(store.get(r.id, 'cus_private')!, 'nmc').myBid).toBeNull();
  });
});

describe('Bid For Me: instant matches', () => {
  it('only lists cars that match every criterion and the budget', () => {
    const terms: BidTerms = {
      maxMonthlyFils: bhd(400),
      structure: 'conventional',
      tenureMonths: 48,
      cashDownPaymentFils: bhd(2_000),
      tradeIn: null,
      downPaymentFils: bhd(2_000),
      insurance: 'none',
    };
    const criteria = parseBidCriteria({ condition: 'used', maxMileageKm: 30_000, minSeats: 5 }, NOW);
    const matches = instantMatches(criteria, terms);
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      const v = VEHICLES.find((x) => x.id === m.vehicle.id)!;
      expect(criteriaMismatches(v, criteria)).toEqual([]);
      expect(m.pricing.monthlyFils).toBeLessThanOrEqual(terms.maxMonthlyFils);
      expect(m.pricing.insurance).toBeNull();
    }
    const monthly = matches.map((m) => m.pricing.monthlyFils);
    expect(monthly).toEqual([...monthly].sort((a, b) => a - b));
    expect(matches.map((m) => m.vehicle.id)).not.toContain('v-kia-picanto-2025'); // 4 seats
  });
});
