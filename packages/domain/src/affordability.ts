import type { Fils } from './money';
import { presentValue } from './pricing';
import { DBR_CAP_PCT, RATE_CARDS } from './rates';
import type { ProductLine } from './types';

export interface CustomerFinancials {
  monthlySalaryFils: Fils;
  /** Existing monthly obligations from the Credit Reference Bureau / Open Banking */
  existingObligationsFils: Fils;
}

/** Highest new monthly installment allowed under the debt-burden ratio cap. */
export function maxMonthlyInstallment(f: CustomerFinancials, dbrCapPct = DBR_CAP_PCT): Fils {
  return Math.max(0, Math.floor((f.monthlySalaryFils * dbrCapPct) / 100) - f.existingObligationsFils);
}

export interface PreApprovalLimit {
  productLine: ProductLine;
  maxFinanceFils: Fils;
  maxMonthlyFils: Fils;
  tenureMonths: number;
}

export interface PreApproval {
  maxMonthlyFils: Fils;
  limits: PreApprovalLimit[];
  cardLimitFils: Fils;
  /** ISO date until which the pre-approval is valid */
  validUntil: string;
}

/**
 * Indicative pre-approval ("always-on pre-approval"): how much each product line could finance
 * with the full DBR headroom at the longest tenure, using the conventional rate as the reference.
 * ⚠️ Indicative only. Real decisions come from the decision engine with CRB data.
 */
export function preApprove(f: CustomerFinancials, now: Date = new Date()): PreApproval {
  const maxMonthlyFils = maxMonthlyInstallment(f);
  const lines: ProductLine[] = ['vehicle', 'personal', 'home'];
  const limits = lines.map((productLine) => {
    const card = RATE_CARDS[productLine];
    const tenureMonths = card.maxTenureMonths;
    const maxFinanceFils = roundDownTo(presentValue(maxMonthlyFils, card.conventionalAprPct, tenureMonths), 100_000);
    return { productLine, maxFinanceFils, maxMonthlyFils, tenureMonths };
  });
  // Placeholder card policy: 2x salary, capped at BHD 15,000, and nothing without DBR headroom.
  const cardLimitFils = maxMonthlyFils > 0 ? Math.min(roundDownTo(f.monthlySalaryFils * 2, 100_000), 15_000_000) : 0;
  const validUntil = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { maxMonthlyFils, limits, cardLimitFils, validUntil };
}

function roundDownTo(value: Fils, step: Fils): Fils {
  return Math.floor(value / step) * step;
}
