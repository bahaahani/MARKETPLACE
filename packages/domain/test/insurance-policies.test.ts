import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  bahrainToday,
  bhd,
  DEMO_HOME_PLANS,
  DEMO_TRAVEL_PLANS,
  demoPolicyHistory,
  homePremium,
  homeQuotes,
  InsuranceQuoteError,
  isIsoDate,
  MAX_TRIP_DAYS,
  oneYearEndIso,
  POLICY_QUOTE_TTL_MS,
  PolicyError,
  pricePolicyQuote,
  SandboxPaymentGateway,
  SandboxPolicyStore,
  travelPremium,
  travelQuotes,
  validateTravelInput,
  withTravelDefaults,
  type Payment,
  type PolicyQuoteRequest,
  type TravelQuoteInput,
} from '../src';

// 2026-10-03 22:30 UTC is already 2026-10-04 in Bahrain (UTC+3).
const NOW = new Date(Date.UTC(2026, 9, 3, 22, 30));
const TODAY = '2026-10-04';

const trip: TravelQuoteInput = { region: 'worldwide-excl-us-ca', tier: 'basic', startDate: '2026-10-10', endDate: '2026-10-16', adults: 2, children: 1 };

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe('dates', () => {
  it('uses the Bahrain calendar date', () => {
    expect(bahrainToday(NOW)).toBe(TODAY);
    expect(bahrainToday(new Date(Date.UTC(2026, 9, 3, 20, 59)))).toBe('2026-10-03');
  });
  it('validates ISO dates and one-year periods', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-1-01')).toBe(false);
    expect(oneYearEndIso('2026-10-04')).toBe('2027-10-03');
    expect(oneYearEndIso('2028-02-29')).toBe('2029-02-28');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('travel quotes', () => {
  it('prices daily rate × days × (adults + children/2), cheapest first', () => {
    const quotes = travelQuotes(trip, NOW);
    expect(quotes).toHaveLength(4);
    expect(quotes.map((q) => q.premiumFils)).toEqual([...quotes.map((q) => q.premiumFils)].sort((a, b) => a - b));
    const awal = quotes.find((q) => q.insurerId === 'awal-takaful')!;
    // 1.050 × 7 days × 2.5 travellers = BHD 18.375
    expect(awal.days).toBe(7);
    expect(awal.premiumFils).toBe(18_375);
    expect(quotes[0]!.insurerId).toBe('awal-takaful');
    expect(awal.schengenCompliant).toBe(true);
  });

  it('applies the Plus tier percentage and the insurer minimum', () => {
    const pearl = DEMO_TRAVEL_PLANS.find((p) => p.insurerId === 'pearl-takaful')!;
    // 1.150 × 7 × 2.5 × 150% = 30.1875 → 30.188 (rounded once, at the end)
    expect(travelPremium(pearl, { ...trip, tier: 'plus' }, 7)).toBe(30_188);
    // One adult, one day in the GCC: 0.450 < BHD 3 minimum
    expect(travelPremium(pearl, { region: 'gcc', tier: 'basic', adults: 1, children: 0 }, 1)).toBe(bhd(3));
  });

  it('is deterministic and integer for every region, tier and trip length', () => {
    for (const region of ['gcc', 'worldwide-excl-us-ca', 'worldwide'] as const) {
      for (const tier of ['basic', 'plus'] as const) {
        for (const days of [1, 7, 30, MAX_TRIP_DAYS]) {
          const input = { ...trip, region, tier, endDate: addDaysIso(trip.startDate, days - 1), adults: 6, children: 8 };
          const a = travelQuotes(input, NOW);
          expect(a).toEqual(travelQuotes(input, NOW));
          for (const q of a) expect(Number.isSafeInteger(q.premiumFils)).toBe(true);
        }
      }
    }
    // Worldwide incl. US/Canada costs more than excluding them, which costs more than the GCC.
    const cheapest = (region: TravelQuoteInput['region']) => travelQuotes({ ...trip, region }, NOW)[0]!.premiumFils;
    expect(cheapest('gcc')).toBeLessThan(cheapest('worldwide-excl-us-ca'));
    expect(cheapest('worldwide-excl-us-ca')).toBeLessThan(cheapest('worldwide'));
  });

  it('filters Takaful operators only', () => {
    const q = travelQuotes({ ...trip, takafulOnly: true }, NOW);
    expect(q.map((x) => x.insurerId).sort()).toEqual(['awal-takaful', 'pearl-takaful']);
    expect(q.every((x) => x.takaful)).toBe(true);
  });

  it('GCC trips are not Schengen compliant', () => {
    expect(travelQuotes({ ...trip, region: 'gcc' }, NOW).every((q) => !q.schengenCompliant)).toBe(true);
  });

  it('validates dates against today in Bahrain', () => {
    expect(validateTravelInput({ ...trip, startDate: TODAY, endDate: TODAY }, NOW)).toBe(1);
    expect(code(() => travelQuotes({ ...trip, startDate: '2026-10-03', endDate: '2026-10-05' }, NOW))).toBe('INVALID_DATES');
    expect(code(() => travelQuotes({ ...trip, startDate: '2026-10-10', endDate: '2026-10-09' }, NOW))).toBe('INVALID_DATES');
    expect(code(() => travelQuotes({ ...trip, startDate: '2026-13-01' }, NOW))).toBe('INVALID_DATES');
    expect(code(() => travelQuotes({ ...trip, startDate: addDaysIso(TODAY, 366), endDate: addDaysIso(TODAY, 370) }, NOW))).toBe('INVALID_DATES');
    expect(validateTravelInput({ ...trip, endDate: addDaysIso(trip.startDate, MAX_TRIP_DAYS - 1) }, NOW)).toBe(180);
    expect(code(() => travelQuotes({ ...trip, endDate: addDaysIso(trip.startDate, MAX_TRIP_DAYS) }, NOW))).toBe('TRIP_TOO_LONG');
  });

  it('validates traveller counts and options', () => {
    expect(code(() => travelQuotes({ ...trip, adults: 0 }, NOW))).toBe('INVALID_TRAVELLERS');
    expect(code(() => travelQuotes({ ...trip, adults: 7 }, NOW))).toBe('INVALID_TRAVELLERS');
    expect(code(() => travelQuotes({ ...trip, adults: 1.5 }, NOW))).toBe('INVALID_TRAVELLERS');
    expect(code(() => travelQuotes({ ...trip, children: -1 }, NOW))).toBe('INVALID_TRAVELLERS');
    expect(code(() => travelQuotes({ ...trip, children: 9 }, NOW))).toBe('INVALID_TRAVELLERS');
    expect(code(() => travelQuotes({ ...trip, region: 'mars' as never }, NOW))).toBe('INVALID_REQUEST');
    expect(code(() => travelQuotes({ ...trip, tier: 'gold' as never }, NOW))).toBe('INVALID_REQUEST');
    expect(() => travelQuotes({ ...trip, adults: 0 }, NOW)).toThrow(InsuranceQuoteError);
  });
});

describe('home quotes', () => {
  it('prices building and contents per insurer, cheapest first', () => {
    const { input, quotes } = homeQuotes({ propertyType: 'villa', buildingSumInsuredFils: bhd(150_000), contentsSumInsuredFils: bhd(20_000) });
    expect(input).toEqual({ propertyType: 'villa', buildingSumInsuredFils: bhd(150_000), contentsSumInsuredFils: bhd(20_000) });
    expect(quotes).toHaveLength(4);
    expect(quotes.map((q) => q.annualPremiumFils)).toEqual([...quotes.map((q) => q.annualPremiumFils)].sort((a, b) => a - b));
    // Dilmun: 150,000 × 0.07% + 20,000 × 0.32% = 105 + 64 = BHD 169
    expect(quotes.find((q) => q.insurerId === 'dilmun-insurance')!.annualPremiumFils).toBe(bhd(169));
  });

  it('adjusts by property type and respects the minimum premium', () => {
    const pearl = DEMO_HOME_PLANS.find((p) => p.insurerId === 'pearl-takaful')!;
    const sums = { buildingSumInsuredFils: bhd(100_000), contentsSumInsuredFils: bhd(10_000) };
    // (100,000 × 0.08% + 10,000 × 0.30%) = 110; office ×125% = 137.5; apartment ×90% = 99
    expect(homePremium(pearl, { propertyType: 'villa', ...sums })).toBe(bhd(110));
    expect(homePremium(pearl, { propertyType: 'office', ...sums })).toBe(bhd(137.5));
    expect(homePremium(pearl, { propertyType: 'apartment', ...sums })).toBe(bhd(99));
    expect(homePremium(pearl, { propertyType: 'apartment', buildingSumInsuredFils: 0, contentsSumInsuredFils: bhd(2_000) })).toBe(bhd(40));
  });

  it('filters Takaful only; temporary accommodation needs building cover', () => {
    const { quotes } = homeQuotes({ propertyType: 'apartment', buildingSumInsuredFils: 0, contentsSumInsuredFils: bhd(15_000), takafulOnly: true });
    expect(quotes.every((q) => q.takaful)).toBe(true);
    expect(quotes.some((q) => q.temporaryAccommodation)).toBe(false);
  });

  it('validates sums insured as integer fils within bounds', () => {
    const base = { propertyType: 'villa' as const, buildingSumInsuredFils: bhd(100_000), contentsSumInsuredFils: 0 };
    expect(code(() => homeQuotes({ ...base, buildingSumInsuredFils: 0 }))).toBe('INVALID_SUM_INSURED');
    expect(code(() => homeQuotes({ ...base, buildingSumInsuredFils: bhd(9_999) }))).toBe('INVALID_SUM_INSURED');
    expect(code(() => homeQuotes({ ...base, buildingSumInsuredFils: bhd(2_000_001) }))).toBe('INVALID_SUM_INSURED');
    expect(code(() => homeQuotes({ ...base, contentsSumInsuredFils: bhd(500) }))).toBe('INVALID_SUM_INSURED');
    expect(code(() => homeQuotes({ ...base, contentsSumInsuredFils: bhd(250_001) }))).toBe('INVALID_SUM_INSURED');
    expect(code(() => homeQuotes({ ...base, buildingSumInsuredFils: 100_000.5 }))).toBe('INVALID_SUM_INSURED');
    expect(code(() => homeQuotes({ ...base, buildingSumInsuredFils: Number.MAX_SAFE_INTEGER + 1 }))).toBe('INVALID_SUM_INSURED');
    expect(code(() => homeQuotes({ ...base, propertyType: 'castle' as never }))).toBe('INVALID_REQUEST');
    expect(code(() => homeQuotes({ ...base, propertyType: 'land' }))).toBe('PROPERTY_NOT_INSURABLE');
  });

  it('links to a property listing and suggests sums insured from it', () => {
    const villa = homeQuotes({ propertyId: 'p-saar-villa-4br' });
    // 60% of BHD 235,000 = 141,000 rebuild cost; 4 bedrooms of contents
    expect(villa.input).toMatchObject({ propertyType: 'villa', buildingSumInsuredFils: bhd(141_000), contentsSumInsuredFils: bhd(17_500), propertyId: 'p-saar-villa-4br' });
    expect(villa.quotes.every((q) => q.propertyId === 'p-saar-villa-4br')).toBe(true);
    // Rentals insure contents only
    expect(homeQuotes({ propertyId: 'p-seef-apt-1br' }).input).toMatchObject({ buildingSumInsuredFils: 0, contentsSumInsuredFils: bhd(10_000) });
    // Explicit sums win over suggestions
    expect(homeQuotes({ propertyId: 'p-saar-villa-4br', buildingSumInsuredFils: bhd(200_000), contentsSumInsuredFils: 0 }).input.buildingSumInsuredFils).toBe(bhd(200_000));
    expect(code(() => homeQuotes({ propertyId: 'p-nope' }))).toBe('PROPERTY_NOT_FOUND');
    expect(code(() => homeQuotes({ propertyId: 'p-hamala-land' }))).toBe('PROPERTY_NOT_INSURABLE');
    expect(code(() => homeQuotes({ propertyId: 'p-saar-villa-4br', propertyType: 'apartment' }))).toBe('INVALID_REQUEST');
  });
});

describe('policy binding', () => {
  const CUSTOMER = 'demo-customer';
  const travelReq: PolicyQuoteRequest = { line: 'travel', insurerId: 'pearl-takaful', input: trip };

  function setup() {
    let t = NOW.getTime();
    const clock = () => new Date((t += 1000));
    const store = new SandboxPolicyStore(clock);
    const gateway = new SandboxPaymentGateway();
    const advance = (ms: number) => (t += ms);
    return { store, gateway, advance };
  }

  async function pay(gateway: SandboxPaymentGateway, amountFils: number, reference: string, opts: { capture?: boolean; purpose?: Payment['purpose'] } = {}) {
    const p = await gateway.createCharge({ amountFils, method: 'benefitpay', purpose: opts.purpose ?? 'insurance_premium', reference, idempotencyKey: `key-${reference}-${amountFils}-${opts.purpose ?? ''}` });
    // The gateway stamps the real time; the policy store runs on the pinned clock (NOW), so stamp NOW as well.
    const stamped = { ...p, createdAt: NOW.toISOString() };
    return opts.capture === false ? stamped : { ...(await gateway.confirm(p.id)), createdAt: stamped.createdAt };
  }

  it('re-prices the chosen insurer server-side', () => {
    const { store } = setup();
    const q = store.createQuote(CUSTOMER, travelReq);
    expect(q.id).toMatch(/^pq_sbx_/);
    expect(q.premiumFils).toBe(travelQuotes(trip, NOW).find((x) => x.insurerId === 'pearl-takaful')!.premiumFils);
    expect(q).toMatchObject({ line: 'travel', startDate: trip.startDate, endDate: trip.endDate, takaful: true });
    expect(Date.parse(q.expiresAt) - Date.parse(q.createdAt)).toBe(POLICY_QUOTE_TTL_MS);
  });

  it('applies the same travel defaults as the quote endpoint (Basic, one adult, no children)', () => {
    const { store } = setup();
    const q = store.createQuote(CUSTOMER, { line: 'travel', insurerId: 'awal-takaful', input: { region: 'gcc', startDate: '2026-10-10', endDate: '2026-10-11' } });
    expect(q.cover).toMatchObject({ tier: 'basic', adults: 1, children: 0, days: 2 });
    expect(q.premiumFils).toBe(travelQuotes(withTravelDefaults({ region: 'gcc', startDate: '2026-10-10', endDate: '2026-10-11' }), NOW)[0]!.premiumFils);
  });

  it('motor and home policies run one year from today', () => {
    const motor = pricePolicyQuote({ line: 'motor', insurerId: 'dilmun-insurance', input: { vehicleValueFils: bhd(14_900), cover: 'comprehensive', reference: '123456' } }, NOW);
    expect(motor).toMatchObject({ startDate: TODAY, endDate: '2027-10-03', premiumFils: Math.round((bhd(14_900) * 2.3) / 100) });
    const home = pricePolicyQuote({ line: 'home', insurerId: 'awal-takaful', input: { propertyId: 'p-saar-villa-4br' } as never }, NOW);
    expect(home).toMatchObject({ startDate: TODAY, endDate: '2027-10-03', cover: { line: 'home', propertyId: 'p-saar-villa-4br' } });
  });

  it('rejects unknown lines, insurers and invalid inputs', () => {
    const { store } = setup();
    expect(code(() => store.createQuote(CUSTOMER, { ...travelReq, line: 'pet' as never }))).toBe('INVALID_REQUEST');
    expect(code(() => store.createQuote(CUSTOMER, { ...travelReq, insurerId: 'acme' }))).toBe('INSURER_NOT_FOUND');
    expect(code(() => store.createQuote(CUSTOMER, { ...travelReq, input: { ...trip, adults: 0 } }))).toBe('INVALID_TRAVELLERS');
    // Agency repair is required for this motor quote but Dilmun does not offer it.
    expect(code(() => store.createQuote(CUSTOMER, { line: 'motor', insurerId: 'dilmun-insurance', input: { vehicleValueFils: bhd(10_000), cover: 'comprehensive', agencyRepair: true, reference: 'x' } }))).toBe(
      'INSURER_NOT_FOUND',
    );
    expect(code(() => store.createQuote(CUSTOMER, { line: 'motor', insurerId: 'dilmun-insurance', input: { vehicleValueFils: -1, cover: 'comprehensive', reference: 'x' } }))).toBe('INVALID_REQUEST');
  });

  it('issues an ACTIVE policy for a captured payment of the exact premium, once', async () => {
    const { store, gateway } = setup();
    const q = store.createQuote(CUSTOMER, travelReq);
    const payment = await pay(gateway, q.premiumFils, q.id);
    const policy = store.confirm(CUSTOMER, payment, q.id);
    expect(policy).toMatchObject({ status: 'ACTIVE', line: 'travel', premiumFils: q.premiumFils, paymentId: payment.id, quoteId: q.id, startDate: trip.startDate });
    expect(policy.policyNumber).toBe('SBX-TRV-26-000001');
    // Idempotent for the same payment
    expect(store.confirm(CUSTOMER, payment)).toEqual(policy);
    expect(store.list(CUSTOMER)).toHaveLength(1);
    expect(store.getQuote(q.id)!.policyId).toBe(policy.id);
  });

  it('refuses an amount that does not match the premium (422 AMOUNT_MISMATCH)', async () => {
    const { store, gateway } = setup();
    const q = store.createQuote(CUSTOMER, travelReq);
    for (const amount of [q.premiumFils - 1, q.premiumFils + 1, 1]) {
      const payment = await pay(gateway, amount, q.id);
      expect(() => store.confirm(CUSTOMER, payment)).toThrow(PolicyError);
      expect(code(() => store.confirm(CUSTOMER, payment))).toBe('AMOUNT_MISMATCH');
    }
    expect(store.list(CUSTOMER)).toEqual([]);
  });

  it('refuses a payment that is not captured (409)', async () => {
    const { store, gateway } = setup();
    const q = store.createQuote(CUSTOMER, travelReq);
    const payment = await pay(gateway, q.premiumFils, q.id, { capture: false });
    expect(payment.status).toBe('INITIATED');
    expect(code(() => store.confirm(CUSTOMER, payment))).toBe('PAYMENT_NOT_CAPTURED');
    // ...and binds once it is captured
    expect(store.confirm(CUSTOMER, { ...(await gateway.confirm(payment.id)), createdAt: payment.createdAt }).status).toBe('ACTIVE');
  });

  it('refuses the wrong purpose, reference, customer or a missing payment', async () => {
    const { store, gateway } = setup();
    const q = store.createQuote(CUSTOMER, travelReq);
    expect(code(() => store.confirm(CUSTOMER, undefined))).toBe('PAYMENT_NOT_FOUND');
    const installment = await pay(gateway, q.premiumFils, q.id, { purpose: 'installment' });
    expect(code(() => store.confirm(CUSTOMER, installment))).toBe('PAYMENT_MISMATCH');
    const other = await pay(gateway, q.premiumFils, 'pq_unknown');
    expect(code(() => store.confirm(CUSTOMER, other))).toBe('QUOTE_NOT_FOUND');
    const right = await pay(gateway, q.premiumFils, q.id);
    expect(code(() => store.confirm(CUSTOMER, right, 'pq_other'))).toBe('PAYMENT_MISMATCH');
    expect(code(() => store.confirm('someone-else', right))).toBe('QUOTE_NOT_FOUND');
  });

  it('a quote binds to one payment only (409 ALREADY_BOUND)', async () => {
    const { store, gateway } = setup();
    const q = store.createQuote(CUSTOMER, travelReq);
    store.confirm(CUSTOMER, await pay(gateway, q.premiumFils, q.id));
    const second = await gateway.confirm(
      (await gateway.createCharge({ amountFils: q.premiumFils, method: 'card', purpose: 'insurance_premium', reference: q.id, idempotencyKey: 'second-payment' })).id,
    );
    expect(code(() => store.confirm(CUSTOMER, { ...second, createdAt: NOW.toISOString() }))).toBe('ALREADY_BOUND');
  });

  it('refuses a payment made after the quote expired (410)', async () => {
    const { store, gateway } = setup();
    const q = store.createQuote(CUSTOMER, travelReq);
    const payment = await pay(gateway, q.premiumFils, q.id);
    const late: Payment = { ...payment, createdAt: new Date(Date.parse(q.expiresAt) + 1).toISOString() };
    expect(code(() => store.confirm(CUSTOMER, late))).toBe('QUOTE_EXPIRED');
  });

  it('lists active policies first and derives EXPIRED from the end date', async () => {
    const { store, gateway, advance } = setup();
    store.seed(demoPolicyHistory(CUSTOMER));
    const q = store.createQuote(CUSTOMER, { line: 'home', insurerId: 'pearl-takaful', input: { propertyType: 'apartment', buildingSumInsuredFils: 0, contentsSumInsuredFils: bhd(12_000) } });
    store.confirm(CUSTOMER, await pay(gateway, q.premiumFils, q.id));
    expect(store.list(CUSTOMER).map((p) => [p.line, p.status])).toEqual([
      ['home', 'ACTIVE'],
      ['travel', 'EXPIRED'],
    ]);
    expect(store.list(CUSTOMER)[1]!.premiumFils).toBe(bhd(9)); // 0.450 × 8 days × 2.5 travellers
    advance(366 * 24 * 60 * 60 * 1000);
    expect(store.list(CUSTOMER).every((p) => p.status === 'EXPIRED')).toBe(true);
  });
});
