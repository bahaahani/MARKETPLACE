import type { Fils } from './money';
import { CALCULATOR_STEPS, LISTING_DEFAULTS, RATE_CARDS } from './rates';
import type { FinanceStructure, ProductLine } from './types';

export interface FinanceQuoteInput {
  productLine: ProductLine;
  structure: FinanceStructure;
  assetPriceFils: Fils;
  downPaymentFils: Fils;
  tenureMonths: number;
  /** Override the rate card (percent). Interpreted per structure: APR, flat profit, or Ijara profit rate. */
  ratePct?: number;
}

export interface FinanceQuote {
  productLine: ProductLine;
  structure: FinanceStructure;
  assetPriceFils: Fils;
  downPaymentFils: Fils;
  financedFils: Fils;
  tenureMonths: number;
  /** Regular monthly installment (or rental for Ijara) */
  monthlyFils: Fils;
  /** Last installment, which absorbs rounding */
  finalInstallmentFils: Fils;
  /** Sum of all installments */
  totalPayableFils: Fils;
  /** Interest (conventional), profit (Murabaha) or the profit portion of rentals (Ijara) */
  costOfFinanceFils: Fils;
  /** Quoted rate as published for this structure */
  ratePct: number;
  rateBasis: 'apr' | 'flat' | 'profit';
  /** Annual percentage rate, computed from the cash flows so structures are comparable */
  aprPct: number;
  /** Murabaha only: BCFC's sale price to the customer (cost + profit) */
  salePriceFils?: Fils;
}

export class QuoteError extends Error {
  constructor(
    public readonly code:
      | 'STRUCTURE_NOT_OFFERED'
      | 'TENURE_OUT_OF_RANGE'
      | 'DOWN_PAYMENT_TOO_LOW'
      | 'DOWN_PAYMENT_TOO_HIGH'
      | 'INVALID_AMOUNT',
    message: string,
  ) {
    super(message);
    this.name = 'QuoteError';
  }
}

/** Level payment for a reducing-balance loan. Returns fils, rounded up so the schedule never under-collects. */
export function amortizedPayment(principalFils: Fils, annualRatePct: number, months: number): Fils {
  if (months <= 0) throw new QuoteError('TENURE_OUT_OF_RANGE', 'months must be positive');
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.ceil(principalFils / months);
  const payment = (principalFils * r) / (1 - Math.pow(1 + r, -months));
  return Math.ceil(payment - 1e-9);
}

/** Present value of a level payment stream (inverse of amortizedPayment). */
export function presentValue(paymentFils: Fils, annualRatePct: number, months: number): Fils {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.floor(paymentFils * months);
  return Math.floor((paymentFils * (1 - Math.pow(1 + r, -months))) / r);
}

/**
 * Annual percentage rate implied by financing `principal` against equal monthly payments
 * (with an optional different final payment). Solved by bisection on the monthly rate.
 */
export function impliedApr(
  principalFils: Fils,
  monthlyFils: Fils,
  months: number,
  finalFils: Fils = monthlyFils,
): number {
  if (principalFils <= 0) return 0;
  const pv = (r: number) => {
    let sum = 0;
    for (let k = 1; k <= months; k++) {
      const p = k === months ? finalFils : monthlyFils;
      sum += p / Math.pow(1 + r, k);
    }
    return sum;
  };
  if (pv(0) <= principalFils) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > principalFils) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 12 * 100 * 100) / 100;
}

function defaultRate(productLine: ProductLine, structure: FinanceStructure): number {
  const card = RATE_CARDS[productLine];
  switch (structure) {
    case 'conventional':
      return card.conventionalAprPct;
    case 'murabaha':
      return card.murabahaFlatPct;
    case 'ijara':
      return card.ijaraProfitPct;
  }
}

export function quoteFinance(input: FinanceQuoteInput): FinanceQuote {
  const { productLine, structure, assetPriceFils, downPaymentFils, tenureMonths } = input;
  const card = RATE_CARDS[productLine];

  if (!Number.isSafeInteger(assetPriceFils) || !Number.isSafeInteger(downPaymentFils) || assetPriceFils <= 0 || downPaymentFils < 0) {
    throw new QuoteError('INVALID_AMOUNT', 'amounts must be non-negative integer fils');
  }
  if (!card.structures.includes(structure)) {
    throw new QuoteError('STRUCTURE_NOT_OFFERED', `${structure} is not offered for ${productLine}`);
  }
  if (!Number.isInteger(tenureMonths) || tenureMonths < card.minTenureMonths || tenureMonths > card.maxTenureMonths) {
    throw new QuoteError(
      'TENURE_OUT_OF_RANGE',
      `tenure must be between ${card.minTenureMonths} and ${card.maxTenureMonths} months`,
    );
  }
  const minDown = Math.ceil((assetPriceFils * card.minDownPaymentPct) / 100);
  if (downPaymentFils < minDown) {
    throw new QuoteError('DOWN_PAYMENT_TOO_LOW', `down payment must be at least ${card.minDownPaymentPct}%`);
  }
  if (downPaymentFils >= assetPriceFils) {
    throw new QuoteError('DOWN_PAYMENT_TOO_HIGH', 'down payment must be less than the price');
  }

  const financedFils = assetPriceFils - downPaymentFils;
  const ratePct = input.ratePct ?? defaultRate(productLine, structure);

  if (structure === 'murabaha') {
    // Murabaha: BCFC buys the asset, then sells it at cost + disclosed profit, paid in equal installments.
    const profitFils = Math.round((financedFils * ratePct * tenureMonths) / 100 / 12);
    const salePriceFils = financedFils + profitFils;
    const monthlyFils = Math.ceil(salePriceFils / tenureMonths);
    const finalInstallmentFils = salePriceFils - monthlyFils * (tenureMonths - 1);
    // Tiny amounts over long tenures would leave a zero or negative last installment.
    if (finalInstallmentFils <= 0) {
      throw new QuoteError('INVALID_AMOUNT', 'financed amount is too small for this tenure');
    }
    return {
      productLine,
      structure,
      assetPriceFils,
      downPaymentFils,
      financedFils,
      tenureMonths,
      monthlyFils,
      finalInstallmentFils,
      totalPayableFils: salePriceFils,
      costOfFinanceFils: profitFils,
      ratePct,
      rateBasis: 'flat',
      aprPct: impliedApr(financedFils, monthlyFils, tenureMonths, finalInstallmentFils),
      salePriceFils,
    };
  }

  // Conventional loan and Ijara rental both use a reducing-balance level payment.
  const monthlyFils = amortizedPayment(financedFils, ratePct, tenureMonths);
  const totalPayableFils = monthlyFils * tenureMonths;
  return {
    productLine,
    structure,
    assetPriceFils,
    downPaymentFils,
    financedFils,
    tenureMonths,
    monthlyFils,
    finalInstallmentFils: monthlyFils,
    totalPayableFils,
    costOfFinanceFils: totalPayableFils - financedFils,
    ratePct,
    rateBasis: structure === 'ijara' ? 'profit' : 'apr',
    aprPct: impliedApr(financedFils, monthlyFils, tenureMonths),
  };
}

/** Quote every structure offered for a product line, side by side (the Islamic / conventional toggle). */
export function compareStructures(input: Omit<FinanceQuoteInput, 'structure' | 'ratePct'>): FinanceQuote[] {
  return RATE_CARDS[input.productLine].structures.map((structure) => quoteFinance({ ...input, structure }));
}

/**
 * Clamp user input to what the rate card allows; used by sliders on web and mobile.
 * Also carries the slider steps and the listing defaults (the default down payment is rounded to a step and
 * never below the minimum), so neither app hard-codes them.
 */
export function financeLimits(productLine: ProductLine, assetPriceFils: Fils) {
  const card = RATE_CARDS[productLine];
  const { downPaymentStepFils, tenureStepMonths } = CALCULATOR_STEPS[productLine];
  const defaults = LISTING_DEFAULTS[productLine];
  const minDownPaymentFils = Math.ceil((assetPriceFils * card.minDownPaymentPct) / 100);
  const defaultDownPaymentFils = Math.max(
    minDownPaymentFils,
    Math.round((assetPriceFils * defaults.downPaymentPct) / 100 / downPaymentStepFils) * downPaymentStepFils,
  );
  return {
    minTenureMonths: card.minTenureMonths,
    maxTenureMonths: card.maxTenureMonths,
    minDownPaymentFils,
    maxDownPaymentFils: Math.floor(assetPriceFils * 0.9),
    structures: card.structures,
    downPaymentStepFils,
    tenureStepMonths,
    defaultDownPaymentFils,
    defaultTenureMonths: defaults.tenureMonths,
  };
}
