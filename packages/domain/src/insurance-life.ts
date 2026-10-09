import type { Fils } from './money';
import { bhd } from './money';
import type { Localized } from './types';
import { DEMO_INSURERS, type Insurer } from './insurance';
import { ageOnIso, bahrainToday, InsuranceQuoteError, isIsoDate } from './insurance-common';

/**
 * Term life insurance comparison (Tasheelat Insurance acts as broker). Conventional term life or family takaful.
 * The annual premium is paid for a one-year policy period; the term is recorded on the policy.
 * ⚠️ Sandbox: demo insurers and illustrative pricing. Indicative quote only: no underwriting happens here.
 * Beneficiary names are NOT collected in the quote; they are collected at issuance.
 */
export type LifeProductType = 'conventional' | 'family-takaful';

/** ⚠️ VERIFY with Tasheelat Insurance: the limits each insurer accepts online. */
export const LIFE_MIN_AGE = 18;
export const LIFE_MAX_AGE = 65;
/** Cover must end no later than the 70th birthday (age at start + term ≤ 70). */
export const LIFE_MAX_END_AGE = 70;
export const LIFE_MIN_TERM_YEARS = 5;
export const LIFE_MAX_TERM_YEARS = 30;
export const LIFE_MIN_SUM_ASSURED_FILS: Fils = bhd(10_000);
export const LIFE_MAX_SUM_ASSURED_FILS: Fils = bhd(500_000);
export const LIFE_SUM_ASSURED_STEP_FILS: Fils = bhd(5_000);
/** Starting point both apps offer. */
export const LIFE_DEFAULT_AGE = 35;
export const LIFE_DEFAULT_SUM_ASSURED_FILS: Fils = bhd(100_000);
export const LIFE_DEFAULT_TERM_YEARS = 20;

/** Annual price as a percentage of the base rate, by age at start (inclusive bands). */
export const LIFE_AGE_BANDS: { minAge: number; maxAge: number; pct: number }[] = [
  { minAge: 18, maxAge: 29, pct: 100 },
  { minAge: 30, maxAge: 34, pct: 120 },
  { minAge: 35, maxAge: 39, pct: 150 },
  { minAge: 40, maxAge: 44, pct: 210 },
  { minAge: 45, maxAge: 49, pct: 320 },
  { minAge: 50, maxAge: 54, pct: 500 },
  { minAge: 55, maxAge: 59, pct: 780 },
  { minAge: 60, maxAge: 65, pct: 1_200 },
];

export interface LifePlan {
  insurerId: string;
  /** Annual rate in fils per BHD 1,000 of sum assured, for age 18-29, non-smoker, 5-year term */
  ratePerThousandFils: number;
  /** Smoker loading as a percentage of the non-smoker price (e.g. 180) */
  smokerPct: number;
  /** Critical illness rider: extra percentage of the price (e.g. 35 = +35%) */
  criticalIllnessPct: number;
  minPremiumFils: Fils;
}

/** ⚠️ Illustrative demo rates for the DEMO_INSURERS. */
export const DEMO_LIFE_PLANS: LifePlan[] = [
  { insurerId: 'pearl-takaful', ratePerThousandFils: 620, smokerPct: 175, criticalIllnessPct: 35, minPremiumFils: bhd(25) },
  { insurerId: 'dilmun-insurance', ratePerThousandFils: 580, smokerPct: 190, criticalIllnessPct: 40, minPremiumFils: bhd(22) },
  { insurerId: 'awal-takaful', ratePerThousandFils: 600, smokerPct: 180, criticalIllnessPct: 30, minPremiumFils: bhd(24) },
  { insurerId: 'manama-assurance', ratePerThousandFils: 660, smokerPct: 170, criticalIllnessPct: 33, minPremiumFils: bhd(28) },
];

export interface LifeQuoteInput {
  /** YYYY-MM-DD (Bahrain date) */
  dateOfBirth: string;
  smoker: boolean;
  sumAssuredFils: Fils;
  termYears: number;
  criticalIllnessRider: boolean;
  takafulOnly?: boolean;
}

export interface LifeQuote {
  insurerId: string;
  insurerName: Localized;
  takaful: boolean;
  productType: LifeProductType;
  ageAtStart: number;
  smoker: boolean;
  sumAssuredFils: Fils;
  termYears: number;
  criticalIllnessRider: boolean;
  /** Level annual premium (family takaful: annual contribution), paid for the one-year policy period */
  annualPremiumFils: Fils;
  /** annualPremiumFils / 12, rounded to the fils; a comparison figure only (the annual premium is what is paid) */
  monthlyPremiumFils: Fils;
  /** annualPremiumFils × termYears */
  totalPremiumsFils: Fils;
}

/** Request defaults shared by every channel: non-smoker, no rider. */
export function withLifeDefaults(input: Partial<LifeQuoteInput>): LifeQuoteInput {
  return {
    dateOfBirth: input.dateOfBirth as string,
    smoker: input.smoker ?? false,
    sumAssuredFils: input.sumAssuredFils as Fils,
    termYears: input.termYears as number,
    criticalIllnessRider: input.criticalIllnessRider ?? false,
    takafulOnly: input.takafulOnly === true,
  };
}

/** Validates a life quote request against today's Bahrain date and returns the age at start. */
export function validateLifeInput(input: LifeQuoteInput, now: Date = new Date()): number {
  if (typeof input.smoker !== 'boolean') throw new InsuranceQuoteError('INVALID_REQUEST', 'smoker must be true or false');
  if (typeof input.criticalIllnessRider !== 'boolean') throw new InsuranceQuoteError('INVALID_REQUEST', 'criticalIllnessRider must be true or false');
  if (!isIsoDate(input.dateOfBirth)) throw new InsuranceQuoteError('INVALID_AGE', 'dateOfBirth must be a YYYY-MM-DD date');
  const today = bahrainToday(now);
  if (input.dateOfBirth > today) throw new InsuranceQuoteError('INVALID_AGE', 'dateOfBirth cannot be in the future');
  const age = ageOnIso(input.dateOfBirth, today);
  if (age < LIFE_MIN_AGE || age > LIFE_MAX_AGE) throw new InsuranceQuoteError('INVALID_AGE', `age must be between ${LIFE_MIN_AGE} and ${LIFE_MAX_AGE}`);
  const sum = input.sumAssuredFils;
  if (
    !Number.isSafeInteger(sum) ||
    sum < LIFE_MIN_SUM_ASSURED_FILS ||
    sum > LIFE_MAX_SUM_ASSURED_FILS ||
    (sum - LIFE_MIN_SUM_ASSURED_FILS) % LIFE_SUM_ASSURED_STEP_FILS !== 0
  ) {
    throw new InsuranceQuoteError(
      'INVALID_SUM_ASSURED',
      `sumAssuredFils must be ${LIFE_MIN_SUM_ASSURED_FILS} to ${LIFE_MAX_SUM_ASSURED_FILS} fils in steps of ${LIFE_SUM_ASSURED_STEP_FILS}`,
    );
  }
  if (!Number.isSafeInteger(input.termYears) || input.termYears < LIFE_MIN_TERM_YEARS || input.termYears > LIFE_MAX_TERM_YEARS) {
    throw new InsuranceQuoteError('INVALID_TERM', `termYears must be between ${LIFE_MIN_TERM_YEARS} and ${LIFE_MAX_TERM_YEARS}`);
  }
  if (age + input.termYears > LIFE_MAX_END_AGE) {
    throw new InsuranceQuoteError('INVALID_TERM', `the term must end by age ${LIFE_MAX_END_AGE}: at most ${LIFE_MAX_END_AGE - age} years at age ${age}`);
  }
  return age;
}

/** Longest term allowed at an age (0 when even the shortest term does not fit). */
export function maxLifeTermYears(age: number): number {
  const room = LIFE_MAX_END_AGE - age;
  return room < LIFE_MIN_TERM_YEARS ? 0 : Math.min(LIFE_MAX_TERM_YEARS, room);
}

export function lifeAgePct(age: number): number {
  const band = LIFE_AGE_BANDS.find((b) => age >= b.minAge && age <= b.maxAge);
  if (!band) throw new InsuranceQuoteError('INVALID_AGE', `no life price band for age ${age}`);
  return band.pct;
}

/** Longer terms cost a little more per year: +2% of the base for every year beyond 5. */
export function lifeTermPct(termYears: number): number {
  return 100 + 2 * (termYears - LIFE_MIN_TERM_YEARS);
}

/**
 * Deterministic level annual premium: (sum assured in BHD 1,000 units) × rate per thousand × age % × term % ×
 * smoker % × (100 + rider %), rounded to the fils once at the end, never below the insurer's minimum.
 * The sum is a whole number of BHD 1,000 units only when it is a multiple of BHD 1,000, which the BHD 5,000 step
 * guarantees; the product stays below 2^53 (about 1.7 × 10^15 at the maximums).
 */
export function lifePremium(
  plan: LifePlan,
  input: Pick<LifeQuoteInput, 'sumAssuredFils' | 'termYears' | 'smoker' | 'criticalIllnessRider'>,
  age: number,
): Fils {
  const units = input.sumAssuredFils / bhd(1_000);
  const smokerPct = input.smoker ? plan.smokerPct : 100;
  const riderPct = input.criticalIllnessRider ? 100 + plan.criticalIllnessPct : 100;
  const product = units * plan.ratePerThousandFils * lifeAgePct(age) * lifeTermPct(input.termYears) * smokerPct * riderPct;
  return Math.max(plan.minPremiumFils, Math.round(product / 100_000_000));
}

/** Quotes from every insurer with a life plan, cheapest first. Throws InsuranceQuoteError for invalid input. */
export function lifeQuotes(
  input: LifeQuoteInput,
  now: Date = new Date(),
  insurers: Insurer[] = DEMO_INSURERS,
  plans: LifePlan[] = DEMO_LIFE_PLANS,
): LifeQuote[] {
  const age = validateLifeInput(input, now);
  return insurers
    .filter((i) => !input.takafulOnly || i.takaful)
    .flatMap((i) => {
      const plan = plans.find((p) => p.insurerId === i.id);
      if (!plan) return [];
      const annual = lifePremium(plan, input, age);
      return [
        {
          insurerId: i.id,
          insurerName: i.name,
          takaful: i.takaful,
          productType: i.takaful ? ('family-takaful' as const) : ('conventional' as const),
          ageAtStart: age,
          smoker: input.smoker,
          sumAssuredFils: input.sumAssuredFils,
          termYears: input.termYears,
          criticalIllnessRider: input.criticalIllnessRider,
          annualPremiumFils: annual,
          monthlyPremiumFils: Math.round(annual / 12),
          totalPremiumsFils: annual * input.termYears,
        },
      ];
    })
    .sort((a, b) => a.annualPremiumFils - b.annualPremiumFils || a.insurerId.localeCompare(b.insurerId));
}
