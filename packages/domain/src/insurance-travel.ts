import type { Fils } from './money';
import { bhd } from './money';
import type { Localized } from './types';
import { DEMO_INSURERS, type Insurer } from './insurance';
import { addDaysIso, bahrainToday, daysBetweenIso, InsuranceQuoteError, isIsoDate } from './insurance-common';

/**
 * Travel insurance comparison (Tasheelat Insurance acts as broker).
 * ⚠️ Demo insurers and illustrative pricing. Real quotes come from insurer APIs.
 */
export type TravelRegion = 'gcc' | 'worldwide-excl-us-ca' | 'worldwide';
export type TravelTier = 'basic' | 'plus';

export const TRAVEL_REGIONS: TravelRegion[] = ['gcc', 'worldwide-excl-us-ca', 'worldwide'];
export const TRAVEL_TIERS: TravelTier[] = ['basic', 'plus'];

/** ⚠️ VERIFY with Tasheelat Insurance: longest single trip covered. */
export const MAX_TRIP_DAYS = 180;
/** ⚠️ VERIFY: how far ahead a trip can be insured. */
export const MAX_DAYS_AHEAD = 365;
export const MIN_ADULTS = 1;
export const MAX_ADULTS = 6;
export const MAX_CHILDREN = 8;

export interface TravelPlan {
  insurerId: string;
  /** Price per adult per day, by destination region. Children (under 18) pay half. */
  dailyFils: Record<TravelRegion, Fils>;
  /** Plus tier price as a percentage of basic */
  plusPct: number;
  minPremiumFils: Fils;
  /** Emergency medical cover per traveller, by tier */
  medicalCoverFils: Record<TravelTier, Fils>;
}

/** ⚠️ Illustrative demo rates for the DEMO_INSURERS. */
export const DEMO_TRAVEL_PLANS: TravelPlan[] = [
  { insurerId: 'pearl-takaful', dailyFils: { gcc: 450, 'worldwide-excl-us-ca': 1_150, worldwide: 1_950 }, plusPct: 150, minPremiumFils: bhd(3), medicalCoverFils: { basic: bhd(25_000), plus: bhd(150_000) } },
  { insurerId: 'dilmun-insurance', dailyFils: { gcc: 400, 'worldwide-excl-us-ca': 1_200, worldwide: 2_100 }, plusPct: 140, minPremiumFils: bhd(3.5), medicalCoverFils: { basic: bhd(20_000), plus: bhd(100_000) } },
  { insurerId: 'awal-takaful', dailyFils: { gcc: 500, 'worldwide-excl-us-ca': 1_050, worldwide: 2_000 }, plusPct: 145, minPremiumFils: bhd(2.5), medicalCoverFils: { basic: bhd(25_000), plus: bhd(120_000) } },
  { insurerId: 'manama-assurance', dailyFils: { gcc: 420, 'worldwide-excl-us-ca': 1_300, worldwide: 1_800 }, plusPct: 160, minPremiumFils: bhd(4), medicalCoverFils: { basic: bhd(30_000), plus: bhd(200_000) } },
];

/** Schengen visas need at least EUR 30,000 of medical cover (⚠️ about BHD 12,000; VERIFY rate). */
export const SCHENGEN_MIN_MEDICAL_FILS: Fils = bhd(12_000);

export interface TravelQuoteInput {
  region: TravelRegion;
  tier: TravelTier;
  /** First day of the trip, YYYY-MM-DD (Bahrain date) */
  startDate: string;
  /** Last day of the trip, YYYY-MM-DD, inclusive */
  endDate: string;
  adults: number;
  children: number;
  takafulOnly?: boolean;
}

export interface TravelQuote {
  insurerId: string;
  insurerName: Localized;
  takaful: boolean;
  region: TravelRegion;
  tier: TravelTier;
  startDate: string;
  endDate: string;
  /** Days covered, inclusive of both ends */
  days: number;
  adults: number;
  children: number;
  premiumFils: Fils;
  medicalCoverFils: Fils;
  schengenCompliant: boolean;
}

/** Request defaults shared by every channel: Basic cover, one adult, no children. */
export function withTravelDefaults(input: Partial<TravelQuoteInput>): TravelQuoteInput {
  return {
    region: input.region as TravelRegion,
    tier: input.tier ?? 'basic',
    startDate: input.startDate as string,
    endDate: input.endDate as string,
    adults: input.adults ?? 1,
    children: input.children ?? 0,
    takafulOnly: input.takafulOnly === true,
  };
}

/**
 * Validate a travel quote request against today's Bahrain date: start ≥ today (and at most MAX_DAYS_AHEAD ahead),
 * end ≥ start, at most MAX_TRIP_DAYS days, 1–MAX_ADULTS adults and 0–MAX_CHILDREN children.
 * Returns the number of days covered.
 */
export function validateTravelInput(input: TravelQuoteInput, now: Date = new Date()): number {
  if (!TRAVEL_REGIONS.includes(input.region)) throw new InsuranceQuoteError('INVALID_REQUEST', `region must be one of ${TRAVEL_REGIONS.join(', ')}`);
  if (!TRAVEL_TIERS.includes(input.tier)) throw new InsuranceQuoteError('INVALID_REQUEST', `tier must be one of ${TRAVEL_TIERS.join(', ')}`);
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) throw new InsuranceQuoteError('INVALID_DATES', 'startDate and endDate must be YYYY-MM-DD dates');
  const today = bahrainToday(now);
  if (input.startDate < today) throw new InsuranceQuoteError('INVALID_DATES', 'the trip cannot start before today');
  if (input.startDate > addDaysIso(today, MAX_DAYS_AHEAD)) throw new InsuranceQuoteError('INVALID_DATES', `the trip must start within ${MAX_DAYS_AHEAD} days`);
  if (input.endDate < input.startDate) throw new InsuranceQuoteError('INVALID_DATES', 'the trip cannot end before it starts');
  const days = daysBetweenIso(input.startDate, input.endDate) + 1;
  if (days > MAX_TRIP_DAYS) throw new InsuranceQuoteError('TRIP_TOO_LONG', `a single trip can be at most ${MAX_TRIP_DAYS} days`);
  if (!Number.isSafeInteger(input.adults) || input.adults < MIN_ADULTS || input.adults > MAX_ADULTS) {
    throw new InsuranceQuoteError('INVALID_TRAVELLERS', `adults must be between ${MIN_ADULTS} and ${MAX_ADULTS}`);
  }
  if (!Number.isSafeInteger(input.children) || input.children < 0 || input.children > MAX_CHILDREN) {
    throw new InsuranceQuoteError('INVALID_TRAVELLERS', `children must be between 0 and ${MAX_CHILDREN}`);
  }
  return days;
}

/**
 * Deterministic premium: dailyRate(region) × days × (adults + children / 2), × plusPct for Plus,
 * rounded to the fils once at the end, never below the insurer's minimum.
 */
export function travelPremium(
  plan: TravelPlan,
  input: Pick<TravelQuoteInput, 'region' | 'tier' | 'adults' | 'children'>,
  days: number,
): Fils {
  const halfTravellers = 2 * input.adults + input.children;
  const tierPct = input.tier === 'plus' ? plan.plusPct : 100;
  // All factors are integers, so the product is exact before the single division.
  const premium = Math.round((plan.dailyFils[input.region] * days * halfTravellers * tierPct) / 200);
  return Math.max(plan.minPremiumFils, premium);
}

/** Quotes from every insurer with a travel plan, cheapest first. Throws InsuranceQuoteError for invalid input. */
export function travelQuotes(
  input: TravelQuoteInput,
  now: Date = new Date(),
  insurers: Insurer[] = DEMO_INSURERS,
  plans: TravelPlan[] = DEMO_TRAVEL_PLANS,
): TravelQuote[] {
  const days = validateTravelInput(input, now);
  return insurers
    .filter((i) => !input.takafulOnly || i.takaful)
    .flatMap((i) => {
      const plan = plans.find((p) => p.insurerId === i.id);
      if (!plan) return [];
      const medicalCoverFils = plan.medicalCoverFils[input.tier];
      return [
        {
          insurerId: i.id,
          insurerName: i.name,
          takaful: i.takaful,
          region: input.region,
          tier: input.tier,
          startDate: input.startDate,
          endDate: input.endDate,
          days,
          adults: input.adults,
          children: input.children,
          premiumFils: travelPremium(plan, input, days),
          medicalCoverFils,
          schengenCompliant: input.region !== 'gcc' && medicalCoverFils >= SCHENGEN_MIN_MEDICAL_FILS,
        },
      ];
    })
    .sort((a, b) => a.premiumFils - b.premiumFils || a.insurerId.localeCompare(b.insurerId));
}
