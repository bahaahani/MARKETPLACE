import type { Fils } from './money';
import { bhd } from './money';
import type { Localized, Property, PropertyType } from './types';
import { findProperty } from './catalog';
import { DEMO_INSURERS, type Insurer } from './insurance';
import { InsuranceQuoteError, isSafeNonNegativeInt } from './insurance-common';

/**
 * Home insurance comparison (Tasheelat Insurance acts as broker): building and/or contents, one year.
 * ⚠️ Demo insurers and illustrative pricing. Real quotes come from insurer APIs.
 */
export const HOME_PROPERTY_TYPES: PropertyType[] = ['villa', 'apartment', 'townhouse', 'land', 'office'];

/** ⚠️ VERIFY with Tasheelat Insurance: sums insured each insurer accepts online. */
export const HOME_BUILDING_MIN_FILS: Fils = bhd(10_000);
export const HOME_BUILDING_MAX_FILS: Fils = bhd(2_000_000);
export const HOME_CONTENTS_MIN_FILS: Fils = bhd(1_000);
export const HOME_CONTENTS_MAX_FILS: Fils = bhd(250_000);

/** Price of each property type as a percentage of the base rate. Bare land has nothing to insure. */
export const HOME_TYPE_PCT: Record<PropertyType, number | null> = { villa: 100, townhouse: 100, apartment: 90, office: 125, land: null };

/** Property types the home form offers (bare land cannot be insured). */
export const HOME_INSURABLE_TYPES: PropertyType[] = HOME_PROPERTY_TYPES.filter((t) => HOME_TYPE_PCT[t] !== null);

/** ⚠️ Illustrative starting point for the home form when no listing is linked. */
export const HOME_DEFAULT_INPUT = { propertyType: 'villa', buildingSumInsuredFils: bhd(150_000), contentsSumInsuredFils: bhd(20_000) } as const satisfies {
  propertyType: PropertyType;
  buildingSumInsuredFils: Fils;
  contentsSumInsuredFils: Fils;
};

export interface HomePlan {
  insurerId: string;
  /** Annual rate on the building sum insured, in basis points (1 bp = 0.01%) */
  buildingRateBp: number;
  /** Annual rate on the contents sum insured, in basis points */
  contentsRateBp: number;
  minPremiumFils: Fils;
  accidentalDamage: boolean;
  temporaryAccommodation: boolean;
}

/** ⚠️ Illustrative demo rates for the DEMO_INSURERS. */
export const DEMO_HOME_PLANS: HomePlan[] = [
  { insurerId: 'pearl-takaful', buildingRateBp: 8, contentsRateBp: 30, minPremiumFils: bhd(40), accidentalDamage: true, temporaryAccommodation: true },
  { insurerId: 'dilmun-insurance', buildingRateBp: 7, contentsRateBp: 32, minPremiumFils: bhd(35), accidentalDamage: false, temporaryAccommodation: true },
  { insurerId: 'awal-takaful', buildingRateBp: 9, contentsRateBp: 26, minPremiumFils: bhd(45), accidentalDamage: true, temporaryAccommodation: false },
  { insurerId: 'manama-assurance', buildingRateBp: 10, contentsRateBp: 28, minPremiumFils: bhd(50), accidentalDamage: true, temporaryAccommodation: true },
];

export interface HomeQuoteInput {
  /** Taken from the listing when `propertyId` is given */
  propertyType?: PropertyType;
  /** Rebuild cost of the building; 0 for contents only */
  buildingSumInsuredFils: Fils;
  /** Contents value; 0 for building only */
  contentsSumInsuredFils: Fils;
  /** Optional link to a property listing in the marketplace */
  propertyId?: string;
  takafulOnly?: boolean;
}

/** The input after the listing (if any) was applied; echoed in the API response so clients show what was priced. */
export interface ResolvedHomeInput {
  propertyType: PropertyType;
  buildingSumInsuredFils: Fils;
  contentsSumInsuredFils: Fils;
  propertyId?: string;
  propertyTitle?: Localized;
}

export interface HomeQuote {
  insurerId: string;
  insurerName: Localized;
  takaful: boolean;
  propertyType: PropertyType;
  propertyId?: string;
  buildingSumInsuredFils: Fils;
  contentsSumInsuredFils: Fils;
  annualPremiumFils: Fils;
  accidentalDamage: boolean;
  temporaryAccommodation: boolean;
}

/**
 * Suggested sums insured for a listing, so a customer coming from a property page starts from sensible numbers.
 * ⚠️ Rules of thumb only: buildings at 60% of the sale price (land is not rebuilt), rounded down to BHD 1,000;
 * apartments and rentals insure contents only (the owners' association or landlord insures the building).
 */
export function suggestedHomeCover(p: Property): Omit<ResolvedHomeInput, 'propertyTitle'> & { propertyTitle: Localized } {
  const ownsBuilding = p.purpose === 'sale' && (p.type === 'villa' || p.type === 'townhouse');
  const building = ownsBuilding ? Math.floor((p.priceFils * 60) / 100 / bhd(1_000)) * bhd(1_000) : 0;
  const contents = p.type === 'land' ? 0 : p.type === 'office' ? bhd(25_000) : bhd(10_000) + bhd(2_500) * Math.max(0, p.bedrooms - 1);
  return {
    propertyType: p.type,
    buildingSumInsuredFils: Math.min(HOME_BUILDING_MAX_FILS, building),
    contentsSumInsuredFils: Math.min(HOME_CONTENTS_MAX_FILS, contents),
    propertyId: p.id,
    propertyTitle: p.title,
  };
}

function checkSum(name: string, v: unknown, min: Fils, max: Fils): void {
  if (!isSafeNonNegativeInt(v)) throw new InsuranceQuoteError('INVALID_SUM_INSURED', `${name} must be a non-negative integer (fils)`);
  if (v !== 0 && (v < min || v > max)) {
    throw new InsuranceQuoteError('INVALID_SUM_INSURED', `${name} must be 0 or between ${min} and ${max} fils`);
  }
}

/**
 * Resolve and validate the input. With a `propertyId`, the listing's type is used (a different explicit type is
 * rejected), and missing sums are filled from suggestedHomeCover().
 */
export function resolveHomeInput(input: Partial<HomeQuoteInput>): ResolvedHomeInput {
  let propertyType = input.propertyType;
  let building = input.buildingSumInsuredFils;
  let contents = input.contentsSumInsuredFils;
  let propertyTitle: Localized | undefined;
  if (input.propertyId !== undefined) {
    const p = typeof input.propertyId === 'string' ? findProperty(input.propertyId) : undefined;
    if (!p) throw new InsuranceQuoteError('PROPERTY_NOT_FOUND', `unknown property ${String(input.propertyId)}`);
    if (propertyType !== undefined && propertyType !== p.type) {
      throw new InsuranceQuoteError('INVALID_REQUEST', `propertyType ${propertyType} does not match the listing (${p.type})`);
    }
    const suggested = suggestedHomeCover(p);
    propertyType = p.type;
    propertyTitle = p.title;
    if (building === undefined && contents === undefined) {
      building = suggested.buildingSumInsuredFils;
      contents = suggested.contentsSumInsuredFils;
    }
  }
  if (propertyType === undefined || !HOME_PROPERTY_TYPES.includes(propertyType)) {
    throw new InsuranceQuoteError('INVALID_REQUEST', `propertyType must be one of ${HOME_PROPERTY_TYPES.join(', ')}`);
  }
  if (HOME_TYPE_PCT[propertyType] === null) throw new InsuranceQuoteError('PROPERTY_NOT_INSURABLE', `${propertyType} cannot be insured under home cover`);
  building ??= 0;
  contents ??= 0;
  checkSum('buildingSumInsuredFils', building, HOME_BUILDING_MIN_FILS, HOME_BUILDING_MAX_FILS);
  checkSum('contentsSumInsuredFils', contents, HOME_CONTENTS_MIN_FILS, HOME_CONTENTS_MAX_FILS);
  if (building === 0 && contents === 0) throw new InsuranceQuoteError('INVALID_SUM_INSURED', 'insure the building, the contents or both');
  return {
    propertyType,
    buildingSumInsuredFils: building,
    contentsSumInsuredFils: contents,
    ...(input.propertyId !== undefined ? { propertyId: input.propertyId, propertyTitle } : {}),
  };
}

/**
 * Deterministic annual premium: (building × buildingRateBp + contents × contentsRateBp) / 10,000,
 * × the property type percentage, rounded to the fils once, never below the insurer's minimum.
 */
export function homePremium(plan: HomePlan, input: Pick<ResolvedHomeInput, 'propertyType' | 'buildingSumInsuredFils' | 'contentsSumInsuredFils'>): Fils {
  const typePct = HOME_TYPE_PCT[input.propertyType];
  if (typePct === null) throw new InsuranceQuoteError('PROPERTY_NOT_INSURABLE', `${input.propertyType} cannot be insured under home cover`);
  const weighted = input.buildingSumInsuredFils * plan.buildingRateBp + input.contentsSumInsuredFils * plan.contentsRateBp;
  return Math.max(plan.minPremiumFils, Math.round((weighted * typePct) / 1_000_000));
}

/** Quotes from every insurer with a home plan, cheapest first. Throws InsuranceQuoteError for invalid input. */
export function homeQuotes(
  input: Partial<HomeQuoteInput>,
  insurers: Insurer[] = DEMO_INSURERS,
  plans: HomePlan[] = DEMO_HOME_PLANS,
): { input: ResolvedHomeInput; quotes: HomeQuote[] } {
  const resolved = resolveHomeInput(input);
  const quotes = insurers
    .filter((i) => !input.takafulOnly || i.takaful)
    .flatMap((i) => {
      const plan = plans.find((p) => p.insurerId === i.id);
      if (!plan) return [];
      return [
        {
          insurerId: i.id,
          insurerName: i.name,
          takaful: i.takaful,
          propertyType: resolved.propertyType,
          ...(resolved.propertyId ? { propertyId: resolved.propertyId } : {}),
          buildingSumInsuredFils: resolved.buildingSumInsuredFils,
          contentsSumInsuredFils: resolved.contentsSumInsuredFils,
          annualPremiumFils: homePremium(plan, resolved),
          accidentalDamage: plan.accidentalDamage,
          temporaryAccommodation: plan.temporaryAccommodation && resolved.buildingSumInsuredFils > 0,
        },
      ];
    })
    .sort((a, b) => a.annualPremiumFils - b.annualPremiumFils || a.insurerId.localeCompare(b.insurerId));
  return { input: resolved, quotes };
}
