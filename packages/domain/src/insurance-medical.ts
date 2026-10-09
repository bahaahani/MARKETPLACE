import type { Fils } from './money';
import { bhd } from './money';
import type { Localized } from './types';
import { DEMO_INSURERS, type Insurer } from './insurance';
import { ageOnIso, bahrainToday, InsuranceQuoteError, isIsoDate } from './insurance-common';

/**
 * Medical insurance comparison (Tasheelat Insurance acts as broker), one year.
 * ⚠️ Sandbox: demo insurers and illustrative pricing. This is an INDICATIVE quote only: no medical underwriting
 * happens here. A pre-existing conditions declaration adds an indicative surcharge or refers the quote to the insurer;
 * it never declines anyone.
 */
export type MedicalTier = 'basic' | 'enhanced' | 'premium';
export type MedicalNationality = 'bahraini' | 'expat';
/** none: nothing declared. surcharge: indicative loading applied. referred: the insurer reviews it before any price is firm. */
export type PreExistingStatus = 'none' | 'surcharge' | 'referred';

export const MEDICAL_TIERS: MedicalTier[] = ['basic', 'enhanced', 'premium'];
export const MEDICAL_NATIONALITIES: MedicalNationality[] = ['bahraini', 'expat'];

/** ⚠️ VERIFY with Tasheelat Insurance: who can be on one online medical quote. */
export const MEDICAL_ADULT_MIN_AGE = 18;
export const MEDICAL_ADULT_MAX_AGE = 64;
export const MEDICAL_CHILD_MAX_AGE = 17;
export const MEDICAL_MAX_CHILDREN = 5;
/** Starting point both apps offer for the primary member's age. */
export const MEDICAL_DEFAULT_PRIMARY_AGE = 35;

export interface MedicalTierCover {
  /** Annual limit per member */
  annualLimitFils: Fils;
  /** Share of each claim the member pays, in percent */
  coPayPct: number;
  inpatient: boolean;
  outpatient: boolean;
  /** Months to wait before maternity cover starts; null = maternity not covered */
  maternityWaitingMonths: number | null;
  dental: boolean;
  optical: boolean;
}

/** ⚠️ Illustrative tier features, the same at every demo insurer. */
export const MEDICAL_TIER_COVER: Record<MedicalTier, MedicalTierCover> = {
  basic: { annualLimitFils: bhd(50_000), coPayPct: 20, inpatient: true, outpatient: true, maternityWaitingMonths: null, dental: false, optical: false },
  enhanced: { annualLimitFils: bhd(150_000), coPayPct: 10, inpatient: true, outpatient: true, maternityWaitingMonths: 12, dental: true, optical: false },
  premium: { annualLimitFils: bhd(500_000), coPayPct: 0, inpatient: true, outpatient: true, maternityWaitingMonths: 9, dental: true, optical: true },
};

/** Price of a member as a percentage of the adult 18-29 rate. Children (0-17) are one band. */
export const MEDICAL_AGE_BANDS: { minAge: number; maxAge: number; pct: number }[] = [
  { minAge: 0, maxAge: 17, pct: 60 },
  { minAge: 18, maxAge: 29, pct: 100 },
  { minAge: 30, maxAge: 39, pct: 120 },
  { minAge: 40, maxAge: 49, pct: 160 },
  { minAge: 50, maxAge: 59, pct: 230 },
  { minAge: 60, maxAge: 64, pct: 330 },
];

/** ⚠️ Illustrative: Bahraini nationals are priced in a lower band than expatriates. */
export const MEDICAL_NATIONALITY_PCT: Record<MedicalNationality, number> = { bahraini: 85, expat: 100 };

export interface MedicalPlan {
  insurerId: string;
  /** Annual premium for an adult aged 18-29 (expat band), by tier */
  adultBaseFils: Record<MedicalTier, Fils>;
  minPremiumFils: Fils;
  /** What this insurer does with a pre-existing conditions declaration */
  preExisting: { handling: 'surcharge'; surchargePct: number } | { handling: 'referred' };
}

/** ⚠️ Illustrative demo rates for the DEMO_INSURERS. Every insurer prices Basic < Enhanced < Premium. */
export const DEMO_MEDICAL_PLANS: MedicalPlan[] = [
  { insurerId: 'pearl-takaful', adultBaseFils: { basic: bhd(210), enhanced: bhd(420), premium: bhd(780) }, minPremiumFils: bhd(120), preExisting: { handling: 'surcharge', surchargePct: 25 } },
  { insurerId: 'dilmun-insurance', adultBaseFils: { basic: bhd(190), enhanced: bhd(400), premium: bhd(820) }, minPremiumFils: bhd(110), preExisting: { handling: 'referred' } },
  { insurerId: 'awal-takaful', adultBaseFils: { basic: bhd(200), enhanced: bhd(390), premium: bhd(760) }, minPremiumFils: bhd(115), preExisting: { handling: 'surcharge', surchargePct: 30 } },
  { insurerId: 'manama-assurance', adultBaseFils: { basic: bhd(225), enhanced: bhd(445), premium: bhd(740) }, minPremiumFils: bhd(130), preExisting: { handling: 'referred' } },
];

export interface MedicalQuoteInput {
  /** Primary member (an adult), YYYY-MM-DD */
  primaryDateOfBirth: string;
  spouseDateOfBirth?: string;
  childrenDatesOfBirth: string[];
  tier: MedicalTier;
  nationality: MedicalNationality;
  /** Any pre-existing condition to declare? (indicative only, never a decline) */
  preExistingConditions: boolean;
  takafulOnly?: boolean;
}

export interface MedicalQuote {
  insurerId: string;
  insurerName: Localized;
  takaful: boolean;
  tier: MedicalTier;
  nationality: MedicalNationality;
  adults: number;
  children: number;
  /** Indicative annual premium for all members, one year */
  annualPremiumFils: Fils;
  annualLimitFils: Fils;
  coPayPct: number;
  inpatient: boolean;
  outpatient: boolean;
  maternityWaitingMonths: number | null;
  dental: boolean;
  optical: boolean;
  preExistingStatus: PreExistingStatus;
  /** Part of annualPremiumFils that comes from the pre-existing conditions surcharge (0 unless `surcharge`) */
  preExistingSurchargeFils: Fils;
  /** False when the quote is referred to the insurer: it cannot be bought online. */
  buyable: boolean;
}

/** Request defaults shared by every channel: Basic cover, no spouse or children, nothing to declare. */
export function withMedicalDefaults(input: Partial<MedicalQuoteInput>): MedicalQuoteInput {
  return {
    primaryDateOfBirth: input.primaryDateOfBirth as string,
    ...(input.spouseDateOfBirth !== undefined && input.spouseDateOfBirth !== null ? { spouseDateOfBirth: input.spouseDateOfBirth } : {}),
    childrenDatesOfBirth: input.childrenDatesOfBirth ?? [],
    tier: input.tier ?? 'basic',
    nationality: input.nationality as MedicalNationality,
    preExistingConditions: input.preExistingConditions === true,
    takafulOnly: input.takafulOnly === true,
  };
}

function ageOf(name: string, dob: unknown, today: string): number {
  if (!isIsoDate(dob)) throw new InsuranceQuoteError('INVALID_MEMBERS', `${name} dateOfBirth must be a YYYY-MM-DD date`);
  if (dob > today) throw new InsuranceQuoteError('INVALID_MEMBERS', `${name} cannot be born in the future`);
  return ageOnIso(dob, today);
}

/** Ages of the members, in order primary, spouse, children. Validates everything against today's Bahrain date. */
export function validateMedicalInput(input: MedicalQuoteInput, now: Date = new Date()): number[] {
  if (!MEDICAL_TIERS.includes(input.tier)) throw new InsuranceQuoteError('INVALID_REQUEST', `tier must be one of ${MEDICAL_TIERS.join(', ')}`);
  if (!MEDICAL_NATIONALITIES.includes(input.nationality)) {
    throw new InsuranceQuoteError('INVALID_REQUEST', `nationality must be one of ${MEDICAL_NATIONALITIES.join(', ')}`);
  }
  if (typeof input.preExistingConditions !== 'boolean') throw new InsuranceQuoteError('INVALID_REQUEST', 'preExistingConditions must be true or false');
  if (!Array.isArray(input.childrenDatesOfBirth)) throw new InsuranceQuoteError('INVALID_MEMBERS', 'childrenDatesOfBirth must be a list');
  if (input.childrenDatesOfBirth.length > MEDICAL_MAX_CHILDREN) {
    throw new InsuranceQuoteError('INVALID_MEMBERS', `at most ${MEDICAL_MAX_CHILDREN} children`);
  }
  const today = bahrainToday(now);
  const adultAge = (name: string, dob: unknown) => {
    const age = ageOf(name, dob, today);
    if (age < MEDICAL_ADULT_MIN_AGE || age > MEDICAL_ADULT_MAX_AGE) {
      throw new InsuranceQuoteError('INVALID_MEMBERS', `${name} must be aged ${MEDICAL_ADULT_MIN_AGE} to ${MEDICAL_ADULT_MAX_AGE}`);
    }
    return age;
  };
  const ages = [adultAge('primary member', input.primaryDateOfBirth)];
  if (input.spouseDateOfBirth !== undefined) ages.push(adultAge('spouse', input.spouseDateOfBirth));
  input.childrenDatesOfBirth.forEach((dob, i) => {
    const age = ageOf(`child ${i + 1}`, dob, today);
    if (age > MEDICAL_CHILD_MAX_AGE) throw new InsuranceQuoteError('INVALID_MEMBERS', `child ${i + 1} must be aged 0 to ${MEDICAL_CHILD_MAX_AGE}`);
    ages.push(age);
  });
  return ages;
}

/** Percentage of the adult base rate for one member's age. Throws for ages outside every band. */
export function medicalAgePct(age: number): number {
  const band = MEDICAL_AGE_BANDS.find((b) => age >= b.minAge && age <= b.maxAge);
  if (!band) throw new InsuranceQuoteError('INVALID_MEMBERS', `no medical price band for age ${age}`);
  return band.pct;
}

/**
 * Deterministic annual premium: adult base rate for the tier × the sum of the members' age-band percentages ×
 * the nationality percentage (× 100 + surcharge for a pre-existing conditions surcharge), rounded to the fils
 * once at the end, never below the insurer's minimum. Returns the premium and the part that is the surcharge.
 */
export function medicalPremium(
  plan: MedicalPlan,
  input: Pick<MedicalQuoteInput, 'tier' | 'nationality' | 'preExistingConditions'>,
  ages: number[],
): { premiumFils: Fils; surchargeFils: Fils; status: PreExistingStatus } {
  const agePct = ages.reduce((sum, a) => sum + medicalAgePct(a), 0);
  const base = plan.adultBaseFils[input.tier];
  // All factors are integers, so the product is exact before the single division.
  const exact = (loadingPct: number) => Math.round((base * agePct * MEDICAL_NATIONALITY_PCT[input.nationality] * loadingPct) / 1_000_000);
  const plain = Math.max(plan.minPremiumFils, exact(100));
  if (!input.preExistingConditions) return { premiumFils: plain, surchargeFils: 0, status: 'none' };
  // Referred: the indicative price carries no loading, the insurer decides after review.
  if (plan.preExisting.handling === 'referred') return { premiumFils: plain, surchargeFils: 0, status: 'referred' };
  const loaded = Math.max(plan.minPremiumFils, exact(100 + plan.preExisting.surchargePct));
  return { premiumFils: loaded, surchargeFils: loaded - plain, status: 'surcharge' };
}

/** Quotes from every insurer with a medical plan, cheapest first. Throws InsuranceQuoteError for invalid input. */
export function medicalQuotes(
  input: MedicalQuoteInput,
  now: Date = new Date(),
  insurers: Insurer[] = DEMO_INSURERS,
  plans: MedicalPlan[] = DEMO_MEDICAL_PLANS,
): MedicalQuote[] {
  const ages = validateMedicalInput(input, now);
  const adults = input.spouseDateOfBirth !== undefined ? 2 : 1;
  const cover = MEDICAL_TIER_COVER[input.tier];
  return insurers
    .filter((i) => !input.takafulOnly || i.takaful)
    .flatMap((i) => {
      const plan = plans.find((p) => p.insurerId === i.id);
      if (!plan) return [];
      const price = medicalPremium(plan, input, ages);
      return [
        {
          insurerId: i.id,
          insurerName: i.name,
          takaful: i.takaful,
          tier: input.tier,
          nationality: input.nationality,
          adults,
          children: input.childrenDatesOfBirth.length,
          annualPremiumFils: price.premiumFils,
          ...cover,
          preExistingStatus: price.status,
          preExistingSurchargeFils: price.surchargeFils,
          buyable: price.status !== 'referred',
        },
      ];
    })
    .sort((a, b) => a.annualPremiumFils - b.annualPremiumFils || a.insurerId.localeCompare(b.insurerId));
}
