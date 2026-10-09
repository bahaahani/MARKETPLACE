import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../i18n/en.json';
import ar from '../../i18n/ar.json';
import {
  ageOnIso,
  bhd,
  clientConfig,
  DEMO_INSURERS,
  DEMO_LIFE_PLANS,
  DEMO_MEDICAL_PLANS,
  dateOfBirthForAge,
  demoCustomer,
  deriveNotifications,
  INSURANCE_LINES,
  insuranceRules,
  lifeAgePct,
  lifePremium,
  lifeQuotes,
  LIFE_AGE_BANDS,
  LIFE_MAX_SUM_ASSURED_FILS,
  LIFE_MIN_SUM_ASSURED_FILS,
  maxLifeTermYears,
  MEDICAL_AGE_BANDS,
  MEDICAL_TIER_COVER,
  MEDICAL_TIERS,
  medicalAgePct,
  medicalPremium,
  medicalQuotes,
  PolicyError,
  pricePolicyQuote,
  SandboxPaymentGateway,
  SandboxPolicyStore,
  validateLifeInput,
  validateMedicalInput,
  withLifeDefaults,
  withMedicalDefaults,
  type LifeQuoteInput,
  type MedicalQuoteInput,
  type Policy,
} from '../src';

// 2026-10-03 22:30 UTC is already 2026-10-04 in Bahrain (UTC+3).
const NOW = new Date(Date.UTC(2026, 9, 3, 22, 30));
const TODAY = '2026-10-04';
const dob = (age: number) => dateOfBirthForAge(age, TODAY);

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

const medical = (over: Partial<MedicalQuoteInput> = {}): MedicalQuoteInput =>
  withMedicalDefaults({ primaryDateOfBirth: dob(35), nationality: 'expat', ...over });
const life = (over: Partial<LifeQuoteInput> = {}): LifeQuoteInput =>
  withLifeDefaults({ dateOfBirth: dob(35), sumAssuredFils: bhd(100_000), termYears: 20, ...over });

describe('age helpers (Bahrain date)', () => {
  it('counts whole years on the day', () => {
    expect(ageOnIso('1991-10-04', TODAY)).toBe(35);
    expect(ageOnIso('1991-10-05', TODAY)).toBe(34);
    expect(ageOnIso('2026-10-04', TODAY)).toBe(0);
    expect(dob(35)).toBe('1991-10-04');
    expect(ageOnIso(dob(64), TODAY)).toBe(64);
    // 29 Feb has no equivalent in a non-leap year: the 28th gives the same age.
    expect(dateOfBirthForAge(1, '2028-02-29')).toBe('2027-02-28');
    expect(ageOnIso(dateOfBirthForAge(1, '2028-02-29'), '2028-02-29')).toBe(1);
  });

  it('uses the Bahrain calendar day, not UTC', () => {
    // A person born on 2008-10-04 turns 18 on 4 Oct in Bahrain even while it is still 3 Oct in UTC.
    const bahrainMorning = new Date(Date.UTC(2026, 9, 3, 22, 30));
    expect(code(() => medicalQuotes(medical({ primaryDateOfBirth: '2008-10-04' }), bahrainMorning))).toBeUndefined();
    expect(code(() => medicalQuotes(medical({ primaryDateOfBirth: '2008-10-05' }), bahrainMorning))).toBe('INVALID_MEMBERS');
  });
});

describe('medical members', () => {
  it('accepts a primary adult of 18 to 64, an optional spouse and up to 5 children aged 0 to 17', () => {
    expect(validateMedicalInput(medical({ primaryDateOfBirth: dob(18) }), NOW)).toEqual([18]);
    expect(validateMedicalInput(medical({ primaryDateOfBirth: dob(64) }), NOW)).toEqual([64]);
    const family = medical({ spouseDateOfBirth: dob(33), childrenDatesOfBirth: [dob(0), dob(3), dob(8), dob(12), dob(17)] });
    expect(validateMedicalInput(family, NOW)).toEqual([35, 33, 0, 3, 8, 12, 17]);
    const quotes = medicalQuotes(family, NOW);
    expect(quotes[0]).toMatchObject({ adults: 2, children: 5 });
  });

  it('rejects ages and counts outside the limits (INVALID_MEMBERS)', () => {
    const bad = (over: Partial<MedicalQuoteInput>) => code(() => medicalQuotes(medical(over), NOW));
    expect(bad({ primaryDateOfBirth: dob(17) })).toBe('INVALID_MEMBERS');
    expect(bad({ primaryDateOfBirth: dob(65) })).toBe('INVALID_MEMBERS');
    expect(bad({ spouseDateOfBirth: dob(17) })).toBe('INVALID_MEMBERS');
    expect(bad({ spouseDateOfBirth: dob(65) })).toBe('INVALID_MEMBERS');
    expect(bad({ childrenDatesOfBirth: [dob(18)] })).toBe('INVALID_MEMBERS');
    expect(bad({ childrenDatesOfBirth: Array(6).fill(dob(4)) })).toBe('INVALID_MEMBERS');
    expect(bad({ childrenDatesOfBirth: ['2030-01-01'] })).toBe('INVALID_MEMBERS');
    expect(bad({ primaryDateOfBirth: '1990-02-30' })).toBe('INVALID_MEMBERS');
    expect(bad({ primaryDateOfBirth: undefined as never })).toBe('INVALID_MEMBERS');
    expect(bad({ childrenDatesOfBirth: 'x' as never })).toBe('INVALID_MEMBERS');
  });

  it('rejects an unknown tier or nationality and a non-boolean declaration (INVALID_REQUEST)', () => {
    expect(code(() => medicalQuotes(medical({ tier: 'gold' as never }), NOW))).toBe('INVALID_REQUEST');
    expect(code(() => medicalQuotes({ ...medical(), nationality: undefined as never }, NOW))).toBe('INVALID_REQUEST');
    expect(code(() => medicalQuotes({ ...medical(), preExistingConditions: 'yes' as never }, NOW))).toBe('INVALID_REQUEST');
  });
});

describe('medical premium', () => {
  it('covers every age from 0 to 64 with a band, bands rise with age and children are cheaper than adults', () => {
    for (let age = 0; age <= 64; age++) expect(medicalAgePct(age)).toBeGreaterThan(0);
    const adults = MEDICAL_AGE_BANDS.filter((b) => b.minAge >= 18).map((b) => b.pct);
    expect(adults).toEqual([...adults].sort((a, b) => a - b));
    expect(medicalAgePct(10)).toBeLessThan(medicalAgePct(18));
    expect(code(() => medicalAgePct(65))).toBe('INVALID_MEMBERS');
  });

  it('prices base × Σ age % × nationality %, rounded to the fils once', () => {
    const pearl = DEMO_MEDICAL_PLANS.find((p) => p.insurerId === 'pearl-takaful')!;
    // adult 35 (120%) + child 5 (60%) on Basic, expat: 210 BHD × 1.8
    expect(medicalPremium(pearl, { tier: 'basic', nationality: 'expat', preExistingConditions: false }, [35, 5]).premiumFils).toBe(378_000);
    // Bahraini band 85%: 210,000 × 180 × 85 / 10,000 = 321,300... exact, no fraction
    expect(medicalPremium(pearl, { tier: 'basic', nationality: 'bahraini', preExistingConditions: false }, [35, 5]).premiumFils).toBe(321_300);
    // A fractional result is rounded once, at the end: 390,000 × 230 × 85 / 10,000 = 762,450 exactly; use 3 members for a fraction
    const awal = DEMO_MEDICAL_PLANS.find((p) => p.insurerId === 'awal-takaful')!;
    const p = medicalPremium(awal, { tier: 'enhanced', nationality: 'bahraini', preExistingConditions: false }, [27, 3, 3]).premiumFils;
    expect(p).toBe(Math.round((390_000 * (100 + 60 + 60) * 85) / 10_000));
    expect(Number.isSafeInteger(p)).toBe(true);
  });

  it('Basic < Enhanced < Premium at every insurer, for every member mix', () => {
    for (const plan of DEMO_MEDICAL_PLANS) {
      expect(plan.adultBaseFils.basic).toBeLessThan(plan.adultBaseFils.enhanced);
      expect(plan.adultBaseFils.enhanced).toBeLessThan(plan.adultBaseFils.premium);
    }
    const prices = (tier: MedicalQuoteInput['tier']) => medicalQuotes(medical({ tier, spouseDateOfBirth: dob(33), childrenDatesOfBirth: [dob(4)] }), NOW);
    for (const insurer of DEMO_INSURERS) {
      const [b, e, p] = (['basic', 'enhanced', 'premium'] as const).map((t) => prices(t).find((q) => q.insurerId === insurer.id)!.annualPremiumFils);
      expect(b!).toBeLessThan(e!);
      expect(e!).toBeLessThan(p!);
    }
  });

  it('tier features get richer with the tier', () => {
    const [b, e, p] = MEDICAL_TIERS.map((t) => MEDICAL_TIER_COVER[t]);
    expect(b!.annualLimitFils).toBeLessThan(e!.annualLimitFils);
    expect(e!.annualLimitFils).toBeLessThan(p!.annualLimitFils);
    expect([b!.coPayPct, e!.coPayPct, p!.coPayPct]).toEqual([20, 10, 0]);
    expect(b!.maternityWaitingMonths).toBeNull();
    expect(e!.maternityWaitingMonths).toBe(12);
    expect(p!.maternityWaitingMonths).toBe(9);
    expect([b!.dental, e!.dental, p!.dental]).toEqual([false, true, true]);
    expect([b!.optical, e!.optical, p!.optical]).toEqual([false, false, true]);
    expect(medicalQuotes(medical({ tier: 'premium' }), NOW)[0]).toMatchObject({ inpatient: true, outpatient: true, dental: true, optical: true, coPayPct: 0 });
  });

  it('is monotonic: older, more members, expatriate band cost at least as much', () => {
    const premium = (over: Partial<MedicalQuoteInput>, id = 'pearl-takaful') => medicalQuotes(medical(over), NOW).find((q) => q.insurerId === id)!.annualPremiumFils;
    let last = 0;
    for (let age = 18; age <= 64; age++) {
      const p = premium({ primaryDateOfBirth: dob(age) });
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    const kids: string[] = [];
    last = premium({});
    for (let i = 0; i < 5; i++) {
      kids.push(dob(2 + i));
      const p = premium({ childrenDatesOfBirth: [...kids] });
      expect(p).toBeGreaterThan(last);
      last = p;
    }
    expect(premium({ spouseDateOfBirth: dob(30) })).toBeGreaterThan(premium({}));
    expect(premium({ nationality: 'bahraini' })).toBeLessThan(premium({ nationality: 'expat' }));
  });

  it('lists cheapest first and filters Takaful operators', () => {
    const all = medicalQuotes(medical(), NOW);
    expect(all).toHaveLength(4);
    expect(all.map((q) => q.annualPremiumFils)).toEqual(all.map((q) => q.annualPremiumFils).sort((a, b) => a - b));
    const takaful = medicalQuotes(medical({ takafulOnly: true }), NOW);
    expect(takaful.map((q) => q.insurerId).sort()).toEqual(['awal-takaful', 'pearl-takaful']);
    expect(takaful.every((q) => q.takaful)).toBe(true);
  });

  it('a pre-existing declaration adds an indicative surcharge or refers the quote; it never declines', () => {
    const clean = medicalQuotes(medical(), NOW);
    const declared = medicalQuotes(medical({ preExistingConditions: true }), NOW);
    expect(declared).toHaveLength(4);
    for (const q of declared) {
      const before = clean.find((c) => c.insurerId === q.insurerId)!;
      if (q.insurerId === 'pearl-takaful' || q.insurerId === 'awal-takaful') {
        expect(q.preExistingStatus).toBe('surcharge');
        expect(q.buyable).toBe(true);
        expect(q.annualPremiumFils).toBeGreaterThan(before.annualPremiumFils);
        expect(q.preExistingSurchargeFils).toBe(q.annualPremiumFils - before.annualPremiumFils);
      } else {
        expect(q.preExistingStatus).toBe('referred');
        expect(q.buyable).toBe(false);
        expect(q.preExistingSurchargeFils).toBe(0);
        expect(q.annualPremiumFils).toBe(before.annualPremiumFils);
      }
    }
    expect(clean.every((q) => q.preExistingStatus === 'none' && q.buyable)).toBe(true);
  });
});

describe('life quotes', () => {
  it('validates age 18 to 65 on the Bahrain date', () => {
    expect(validateLifeInput(life({ dateOfBirth: dob(18), termYears: 10 }), NOW)).toBe(18);
    expect(validateLifeInput(life({ dateOfBirth: dob(65), termYears: 5 }), NOW)).toBe(65);
    expect(code(() => lifeQuotes(life({ dateOfBirth: dob(17) }), NOW))).toBe('INVALID_AGE');
    expect(code(() => lifeQuotes(life({ dateOfBirth: dob(66), termYears: 5 }), NOW))).toBe('INVALID_AGE');
    expect(code(() => lifeQuotes(life({ dateOfBirth: '2030-01-01' }), NOW))).toBe('INVALID_AGE');
    expect(code(() => lifeQuotes(life({ dateOfBirth: 'nope' }), NOW))).toBe('INVALID_AGE');
    expect(code(() => lifeQuotes(life({ smoker: 'no' as never }), NOW))).toBe('INVALID_REQUEST');
  });

  it('sum assured: BHD 10,000 to 500,000 in steps of BHD 5,000, whole fils', () => {
    expect(code(() => lifeQuotes(life({ sumAssuredFils: LIFE_MIN_SUM_ASSURED_FILS }), NOW))).toBeUndefined();
    expect(code(() => lifeQuotes(life({ sumAssuredFils: LIFE_MAX_SUM_ASSURED_FILS }), NOW))).toBeUndefined();
    for (const sumAssuredFils of [bhd(9_995), bhd(505_000), bhd(12_000), 100_000_000.5, Number.NaN, undefined as never, bhd(10_000) + 1]) {
      expect(code(() => lifeQuotes(life({ sumAssuredFils }), NOW)), String(sumAssuredFils)).toBe('INVALID_SUM_ASSURED');
    }
  });

  it('term: 5 to 30 years and it must end by age 70', () => {
    expect(code(() => lifeQuotes(life({ termYears: 4 }), NOW))).toBe('INVALID_TERM');
    expect(code(() => lifeQuotes(life({ termYears: 31 }), NOW))).toBe('INVALID_TERM');
    expect(code(() => lifeQuotes(life({ termYears: 12.5 }), NOW))).toBe('INVALID_TERM');
    expect(code(() => lifeQuotes(life({ termYears: undefined as never }), NOW))).toBe('INVALID_TERM');
    // Age 35: up to 30 years. Age 45: 25. Age 50: 20, 21 would end after 70.
    expect(code(() => lifeQuotes(life({ dateOfBirth: dob(35), termYears: 30 }), NOW))).toBeUndefined();
    expect(code(() => lifeQuotes(life({ dateOfBirth: dob(45), termYears: 25 }), NOW))).toBeUndefined();
    expect(code(() => lifeQuotes(life({ dateOfBirth: dob(45), termYears: 26 }), NOW))).toBe('INVALID_TERM');
    expect(code(() => lifeQuotes(life({ dateOfBirth: dob(50), termYears: 20 }), NOW))).toBeUndefined();
    expect(code(() => lifeQuotes(life({ dateOfBirth: dob(50), termYears: 21 }), NOW))).toBe('INVALID_TERM');
    expect(code(() => lifeQuotes(life({ dateOfBirth: dob(65), termYears: 5 }), NOW))).toBeUndefined();
    expect(maxLifeTermYears(35)).toBe(30);
    expect(maxLifeTermYears(50)).toBe(20);
    expect(maxLifeTermYears(65)).toBe(5);
    expect(maxLifeTermYears(66)).toBe(0);
  });

  it('prices monthly and annual figures and the total over the term, with the label by operator type', () => {
    const quotes = lifeQuotes(life(), NOW);
    expect(quotes).toHaveLength(4);
    expect(quotes.map((q) => q.annualPremiumFils)).toEqual(quotes.map((q) => q.annualPremiumFils).sort((a, b) => a - b));
    for (const q of quotes) {
      expect(q.monthlyPremiumFils).toBe(Math.round(q.annualPremiumFils / 12));
      expect(q.totalPremiumsFils).toBe(q.annualPremiumFils * 20);
      expect(q.totalPremiumsFils).toBeLessThan(q.sumAssuredFils);
      expect(q.productType).toBe(q.takaful ? 'family-takaful' : 'conventional');
      expect(q.ageAtStart).toBe(35);
    }
    expect(quotes.some((q) => q.productType === 'family-takaful')).toBe(true);
    expect(quotes.some((q) => q.productType === 'conventional')).toBe(true);
  });

  it('rounds the premium to the fils once: 35 y, 20 y, BHD 100,000, non-smoker, no rider', () => {
    const pearl = DEMO_LIFE_PLANS.find((p) => p.insurerId === 'pearl-takaful')!;
    // 100 units × 620 × 150% × 130% = 120,900 fils exactly
    expect(lifePremium(pearl, life(), 35)).toBe(120_900);
    // With smoker 175% and rider 135%: 100 × 620 × 150 × 130 × 175 × 135 / 10^8
    expect(lifePremium(pearl, life({ smoker: true, criticalIllnessRider: true }), 35)).toBe(Math.round((100 * 620 * 150 * 130 * 175 * 135) / 100_000_000));
    // A fractional product is rounded once, at the end: 25 × 620 × 150 × 130 × 175 / 10^6 = 52,893.75
    const odd = lifePremium(pearl, life({ sumAssuredFils: bhd(25_000), smoker: true }), 37);
    expect(odd).toBe(52_894);
  });

  it('every price is a safe integer, even at the maximum of every factor', () => {
    for (const plan of DEMO_LIFE_PLANS) {
      const p = lifePremium(plan, { sumAssuredFils: LIFE_MAX_SUM_ASSURED_FILS, termYears: 30, smoker: true, criticalIllnessRider: true }, 35);
      expect(Number.isSafeInteger(p)).toBe(true);
      // The raw product stays below 2^53, so the single rounding is exact.
      const raw = 500 * plan.ratePerThousandFils * 150 * 160 * plan.smokerPct * (100 + plan.criticalIllnessPct);
      expect(raw).toBeLessThan(Number.MAX_SAFE_INTEGER);
    }
    const worst = lifePremium(DEMO_LIFE_PLANS[3]!, { sumAssuredFils: LIFE_MAX_SUM_ASSURED_FILS, termYears: 30, smoker: true, criticalIllnessRider: true }, 60);
    expect(Number.isSafeInteger(worst)).toBe(true);
    expect(Number.isSafeInteger(500 * 700 * 1_200 * 160 * 200 * 140)).toBe(true);
  });

  it('is monotonic in age, term, sum assured, smoker and rider', () => {
    const premium = (over: Partial<LifeQuoteInput>) => lifeQuotes(life(over), NOW).find((q) => q.insurerId === 'dilmun-insurance')!.annualPremiumFils;
    let last = 0;
    for (let age = 18; age <= 65; age++) {
      const p = premium({ dateOfBirth: dob(age), termYears: 5 });
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    last = 0;
    for (let term = 5; term <= 30; term++) {
      const p = premium({ termYears: term });
      expect(p).toBeGreaterThan(last);
      last = p;
    }
    last = 0;
    for (let sum = 10_000; sum <= 500_000; sum += 5_000) {
      const p = premium({ sumAssuredFils: bhd(sum) });
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(premium({ smoker: true })).toBeGreaterThan(premium({}));
    expect(premium({ criticalIllnessRider: true })).toBeGreaterThan(premium({}));
    expect(LIFE_AGE_BANDS.map((b) => b.pct)).toEqual(LIFE_AGE_BANDS.map((b) => b.pct).sort((a, b) => a - b));
    expect(lifeAgePct(65)).toBe(1_200);
  });

  it('filters Takaful operators (family takaful)', () => {
    const takaful = lifeQuotes(life({ takafulOnly: true }), NOW);
    expect(takaful.map((q) => q.insurerId).sort()).toEqual(['awal-takaful', 'pearl-takaful']);
    expect(takaful.every((q) => q.productType === 'family-takaful')).toBe(true);
  });

  it('does not collect beneficiaries: the quote has no beneficiary fields', () => {
    const q = lifeQuotes(life(), NOW)[0]!;
    expect(Object.keys(q).filter((k) => /benef/i.test(k))).toEqual([]);
  });
});

describe('buying medical and life policies', () => {
  const CUSTOMER = 'c-1';
  // The payment gateway stamps payments with the system clock: pin it to the store's clock.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());
  function setup() {
    let t = NOW.getTime();
    const store = new SandboxPolicyStore(() => new Date((t += 1000)));
    return { store, gateway: new SandboxPaymentGateway() };
  }
  async function pay(gateway: SandboxPaymentGateway, amountFils: number, reference: string) {
    const p = await gateway.createCharge({ amountFils, method: 'benefitpay', purpose: 'insurance_premium', reference, idempotencyKey: `key-${reference}-${amountFils}` });
    return gateway.confirm(p.id);
  }
  const medicalInput = medical({ spouseDateOfBirth: dob(33), childrenDatesOfBirth: [dob(4)], tier: 'enhanced', nationality: 'bahraini' });
  const lifeInput = life({ smoker: true, criticalIllnessRider: true });

  it('knows the new lines', () => {
    expect(INSURANCE_LINES).toEqual(['motor', 'travel', 'home', 'medical', 'life']);
  });

  it('prices a medical policy for one year from today, re-priced server-side', () => {
    const priced = pricePolicyQuote({ line: 'medical', insurerId: 'awal-takaful', input: medicalInput }, NOW);
    expect(priced).toMatchObject({
      line: 'medical',
      takaful: true,
      startDate: TODAY,
      endDate: '2027-10-03',
      premiumFils: medicalQuotes(medicalInput, NOW).find((q) => q.insurerId === 'awal-takaful')!.annualPremiumFils,
      cover: { line: 'medical', tier: 'enhanced', nationality: 'bahraini', adults: 2, children: 1, annualLimitFils: bhd(150_000), coPayPct: 10, preExistingStatus: 'none' },
    });
    // No dates of birth are kept on the quote.
    expect(JSON.stringify(priced)).not.toContain(dob(35));
  });

  it('prices a life policy for one year with the term recorded (annual premium paid)', () => {
    const priced = pricePolicyQuote({ line: 'life', insurerId: 'pearl-takaful', input: lifeInput }, NOW);
    expect(priced).toMatchObject({
      line: 'life',
      takaful: true,
      startDate: TODAY,
      endDate: '2027-10-03',
      premiumFils: lifeQuotes(lifeInput, NOW).find((q) => q.insurerId === 'pearl-takaful')!.annualPremiumFils,
      cover: { line: 'life', productType: 'family-takaful', sumAssuredFils: bhd(100_000), termYears: 20, smoker: true, criticalIllnessRider: true, ageAtStart: 35 },
    });
  });

  it('applies the quote validation to held quotes (422 codes) and unknown insurers', () => {
    const { store } = setup();
    expect(code(() => store.createQuote(CUSTOMER, { line: 'medical', insurerId: 'pearl-takaful', input: { ...medicalInput, childrenDatesOfBirth: Array(6).fill(dob(2)) } }))).toBe('INVALID_MEMBERS');
    expect(code(() => store.createQuote(CUSTOMER, { line: 'life', insurerId: 'pearl-takaful', input: { ...lifeInput, termYears: 40 } }))).toBe('INVALID_TERM');
    expect(code(() => store.createQuote(CUSTOMER, { line: 'life', insurerId: 'acme', input: lifeInput }))).toBe('INSURER_NOT_FOUND');
    expect(code(() => store.createQuote(CUSTOMER, { line: 'medical', insurerId: 'acme', input: medicalInput }))).toBe('INSURER_NOT_FOUND');
  });

  it('does not sell a medical quote that is referred to the insurer', () => {
    const { store } = setup();
    const referred = { ...medicalInput, preExistingConditions: true };
    expect(code(() => store.createQuote(CUSTOMER, { line: 'medical', insurerId: 'dilmun-insurance', input: referred }))).toBe('REFERRED_TO_INSURER');
    const q = store.createQuote(CUSTOMER, { line: 'medical', insurerId: 'pearl-takaful', input: referred });
    expect(q.cover).toMatchObject({ preExistingStatus: 'surcharge' });
  });

  it('issues a medical policy only for a captured payment matching the held premium to the fils', async () => {
    const { store, gateway } = setup();
    const q = store.createQuote(CUSTOMER, { line: 'medical', insurerId: 'pearl-takaful', input: medicalInput });
    const short = await pay(gateway, q.premiumFils - 1, q.id);
    expect(code(() => store.confirm(CUSTOMER, short, q.id))).toBe('AMOUNT_MISMATCH');
    const uncaptured = await gateway.createCharge({ amountFils: q.premiumFils, method: 'benefitpay', purpose: 'insurance_premium', reference: q.id, idempotencyKey: 'key-uncaptured' });
    expect(code(() => store.confirm(CUSTOMER, uncaptured))).toBe('PAYMENT_NOT_CAPTURED');
    expect(store.list(CUSTOMER).filter((p) => p.line === 'medical')).toHaveLength(0);

    const policy = store.confirm(CUSTOMER, await gateway.confirm(uncaptured.id), q.id);
    expect(policy).toMatchObject({ line: 'medical', status: 'ACTIVE', premiumFils: q.premiumFils, startDate: TODAY, endDate: '2027-10-03' });
    expect(policy.policyNumber).toBe('SBX-MED-26-000001');
    expect(store.list(CUSTOMER).map((p) => p.line)).toEqual(['medical']);
  });

  it('issues a life policy only for a captured payment matching the held premium, once', async () => {
    const { store, gateway } = setup();
    const q = store.createQuote(CUSTOMER, { line: 'life', insurerId: 'dilmun-insurance', input: lifeInput });
    expect(code(() => store.confirm(CUSTOMER, undefined))).toBe('PAYMENT_NOT_FOUND');
    const wrong = await pay(gateway, q.premiumFils + 1, q.id);
    expect(code(() => store.confirm(CUSTOMER, wrong))).toBe('AMOUNT_MISMATCH');
    const payment = await pay(gateway, q.premiumFils, q.id);
    const policy = store.confirm(CUSTOMER, payment, q.id);
    expect(policy).toMatchObject({ line: 'life', status: 'ACTIVE', takaful: false, cover: { line: 'life', termYears: 20, productType: 'conventional' } });
    expect(policy.policyNumber).toBe('SBX-LIF-26-000001');
    expect(store.confirm(CUSTOMER, payment)).toEqual(policy);
    const again = await gateway.confirm(
      (await gateway.createCharge({ amountFils: q.premiumFils, method: 'benefitpay', purpose: 'insurance_premium', reference: q.id, idempotencyKey: 'key-second' })).id,
    );
    expect(code(() => store.confirm(CUSTOMER, again))).toBe('ALREADY_BOUND');
    // Another customer cannot bind it or see it.
    expect(code(() => store.confirm('someone-else', payment))).toBe('PAYMENT_NOT_FOUND');
    expect(store.list('someone-else')).toEqual([]);
  });

  it('PolicyError is what the store throws for binding failures', async () => {
    const { store } = setup();
    expect(() => store.confirm(CUSTOMER, undefined)).toThrow(PolicyError);
  });
});

describe('expiry reminders for the new lines', () => {
  const policy = (line: 'medical' | 'life', endDate: string): Policy => ({
    ...pricePolicyQuote(
      line === 'medical' ? { line, insurerId: 'pearl-takaful', input: medical() } : { line, insurerId: 'pearl-takaful', input: life() },
      NOW,
    ),
    id: `pol_${line}`,
    policyNumber: line === 'medical' ? 'SBX-MED-26-000001' : 'SBX-LIF-26-000001',
    customerId: 'c-1',
    quoteId: 'pq_1',
    paymentId: 'pay_1',
    issuedAt: '2025-10-04T09:00:00.000Z',
    startDate: '2025-10-04',
    endDate,
    status: 'ACTIVE',
  });

  it('derives policy_expiring notifications whose line label exists in both languages', () => {
    for (const line of ['medical', 'life'] as const) {
      const drafts = deriveNotifications({ contracts: [], garage: [], policies: [policy(line, '2026-10-20')] }, NOW);
      const d = drafts.find((x) => x.type === 'policy_expiring');
      expect(d, line).toBeDefined();
      const key = (d!.params.line as { key: string }).key;
      expect((en as Record<string, string>)[key]).toBeTruthy();
      expect((ar as Record<string, string>)[key]).toBeTruthy();
    }
  });
});

describe('client config for the apps', () => {
  it('serves the medical and life form rules from the same constants', () => {
    const rules = insuranceRules();
    expect(rules.medical).toEqual({
      tiers: ['basic', 'enhanced', 'premium'],
      nationalities: ['bahraini', 'expat'],
      adultMinAge: 18,
      adultMaxAge: 64,
      childMaxAge: 17,
      maxChildren: 5,
      defaultPrimaryAge: 35,
    });
    expect(rules.life).toMatchObject({
      minAge: 18,
      maxAge: 65,
      maxEndAge: 70,
      minSumAssuredFils: bhd(10_000),
      maxSumAssuredFils: bhd(500_000),
      sumAssuredStepFils: bhd(5_000),
      minTermYears: 5,
      maxTermYears: 30,
    });
    const defaults = rules.life;
    // The defaults are themselves a valid request.
    expect(code(() => lifeQuotes(withLifeDefaults({ dateOfBirth: dob(defaults.defaultAge), sumAssuredFils: defaults.defaultSumAssuredFils, termYears: defaults.defaultTermYears }), NOW))).toBeUndefined();
    const config = clientConfig(demoCustomer(NOW).preApproval);
    expect(config.insurance.medical.tiers).toHaveLength(3);
  });
});
