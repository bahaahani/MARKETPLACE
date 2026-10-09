import type { Fils } from './money';
import { bhd } from './money';
import type { PreApproval } from './affordability';
import { CONSENT_SCOPES, CONSENT_VALIDITY_DAYS, type ConsentScope } from './onboarding';
import { MIN_PERSONAL_FINANCE_FILS } from './origination';
import { CALCULATOR_STEPS, LISTING_DEFAULTS, RATE_CARDS } from './rates';
import type { FinanceStructure, ProductLine, PropertyType } from './types';
import {
  HOME_BUILDING_MAX_FILS,
  HOME_BUILDING_MIN_FILS,
  HOME_CONTENTS_MAX_FILS,
  HOME_CONTENTS_MIN_FILS,
  HOME_DEFAULT_INPUT,
  HOME_INSURABLE_TYPES,
} from './insurance-home';
import {
  MAX_ADULTS,
  MAX_CHILDREN,
  MAX_DAYS_AHEAD,
  MAX_TRIP_DAYS,
  MIN_ADULTS,
  TRAVEL_DEFAULT_START_IN_DAYS,
  TRAVEL_DEFAULT_TRIP_DAYS,
  TRAVEL_REGIONS,
  TRAVEL_TIERS,
  type TravelRegion,
  type TravelTier,
} from './insurance-travel';
import {
  LIFE_DEFAULT_AGE,
  LIFE_DEFAULT_SUM_ASSURED_FILS,
  LIFE_DEFAULT_TERM_YEARS,
  LIFE_MAX_AGE,
  LIFE_MAX_END_AGE,
  LIFE_MAX_SUM_ASSURED_FILS,
  LIFE_MAX_TERM_YEARS,
  LIFE_MIN_AGE,
  LIFE_MIN_SUM_ASSURED_FILS,
  LIFE_MIN_TERM_YEARS,
  LIFE_SUM_ASSURED_STEP_FILS,
} from './insurance-life';
import {
  MEDICAL_ADULT_MAX_AGE,
  MEDICAL_ADULT_MIN_AGE,
  MEDICAL_CHILD_MAX_AGE,
  MEDICAL_DEFAULT_PRIMARY_AGE,
  MEDICAL_MAX_CHILDREN,
  MEDICAL_NATIONALITIES,
  MEDICAL_TIERS,
  type MedicalNationality,
  type MedicalTier,
} from './insurance-medical';
import { claimRules, type ClaimRules } from './claims';

/**
 * Product rules the apps need to build their screens (GET /api/v1/config). The Flutter app has no business
 * rules of its own: slider ranges, steps, defaults and the consent period all come from here, and the web
 * imports the same values from this package.
 * ⚠️ Placeholder values until BCFC Risk / Product confirm them.
 */

/** ⚠️ VERIFY: amount the personal finance slider starts at. */
export const PERSONAL_FINANCE_DEFAULT_FILS: Fils = bhd(5_000);
/** Personal finance amount slider step. */
export const PERSONAL_FINANCE_STEP_FILS: Fils = bhd(100);
/** ⚠️ VERIFY: deposit to reserve a car (web and app show the same amount). */
export const RESERVATION_DEPOSIT_FILS: Fils = bhd(100);

export interface CalculatorRules {
  minTenureMonths: number;
  maxTenureMonths: number;
  minDownPaymentPct: number;
  /** Listing default ("from BHD X / month") */
  defaultDownPaymentPct: number;
  defaultTenureMonths: number;
  downPaymentStepFils: Fils;
  tenureStepMonths: number;
  structures: FinanceStructure[];
}

export function calculatorRules(productLine: ProductLine): CalculatorRules {
  const card = RATE_CARDS[productLine];
  const defaults = LISTING_DEFAULTS[productLine];
  return {
    minTenureMonths: card.minTenureMonths,
    maxTenureMonths: card.maxTenureMonths,
    minDownPaymentPct: card.minDownPaymentPct,
    defaultDownPaymentPct: defaults.downPaymentPct,
    defaultTenureMonths: defaults.tenureMonths,
    ...CALCULATOR_STEPS[productLine],
    structures: [...card.structures],
  };
}

export interface PersonalFinanceRange {
  /** The customer's indicative personal finance limit */
  preApprovedFils: Fils;
  minAmountFils: Fils;
  /** Pre-approved limit rounded down to a step, never below the minimum */
  maxAmountFils: Fils;
  defaultAmountFils: Fils;
  amountStepFils: Fils;
  defaultTenureMonths: number;
  tenureStepMonths: number;
  minTenureMonths: number;
  maxTenureMonths: number;
}

/** Personal finance slider for a customer: from the product minimum up to their pre-approved limit. */
export function personalFinanceRange(preApproval: PreApproval): PersonalFinanceRange {
  const preApprovedFils = preApproval.limits.find((l) => l.productLine === 'personal')?.maxFinanceFils ?? 0;
  const step = PERSONAL_FINANCE_STEP_FILS;
  const maxAmountFils = Math.max(MIN_PERSONAL_FINANCE_FILS, Math.floor(preApprovedFils / step) * step);
  const rules = calculatorRules('personal');
  return {
    preApprovedFils,
    minAmountFils: MIN_PERSONAL_FINANCE_FILS,
    maxAmountFils,
    defaultAmountFils: Math.min(PERSONAL_FINANCE_DEFAULT_FILS, maxAmountFils),
    amountStepFils: step,
    defaultTenureMonths: rules.defaultTenureMonths,
    tenureStepMonths: rules.tenureStepMonths,
    minTenureMonths: rules.minTenureMonths,
    maxTenureMonths: rules.maxTenureMonths,
  };
}

/** Travel, home, medical and life insurance form rules (the API still validates every request). */
export interface InsuranceRules {
  travel: {
    regions: TravelRegion[];
    tiers: TravelTier[];
    minAdults: number;
    maxAdults: number;
    maxChildren: number;
    maxTripDays: number;
    /** Latest start date, in days from today (Bahrain date) */
    maxDaysAhead: number;
    defaultStartInDays: number;
    defaultTripDays: number;
  };
  home: {
    propertyTypes: PropertyType[];
    defaultPropertyType: PropertyType;
    defaultBuildingSumInsuredFils: Fils;
    defaultContentsSumInsuredFils: Fils;
    buildingMinFils: Fils;
    buildingMaxFils: Fils;
    contentsMinFils: Fils;
    contentsMaxFils: Fils;
  };
  medical: {
    tiers: MedicalTier[];
    nationalities: MedicalNationality[];
    adultMinAge: number;
    adultMaxAge: number;
    childMaxAge: number;
    maxChildren: number;
    defaultPrimaryAge: number;
  };
  life: {
    minAge: number;
    maxAge: number;
    /** Cover must end by this age: age at start + term cannot exceed it */
    maxEndAge: number;
    defaultAge: number;
    minSumAssuredFils: Fils;
    maxSumAssuredFils: Fils;
    sumAssuredStepFils: Fils;
    defaultSumAssuredFils: Fils;
    minTermYears: number;
    maxTermYears: number;
    defaultTermYears: number;
  };
}

export function insuranceRules(): InsuranceRules {
  return {
    travel: {
      regions: [...TRAVEL_REGIONS],
      tiers: [...TRAVEL_TIERS],
      minAdults: MIN_ADULTS,
      maxAdults: MAX_ADULTS,
      maxChildren: MAX_CHILDREN,
      maxTripDays: MAX_TRIP_DAYS,
      maxDaysAhead: MAX_DAYS_AHEAD,
      defaultStartInDays: TRAVEL_DEFAULT_START_IN_DAYS,
      defaultTripDays: TRAVEL_DEFAULT_TRIP_DAYS,
    },
    home: {
      propertyTypes: [...HOME_INSURABLE_TYPES],
      defaultPropertyType: HOME_DEFAULT_INPUT.propertyType,
      defaultBuildingSumInsuredFils: HOME_DEFAULT_INPUT.buildingSumInsuredFils,
      defaultContentsSumInsuredFils: HOME_DEFAULT_INPUT.contentsSumInsuredFils,
      buildingMinFils: HOME_BUILDING_MIN_FILS,
      buildingMaxFils: HOME_BUILDING_MAX_FILS,
      contentsMinFils: HOME_CONTENTS_MIN_FILS,
      contentsMaxFils: HOME_CONTENTS_MAX_FILS,
    },
    medical: {
      tiers: [...MEDICAL_TIERS],
      nationalities: [...MEDICAL_NATIONALITIES],
      adultMinAge: MEDICAL_ADULT_MIN_AGE,
      adultMaxAge: MEDICAL_ADULT_MAX_AGE,
      childMaxAge: MEDICAL_CHILD_MAX_AGE,
      maxChildren: MEDICAL_MAX_CHILDREN,
      defaultPrimaryAge: MEDICAL_DEFAULT_PRIMARY_AGE,
    },
    life: {
      minAge: LIFE_MIN_AGE,
      maxAge: LIFE_MAX_AGE,
      maxEndAge: LIFE_MAX_END_AGE,
      defaultAge: LIFE_DEFAULT_AGE,
      minSumAssuredFils: LIFE_MIN_SUM_ASSURED_FILS,
      maxSumAssuredFils: LIFE_MAX_SUM_ASSURED_FILS,
      sumAssuredStepFils: LIFE_SUM_ASSURED_STEP_FILS,
      defaultSumAssuredFils: LIFE_DEFAULT_SUM_ASSURED_FILS,
      minTermYears: LIFE_MIN_TERM_YEARS,
      maxTermYears: LIFE_MAX_TERM_YEARS,
      defaultTermYears: LIFE_DEFAULT_TERM_YEARS,
    },
  };
}

export interface ClientConfig {
  consent: { scopes: ConsentScope[]; validityDays: number };
  finance: Record<ProductLine, CalculatorRules>;
  /** For the current customer (their pre-approved limit caps the slider) */
  personalFinance: PersonalFinanceRange;
  reservationDepositFils: Fils;
  insurance: InsuranceRules;
  /** Motor claim (FNOL) form rules */
  claims: ClaimRules;
  sandbox: true;
}

export function clientConfig(preApproval: PreApproval): ClientConfig {
  return {
    consent: { scopes: [...CONSENT_SCOPES], validityDays: CONSENT_VALIDITY_DAYS },
    finance: { vehicle: calculatorRules('vehicle'), personal: calculatorRules('personal'), home: calculatorRules('home') },
    personalFinance: personalFinanceRange(preApproval),
    reservationDepositFils: RESERVATION_DEPOSIT_FILS,
    insurance: insuranceRules(),
    claims: claimRules(),
    sandbox: true,
  };
}
