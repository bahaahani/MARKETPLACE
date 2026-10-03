import type { Fils } from './money';
import { bhd } from './money';
import type { PreApproval } from './affordability';
import { CONSENT_SCOPES, CONSENT_VALIDITY_DAYS, type ConsentScope } from './onboarding';
import { MIN_PERSONAL_FINANCE_FILS } from './origination';
import { CALCULATOR_STEPS, LISTING_DEFAULTS, RATE_CARDS } from './rates';
import type { FinanceStructure, ProductLine } from './types';

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

export interface ClientConfig {
  consent: { scopes: ConsentScope[]; validityDays: number };
  finance: Record<ProductLine, CalculatorRules>;
  /** For the current customer (their pre-approved limit caps the slider) */
  personalFinance: PersonalFinanceRange;
  reservationDepositFils: Fils;
  sandbox: true;
}

export function clientConfig(preApproval: PreApproval): ClientConfig {
  return {
    consent: { scopes: [...CONSENT_SCOPES], validityDays: CONSENT_VALIDITY_DAYS },
    finance: { vehicle: calculatorRules('vehicle'), personal: calculatorRules('personal'), home: calculatorRules('home') },
    personalFinance: personalFinanceRange(preApproval),
    reservationDepositFils: RESERVATION_DEPOSIT_FILS,
    sandbox: true,
  };
}
