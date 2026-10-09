import { describe, expect, it } from 'vitest';
import {
  applicationPricing,
  applicationView,
  bhd,
  bidCustomerFrom,
  BID_ACCEPTED_VALIDITY_DAYS,
  bidRequestView,
  CarryError,
  customerOverview,
  decide,
  findVehicle,
  newCustomerProfile,
  OriginationError,
  quoteFinance,
  referredApplicationView,
  resolveVehicleCarry,
  SandboxBidStore,
  SandboxOriginationService,
  SandboxTradeInStore,
  tradeInDownPayment,
  type ApplicationRequest,
  type BidCustomer,
  type CarryContext,
  type CustomerFinancials,
  type Lead,
  type TradeInRequest,
} from '../src';

const NOW = new Date(Date.UTC(2026, 9, 3, 9, 0));
const CRV = 'v-honda-crv-2026';
const applicant: CustomerFinancials = { monthlySalaryFils: bhd(1_400), existingObligationsFils: 326_753 };
const camry: TradeInRequest = { make: 'Toyota', model: 'Camry', year: 2021, mileageKm: 60_000, condition: 'good', accidentHistory: false };

const SUV = {
  bodyType: 'suv',
  condition: 'any',
  maxMonthlyFils: bhd(300),
  structure: 'murabaha',
  tenureMonths: 60,
  downPaymentFils: bhd(3_000),
  insurance: 'takaful',
};

function customer(id: string): BidCustomer {
  return bidCustomerFrom(customerOverview(newCustomerProfile(id), NOW));
}

function world() {
  let now = NOW;
  const leads: Lead[] = [];
  const bids = new SandboxBidStore({ clock: () => now, onAccepted: (l) => leads.push(l) });
  const tradeIns = new SandboxTradeInStore(() => now);
  const origination = new SandboxOriginationService(() => now);
  const ctx = (customerId: string): CarryContext => ({ customerId, bids, tradeIns, now });
  /** Posts a request, gets NMC's CR-V bid with a discount and extras, accepts it. */
  function acceptedBid(customerId: string, discountFils = bhd(500)) {
    const r = bids.post(customer(customerId), SUV);
    const bid = bids.bid('nmc', r.id, { vehicleId: CRV, discountFils, extras: ['service-1y', 'window-tint'] });
    const { request, bid: accepted } = bids.accept(r.id, customerId, bid.id);
    return { request, bid: accepted, ids: { requestId: request.id, bidId: accepted.id } };
  }
  return {
    bids,
    tradeIns,
    origination,
    leads,
    ctx,
    acceptedBid,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
      return now;
    },
    // ctx captures `now` at creation, so rebuild after advancing
    nowCtx: (customerId: string) => ({ customerId, bids, tradeIns, now }) satisfies CarryContext,
  };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CarryError);
    return (e as CarryError).code;
  }
  throw new Error('expected a CarryError');
}

function applyWith(w: ReturnType<typeof world>, customerId: string, input: Parameters<typeof resolveVehicleCarry>[0], over: Partial<ApplicationRequest> = {}) {
  const carry = resolveVehicleCarry(input, w.nowCtx(customerId));
  const req: ApplicationRequest = {
    productLine: 'vehicle',
    structure: 'murabaha',
    assetPriceFils: carry.assetPriceFils,
    downPaymentFils: carry.downPaymentFils,
    tenureMonths: 60,
    reference: input.vehicleId,
    idempotencyKey: `key-${customerId}-${Math.random().toString(36).slice(2)}`,
    ...(carry.source ? { source: carry.source, listPriceFils: carry.listPriceFils, extras: carry.extras } : {}),
    ...(carry.tradeIn ? { tradeIn: carry.tradeIn } : {}),
    ...over,
  };
  return w.origination.apply(req, applicant, customerId);
}

describe('baseline: no bid and no trade-in', () => {
  it('prices at the list price with the customer down payment, exactly as before', () => {
    const w = world();
    const carry = resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: bhd(3_000) }, w.ctx('cus_a'));
    expect(carry).toEqual({ assetPriceFils: findVehicle(CRV)!.priceFils, downPaymentFils: bhd(3_000) });
    const app = applyWith(w, 'cus_a', { vehicleId: CRV, downPaymentFils: bhd(3_000) });
    expect(app.quote).toEqual(quoteFinance({ productLine: 'vehicle', structure: 'murabaha', assetPriceFils: bhd(14_900), downPaymentFils: bhd(3_000), tenureMonths: 60 }));
    expect(app.source).toBeUndefined();
    expect(app.tradeIn).toBeUndefined();
    expect(app.extras).toBeUndefined();
    expect(app.listPriceFils).toBeUndefined();
    expect(applicationView(app).pricing).toEqual({
      listPriceFils: bhd(14_900),
      discountFils: 0,
      priceFils: bhd(14_900),
      tradeInCreditFils: 0,
      downPaymentFils: bhd(3_000),
      cashDownPaymentFils: bhd(3_000),
      extras: [],
      financedFils: bhd(11_900),
    });
  });

  it('ignores useTradeIn: false', () => {
    const w = world();
    expect(resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: bhd(3_000), useTradeIn: false }, w.ctx('cus_a')).tradeIn).toBeUndefined();
  });
});

describe('an accepted bid carried into the application', () => {
  it('prices the application at the discounted price, records the extras and shows the breakdown', () => {
    const w = world();
    const { bid, ids } = w.acceptedBid('cus_a');
    const app = applyWith(w, 'cus_a', { vehicleId: CRV, downPaymentFils: bhd(3_000), ...ids });

    expect(app.quote.assetPriceFils).toBe(bhd(14_900) - bhd(500));
    expect(app.quote.financedFils).toBe(bhd(14_400) - bhd(3_000));
    expect(app.source).toEqual({ type: 'bid', requestId: ids.requestId, bidId: ids.bidId });
    expect(app.listPriceFils).toBe(bhd(14_900));
    expect(app.extras).toEqual(['service-1y', 'window-tint']);
    // Same terms as the request: the same monthly the customer saw on the bid.
    expect(app.quote.monthlyFils).toBe(bid.pricing.monthlyFils);

    const p = applicationView(app).pricing;
    expect(p).toMatchObject({ listPriceFils: bhd(14_900), discountFils: bhd(500), priceFils: bhd(14_400), tradeInCreditFils: 0, financedFils: app.quote.financedFils });
    expect(p.extras).toEqual(['service-1y', 'window-tint']);
    for (const n of [p.listPriceFils, p.discountFils, p.priceFils, p.downPaymentFils, p.cashDownPaymentFils, p.financedFils]) expect(Number.isSafeInteger(n)).toBe(true);
  });

  it('a bid without a discount still records the extras at the list price', () => {
    const w = world();
    const { ids } = w.acceptedBid('cus_a', 0);
    const app = applyWith(w, 'cus_a', { vehicleId: CRV, downPaymentFils: bhd(3_000), ...ids });
    expect(app.quote.assetPriceFils).toBe(bhd(14_900));
    expect(applicationView(app).pricing.discountFils).toBe(0);
    expect(app.extras).toEqual(['service-1y', 'window-tint']);
  });

  it('puts the list and bid price on the dealer lead and the request view carries the apply link', () => {
    const w = world();
    const { request, ids } = w.acceptedBid('cus_a');
    expect(w.leads[0]!.bid).toEqual({ listPriceFils: bhd(14_900), priceFils: bhd(14_400), discountFils: bhd(500), extras: ['service-1y', 'window-tint'] });
    const view = bidRequestView(request);
    expect(view.accepted!.applyHref).toBe(`/cars/${CRV}?requestId=${ids.requestId}&bidId=${ids.bidId}`);
    expect(Date.parse(view.accepted!.validUntil) - Date.parse(request.closedAt!)).toBe(BID_ACCEPTED_VALIDITY_DAYS * 86_400_000);
  });

  it("refuses another customer's bid (reads as not found)", () => {
    const w = world();
    const { ids } = w.acceptedBid('cus_a');
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: bhd(3_000), ...ids }, w.ctx('cus_b')))).toBe('BID_NOT_FOUND');
  });

  it('refuses forged ids and half-given ones', () => {
    const w = world();
    const { ids } = w.acceptedBid('cus_a');
    const go = (extra: object) => codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: bhd(3_000), ...extra }, w.ctx('cus_a')));
    expect(go({ requestId: ids.requestId, bidId: 'bid_forged' })).toBe('BID_NOT_FOUND');
    expect(go({ requestId: 'breq_forged', bidId: ids.bidId })).toBe('BID_NOT_FOUND');
    expect(go({ requestId: ids.requestId })).toBe('INVALID_REQUEST');
    expect(go({ bidId: ids.bidId })).toBe('INVALID_REQUEST');
    expect(go({ requestId: 42, bidId: ids.bidId })).toBe('INVALID_REQUEST');
  });

  it('refuses a bid that was not the accepted one (a lost bid, an open request)', () => {
    const w = world();
    const r = w.bids.post(customer('cus_a'), SUV);
    const nmc = w.bids.bid('nmc', r.id, { vehicleId: CRV, discountFils: bhd(500) });
    const open = { requestId: r.id, bidId: nmc.id };
    // Still open: nothing accepted yet.
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: bhd(3_000), ...open }, w.ctx('cus_a')))).toBe('BID_NOT_ACCEPTED');
    const tac = w.bids.bid('tac', r.id, { vehicleId: 'v-nissan-patrol-2021', discountFils: bhd(2_925) });
    w.bids.accept(r.id, 'cus_a', tac.id);
    // NMC's bid is now LOST.
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: bhd(3_000), ...open }, w.ctx('cus_a')))).toBe('BID_NOT_ACCEPTED');
  });

  it('refuses a bid for another car', () => {
    const w = world();
    const { ids } = w.acceptedBid('cus_a');
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: 'v-haval-h9-2026', downPaymentFils: bhd(3_000), ...ids }, w.ctx('cus_a')))).toBe('BID_VEHICLE_MISMATCH');
  });

  it('refuses an expired accepted bid, and honours it until the validity ends', () => {
    const w = world();
    const { ids } = w.acceptedBid('cus_a');
    w.advance(BID_ACCEPTED_VALIDITY_DAYS * 86_400_000);
    expect(resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: bhd(3_000), ...ids }, w.nowCtx('cus_a')).assetPriceFils).toBe(bhd(14_400));
    w.advance(1000);
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: bhd(3_000), ...ids }, w.nowCtx('cus_a')))).toBe('BID_EXPIRED');
  });

  it('the origination service never takes a price or list price from a request that does not add up', () => {
    const w = world();
    const base: ApplicationRequest = {
      productLine: 'vehicle',
      structure: 'murabaha',
      assetPriceFils: bhd(14_400),
      downPaymentFils: bhd(3_000),
      tenureMonths: 60,
      reference: CRV,
      idempotencyKey: 'key-forged-1',
    };
    // A list price below the asset price (a "negative discount") is refused.
    expect(() => w.origination.apply({ ...base, listPriceFils: bhd(10_000) }, applicant, 'cus_a')).toThrow(OriginationError);
    // A trade-in credit above the down payment is refused.
    expect(() =>
      w.origination.apply({ ...base, idempotencyKey: 'key-forged-2', tradeIn: { offerId: 'x', offerFils: bhd(9_000), creditFils: bhd(9_000), capped: false } }, applicant, 'cus_a'),
    ).toThrow(OriginationError);
    // Bids and trade-ins are for cars only.
    expect(() =>
      w.origination.apply({ ...base, productLine: 'personal', idempotencyKey: 'key-forged-3', reference: 'personal', extras: ['full-tank'] }, applicant, 'cus_a'),
    ).toThrow(OriginationError);
  });
});

describe('the trade-in carried into the application', () => {
  it('records the credit as part of the down payment', () => {
    const w = world();
    const offer = w.tradeIns.value('cus_a', camry);
    const app = applyWith(w, 'cus_a', { vehicleId: CRV, downPaymentFils: 0, useTradeIn: true });
    const use = tradeInDownPayment(offer.offerFils, CRV, bhd(14_900));
    expect(app.tradeIn).toEqual({ offerId: offer.id, offerFils: offer.offerFils, creditFils: use.creditedFils, capped: false });
    expect(app.quote.downPaymentFils).toBe(use.downPaymentFils);
    expect(app.quote.assetPriceFils).toBe(bhd(14_900));
    const p = applicationView(app).pricing;
    expect(p.tradeInCreditFils).toBe(use.creditedFils);
    expect(p.cashDownPaymentFils).toBe(use.downPaymentFils - use.creditedFils);
    expect(p.financedFils).toBe(bhd(14_900) - use.downPaymentFils);
  });

  it('keeps extra cash the customer adds on top, but never goes below the credit', () => {
    const w = world();
    const offer = w.tradeIns.value('cus_a', camry);
    const credit = tradeInDownPayment(offer.offerFils, CRV, bhd(14_900)).downPaymentFils;
    expect(applyWith(w, 'cus_a', { vehicleId: CRV, downPaymentFils: credit + bhd(500), useTradeIn: true }).quote.downPaymentFils).toBe(credit + bhd(500));
    expect(applyWith(w, 'cus_a', { vehicleId: CRV, downPaymentFils: bhd(1), useTradeIn: true }).quote.downPaymentFils).toBe(credit);
  });

  it('caps the credit at the maximum down payment of the car', () => {
    const w = world();
    const offer = w.tradeIns.value('cus_a', camry);
    const picanto = findVehicle('v-kia-picanto-2025')!;
    const maxDown = Math.floor(picanto.priceFils * 0.9);
    expect(offer.offerFils).toBeGreaterThan(maxDown);
    const app = applyWith(w, 'cus_a', { vehicleId: picanto.id, downPaymentFils: 0, useTradeIn: true });
    expect(app.tradeIn!.capped).toBe(true);
    expect(app.tradeIn!.offerFils).toBe(offer.offerFils);
    expect(app.tradeIn!.creditFils).toBeLessThanOrEqual(maxDown);
    expect(app.quote.downPaymentFils).toBeLessThanOrEqual(maxDown);
    expect(app.quote.downPaymentFils).toBe(app.tradeIn!.creditFils);
  });

  it('refuses an expired offer (TRADE_IN_EXPIRED) and a missing one (NO_TRADE_IN)', () => {
    const w = world();
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: 0, useTradeIn: true }, w.ctx('cus_a')))).toBe('NO_TRADE_IN');
    const offer = w.tradeIns.value('cus_a', camry);
    // Valid through the 7th Bahrain day after the valuation; one more day and it is gone.
    w.advance(8 * 86_400_000);
    expect(w.tradeIns.active('cus_a')).toBeUndefined();
    expect(w.tradeIns.latest('cus_a')).toMatchObject({ offer: { id: offer.id }, active: false });
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: 0, useTradeIn: true }, w.nowCtx('cus_a')))).toBe('TRADE_IN_EXPIRED');
  });

  it("never uses another customer's offer, and checks a named offer id", () => {
    const w = world();
    const offer = w.tradeIns.value('cus_a', camry);
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: 0, useTradeIn: true }, w.ctx('cus_b')))).toBe('NO_TRADE_IN');
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: 0, useTradeIn: true, tradeInOfferId: 'ti_forged' }, w.ctx('cus_a')))).toBe('TRADE_IN_MISMATCH');
    expect(resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: 0, useTradeIn: true, tradeInOfferId: offer.id }, w.ctx('cus_a')).tradeIn?.offerId).toBe(offer.id);
    expect(codeOf(() => resolveVehicleCarry({ vehicleId: CRV, downPaymentFils: 0, useTradeIn: 'yes' }, w.ctx('cus_a')))).toBe('INVALID_REQUEST');
  });
});

describe('credit queue view', () => {
  it('shows list price versus bid price and the trade-in credit only for carried applications', () => {
    const w = world();
    const { ids } = w.acceptedBid('cus_a');
    w.tradeIns.value('cus_a', camry);
    const carried = applyWith(w, 'cus_a', { vehicleId: CRV, downPaymentFils: bhd(3_000), useTradeIn: true, ...ids });
    const deal = referredApplicationView(carried, 'credit_officer').deal!;
    expect(deal).toMatchObject({ fromBid: true, listPriceFils: bhd(14_900), priceFils: bhd(14_400), discountFils: bhd(500) });
    expect(deal.tradeInCreditFils).toBe(carried.tradeIn!.creditFils);
    const plain = applyWith(w, 'cus_b', { vehicleId: CRV, downPaymentFils: bhd(3_000) });
    expect(referredApplicationView(plain, 'credit_officer').deal).toBeUndefined();
  });
});

describe('a bid and a trade-in together', () => {
  it('credits the trade-in against the discounted price', () => {
    const w = world();
    const { ids } = w.acceptedBid('cus_a');
    const offer = w.tradeIns.value('cus_a', camry);
    const app = applyWith(w, 'cus_a', { vehicleId: CRV, downPaymentFils: bhd(3_000), useTradeIn: true, ...ids });
    const use = tradeInDownPayment(offer.offerFils, CRV, bhd(14_400));
    expect(app.quote.assetPriceFils).toBe(bhd(14_400));
    expect(app.quote.downPaymentFils).toBe(Math.max(bhd(3_000), use.downPaymentFils));
    const p = applicationView(app).pricing;
    expect(p.discountFils).toBe(bhd(500));
    expect(p.tradeInCreditFils).toBe(use.creditedFils);
    expect(p.financedFils).toBe(bhd(14_400) - app.quote.downPaymentFils);
    expect(applicationPricing(app)).toEqual(p);
  });

  it('decides on the discounted amount', () => {
    const w = world();
    const { ids } = w.acceptedBid('cus_a');
    const app = applyWith(w, 'cus_a', { vehicleId: CRV, downPaymentFils: bhd(3_000), ...ids });
    expect(app.decision).toEqual(decide(app, applicant));
    expect(app.decision!.monthlyFils).toBe(app.quote.monthlyFils);
  });
});
