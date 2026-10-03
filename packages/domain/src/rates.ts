import type { FinanceStructure, ProductLine } from './types';

/**
 * ⚠️ ILLUSTRATIVE PRICING ONLY. Rates and limits are placeholders for the prototype.
 * Real values come from BCFC Risk / Treasury and the Shari'a board, and must respect current CBB rules.
 */
export interface RateCard {
  /** Conventional: annual interest rate (reducing balance), percent */
  conventionalAprPct: number;
  /** Murabaha: annual flat profit rate on the financed amount, percent */
  murabahaFlatPct: number;
  /** Ijara: annual profit rate used to derive the rental (reducing balance), percent */
  ijaraProfitPct: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  minDownPaymentPct: number;
  /** Which structures are offered for this line today */
  structures: FinanceStructure[];
}

export const RATE_CARDS: Record<ProductLine, RateCard> = {
  vehicle: {
    conventionalAprPct: 6.5,
    murabahaFlatPct: 3.5,
    ijaraProfitPct: 6.5,
    minTenureMonths: 12,
    maxTenureMonths: 84,
    minDownPaymentPct: 10,
    // Tasheelat Islamic: vehicle Murabaha is live
    structures: ['conventional', 'murabaha'],
  },
  personal: {
    conventionalAprPct: 7.5,
    murabahaFlatPct: 4.0, // Commodity Murabaha (coming soon)
    ijaraProfitPct: 7.5,
    minTenureMonths: 6,
    maxTenureMonths: 60,
    minDownPaymentPct: 0,
    structures: ['conventional', 'murabaha'],
  },
  home: {
    conventionalAprPct: 6.0,
    murabahaFlatPct: 3.25,
    ijaraProfitPct: 6.0, // Ijara Muntahia Bittamleek (coming soon)
    minTenureMonths: 60,
    maxTenureMonths: 300,
    minDownPaymentPct: 20,
    structures: ['conventional', 'ijara'],
  },
};

/** ⚠️ VERIFY: debt-burden ratio cap used for affordability. Placeholder value. */
export const DBR_CAP_PCT = 50;

/** Defaults used for the "from BHD X / month" price shown on listings */
export const LISTING_DEFAULTS: Record<ProductLine, { downPaymentPct: number; tenureMonths: number }> = {
  vehicle: { downPaymentPct: 20, tenureMonths: 60 },
  personal: { downPaymentPct: 0, tenureMonths: 48 },
  home: { downPaymentPct: 20, tenureMonths: 240 },
};

/**
 * Slider steps for the finance calculators on web and mobile (the app reads them from the API, never hard-codes them).
 * Personal finance moves in 6-month steps because its range (6 to 60 months) is short.
 */
export const CALCULATOR_STEPS: Record<ProductLine, { downPaymentStepFils: number; tenureStepMonths: number }> = {
  vehicle: { downPaymentStepFils: 100_000, tenureStepMonths: 12 },
  personal: { downPaymentStepFils: 100_000, tenureStepMonths: 6 },
  home: { downPaymentStepFils: 1_000_000, tenureStepMonths: 12 },
};
