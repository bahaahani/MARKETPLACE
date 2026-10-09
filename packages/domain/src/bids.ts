import type { Fils } from './money';
import { bhd } from './money';
import { VEHICLES, findVehicle } from './catalog';
import { findDealer, type Lead } from './dealer';
import { motorQuotes } from './insurance';
import { bahrainToday, isSafeNonNegativeInt } from './insurance-common';
import { financeLimits, QuoteError, quoteFinance, type FinanceQuote } from './pricing';
import { CALCULATOR_STEPS, LISTING_DEFAULTS, RATE_CARDS } from './rates';
import type { BodyType, FuelType, Localized, Seller, Vehicle, VehicleCondition } from './types';

/**
 * "Bid For Me" (crazy idea #1): a reverse marketplace. The customer posts what they want (body type, condition, year,
 * mileage, fuel, seats) and how they want to pay (maximum monthly, structure, tenure, down payment, insurance
 * preference); partner dealers compete with a specific car from their own stock, an optional discount and extras.
 *
 * Every monthly figure is computed here with the shared pricing engine (quoteFinance) on the customer's own terms and
 * the discounted price, never taken from the dealer. A bid above the customer's maximum monthly, for a car that does
 * not match the criteria, or for a car the dealer does not sell, is rejected.
 *
 * Budget decision: the maximum monthly must fit the customer's DBR headroom (their pre-approval's maximum monthly
 * installment). A higher budget is REJECTED (422 OVER_BUDGET) with the headroom in the message rather than posted with
 * an "over budget" flag: dealers would otherwise compete on offers BCFC could not finance, and the customer would only
 * find out at the credit decision.
 *
 * Privacy (PDPL data minimization, as for the pre-approval share code): a dealer sees the criteria, the customer's
 * first name and whether they are pre-approved for that budget. Never their salary, CPR, obligations, exact headroom,
 * trade-in or customer id.
 *
 * ⚠️ SANDBOX: requests and bids live in memory; any visitor can act as any dealer; the accepted bid becomes a dealer
 * lead (with the list and bid price) and a link to the car page. The finance application on that car is priced from the
 * bid, re-validated by the server (application-carry.ts): the discount lowers the financed price and the extras are
 * recorded on the application.
 */

// ---------------------------------------------------------------------------------------------
// Rules

/** ⚠️ VERIFY: how long a request stays open for bids. */
export const BID_REQUEST_VALIDITY_HOURS = 72;
/** ⚠️ VERIFY: largest dealer discount: the lower of this amount and BID_MAX_DISCOUNT_PCT of the price. */
export const BID_MAX_DISCOUNT_FILS: Fils = bhd(3_000);
export const BID_MAX_DISCOUNT_PCT = 15;
/** Lowest maximum monthly a customer can post, and the slider step. */
export const BID_MIN_MONTHLY_FILS: Fils = bhd(50);
export const BID_MONTHLY_STEP_FILS: Fils = bhd(5);
/** Starting point of the maximum monthly slider (never above the customer's headroom). */
export const BID_DEFAULT_MONTHLY_FILS: Fils = bhd(250);
/** Largest cash down payment accepted (sandbox sanity cap). */
export const BID_MAX_CASH_DOWN_PAYMENT_FILS: Fils = bhd(100_000);
/** How many system "instant matches" a request shows. */
export const BID_INSTANT_MATCH_LIMIT = 5;
/** Oldest minimum model year offered: this many years before the current Bahrain year. */
export const BID_MAX_AGE_YEARS = 10;
/** ⚠️ VERIFY: how long after acceptance the dealer keeps the accepted price and extras for a finance application. */
export const BID_ACCEPTED_VALIDITY_DAYS = 7;
/** How often the apps refresh an open request's bids board. */
export const BID_POLL_SECONDS = 5;
/** ⚠️ Sandbox cap on requests kept per customer. */
export const BID_MAX_REQUESTS_PER_CUSTOMER = 20;

export const BID_BODY_TYPES: readonly BodyType[] = ['sedan', 'suv', 'hatchback', 'pickup', 'coupe'];
export const BID_FUELS: readonly FuelType[] = ['petrol', 'hybrid', 'electric'];
export const BID_CONDITIONS = ['any', 'new', 'used'] as const;
export type BidCondition = (typeof BID_CONDITIONS)[number];
/** Structures a request can ask for (vehicle finance). */
export const BID_STRUCTURES = ['conventional', 'murabaha'] as const;
export type BidStructure = (typeof BID_STRUCTURES)[number];
/** Takaful only, the cheapest of any insurer, or no insurance quote. */
export const BID_INSURANCE_PREFERENCES = ['takaful', 'any', 'none'] as const;
export type BidInsurancePreference = (typeof BID_INSURANCE_PREFERENCES)[number];
export const BID_SEAT_OPTIONS: readonly number[] = [4, 5, 7, 8];
export const BID_MILEAGE_OPTIONS_KM: readonly number[] = [10_000, 30_000, 50_000, 80_000, 150_000];
const MAX_MILEAGE_KM = 500_000;

/** Extras a dealer may add, from a fixed list (at most one free-service plan). */
export const BID_EXTRAS = [
  'service-1y',
  'service-2y',
  'service-3y',
  'window-tint',
  'extended-warranty',
  'free-registration',
  'floor-mats',
  'full-tank',
] as const;
export type BidExtra = (typeof BID_EXTRAS)[number];

export const BID_SORTS = ['monthly', 'total', 'extras'] as const;
export type BidSort = (typeof BID_SORTS)[number];

export type BidRequestStatus = 'OPEN' | 'CLOSED' | 'CANCELLED' | 'EXPIRED';
export type BidStatus = 'ACTIVE' | 'ACCEPTED' | 'LOST';

export type BidErrorCode =
  | 'INVALID_REQUEST'
  | 'OVER_BUDGET'
  | 'NO_TRADE_IN'
  | 'REQUEST_ALREADY_OPEN'
  | 'TOO_MANY_REQUESTS'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_CLOSED'
  | 'REQUEST_EXPIRED'
  | 'BID_NOT_FOUND'
  | 'VEHICLE_NOT_FOUND'
  | 'VEHICLE_NOT_IN_INVENTORY'
  | 'CRITERIA_MISMATCH'
  | 'INVALID_DISCOUNT'
  | 'DISCOUNT_TOO_HIGH'
  | 'INVALID_EXTRAS'
  | 'DOWN_PAYMENT_TOO_LOW'
  | 'OVER_MAX_MONTHLY';

export const BID_ERROR_STATUS: Record<BidErrorCode, number> = {
  INVALID_REQUEST: 422,
  OVER_BUDGET: 422,
  NO_TRADE_IN: 422,
  REQUEST_ALREADY_OPEN: 409,
  TOO_MANY_REQUESTS: 429,
  REQUEST_NOT_FOUND: 404,
  REQUEST_CLOSED: 409,
  REQUEST_EXPIRED: 410,
  BID_NOT_FOUND: 404,
  VEHICLE_NOT_FOUND: 404,
  VEHICLE_NOT_IN_INVENTORY: 422,
  CRITERIA_MISMATCH: 422,
  INVALID_DISCOUNT: 422,
  DISCOUNT_TOO_HIGH: 422,
  INVALID_EXTRAS: 422,
  DOWN_PAYMENT_TOO_LOW: 422,
  OVER_MAX_MONTHLY: 422,
};

export class BidError extends Error {
  constructor(
    public readonly code: BidErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BidError';
  }
}

// ---------------------------------------------------------------------------------------------
// Types

export interface BidCriteria {
  bodyType: BodyType | 'any';
  condition: BidCondition;
  /** Oldest model year accepted, or null for any */
  minYear: number | null;
  /** Highest odometer reading accepted, or null for any */
  maxMileageKm: number | null;
  fuel: FuelType | 'any';
  /** Fewest seats accepted, or null for any */
  minSeats: number | null;
}

export interface BidTradeIn {
  offerId: string;
  offerFils: Fils;
  /** Last Bahrain day the trade-in offer is valid */
  validUntil: string;
}

export interface BidTerms {
  maxMonthlyFils: Fils;
  structure: BidStructure;
  tenureMonths: number;
  /** Cash part of the down payment */
  cashDownPaymentFils: Fils;
  /** Active trade-in offer used towards the down payment (credited at delivery, ⚠️ sandbox) */
  tradeIn: BidTradeIn | null;
  /** cash + trade-in: the down payment every offer is priced with (capped per car at the maximum down payment) */
  downPaymentFils: Fils;
  insurance: BidInsurancePreference;
}

export interface BidVehicle {
  id: string;
  title: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  condition: VehicleCondition;
  mileageKm: number;
  bodyType: BodyType;
  fuel: FuelType;
  seats: number;
  accentHue: number;
}

export interface BidInsuranceEstimate {
  insurerId: string;
  insurerName: Localized;
  takaful: boolean;
  /** First-year comprehensive premium on the (discounted) price, cheapest matching insurer (⚠️ demo pricing) */
  annualPremiumFils: Fils;
}

/** An offer priced on the customer's terms (server-side, shared pricing engine). */
export interface BidPricing {
  listPriceFils: Fils;
  discountFils: Fils;
  /** Price after the discount; the asset price financed */
  priceFils: Fils;
  /** Down payment used for this car: the customer's, capped at the maximum down payment */
  downPaymentFils: Fils;
  quote: FinanceQuote;
  monthlyFils: Fils;
  /** Down payment + every installment */
  totalCostFils: Fils;
  insurance: BidInsuranceEstimate | null;
}

export interface Bid {
  id: string;
  requestId: string;
  sellerId: string;
  seller: Seller;
  vehicle: BidVehicle;
  extras: BidExtra[];
  pricing: BidPricing;
  status: BidStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InstantMatch {
  vehicle: BidVehicle;
  seller: Seller;
  pricing: BidPricing;
  /** Locale-free car page path */
  href: string;
}

export interface BidRequest {
  id: string;
  customerId: string;
  /** First name only: all a dealer learns of the customer's identity */
  firstName: Localized;
  /** First name and initial, for the dealer lead once a bid is accepted */
  displayName: Localized;
  criteria: BidCriteria;
  terms: BidTerms;
  /** The pre-approval was valid and covered the maximum monthly when posted */
  preApproved: boolean;
  status: BidRequestStatus;
  instantMatches: InstantMatch[];
  /** Current bid per dealer (a new bid replaces the dealer's previous one) */
  bids: Bid[];
  acceptedBidId?: string;
  createdAt: string;
  expiresAt: string;
  closedAt?: string;
}

/** What the store needs to know about the customer when they post. */
export interface BidCustomer {
  customerId: string;
  name: Localized;
  /** DBR headroom: the pre-approval's maximum monthly installment */
  maxMonthlyFils: Fils;
  /** ISO date until which the pre-approval is valid */
  preApprovalValidUntil: string;
}

export function bidCustomerFrom(c: { customerId: string; name: Localized; preApproval: { maxMonthlyFils: Fils; validUntil: string } }): BidCustomer {
  return { customerId: c.customerId, name: c.name, maxMonthlyFils: c.preApproval.maxMonthlyFils, preApprovalValidUntil: c.preApproval.validUntil };
}

// ---------------------------------------------------------------------------------------------
// Rules for the apps (GET /config `bids`)

export interface BidRules {
  bodyTypes: BodyType[];
  conditions: BidCondition[];
  fuels: FuelType[];
  seatOptions: number[];
  mileageOptionsKm: number[];
  minYear: number;
  maxYear: number;
  structures: BidStructure[];
  minTenureMonths: number;
  maxTenureMonths: number;
  tenureStepMonths: number;
  defaultTenureMonths: number;
  downPaymentStepFils: Fils;
  maxCashDownPaymentFils: Fils;
  minMonthlyFils: Fils;
  /** This customer's DBR headroom on the monthly step: the highest maximum monthly they can post */
  maxMonthlyFils: Fils;
  monthlyStepFils: Fils;
  defaultMonthlyFils: Fils;
  /** false when the headroom is below the minimum monthly */
  canPost: boolean;
  insurancePreferences: BidInsurancePreference[];
  extras: BidExtra[];
  maxDiscountFils: Fils;
  maxDiscountPct: number;
  validityHours: number;
  pollSeconds: number;
  /** The customer's active trade-in offer, which can go towards the down payment */
  tradeIn: BidTradeIn | null;
}

export function bidYearBounds(now: Date = new Date()): { minYear: number; maxYear: number } {
  const year = Number(bahrainToday(now).slice(0, 4));
  return { minYear: year - BID_MAX_AGE_YEARS, maxYear: year + 1 };
}

export function bidRules(headroomFils: Fils, tradeIn: BidTradeIn | null = null, now: Date = new Date()): BidRules {
  const card = RATE_CARDS.vehicle;
  const step = BID_MONTHLY_STEP_FILS;
  const maxMonthlyFils = Math.max(0, Math.floor(headroomFils / step) * step);
  const canPost = maxMonthlyFils >= BID_MIN_MONTHLY_FILS;
  return {
    bodyTypes: [...BID_BODY_TYPES],
    conditions: [...BID_CONDITIONS],
    fuels: [...BID_FUELS],
    seatOptions: [...BID_SEAT_OPTIONS],
    mileageOptionsKm: [...BID_MILEAGE_OPTIONS_KM],
    ...bidYearBounds(now),
    structures: [...BID_STRUCTURES],
    minTenureMonths: card.minTenureMonths,
    maxTenureMonths: card.maxTenureMonths,
    tenureStepMonths: CALCULATOR_STEPS.vehicle.tenureStepMonths,
    defaultTenureMonths: LISTING_DEFAULTS.vehicle.tenureMonths,
    downPaymentStepFils: CALCULATOR_STEPS.vehicle.downPaymentStepFils,
    maxCashDownPaymentFils: BID_MAX_CASH_DOWN_PAYMENT_FILS,
    minMonthlyFils: BID_MIN_MONTHLY_FILS,
    maxMonthlyFils,
    monthlyStepFils: step,
    defaultMonthlyFils: canPost ? Math.max(BID_MIN_MONTHLY_FILS, Math.min(BID_DEFAULT_MONTHLY_FILS, maxMonthlyFils)) : BID_MIN_MONTHLY_FILS,
    canPost,
    insurancePreferences: [...BID_INSURANCE_PREFERENCES],
    extras: [...BID_EXTRAS],
    maxDiscountFils: BID_MAX_DISCOUNT_FILS,
    maxDiscountPct: BID_MAX_DISCOUNT_PCT,
    validityHours: BID_REQUEST_VALIDITY_HOURS,
    pollSeconds: BID_POLL_SECONDS,
    tradeIn,
  };
}

// ---------------------------------------------------------------------------------------------
// Validation, matching and pricing

const DEFAULT_CRITERIA: BidCriteria = { bodyType: 'any', condition: 'any', minYear: null, maxMileageKm: null, fuel: 'any', minSeats: null };

function oneOf<T extends string>(value: unknown, options: readonly T[], field: string, fallback?: T): T {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    throw new BidError('INVALID_REQUEST', `${field} must be one of ${options.join(', ')}`);
  }
  return value as T;
}

function optionalInt(value: unknown, field: string, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new BidError('INVALID_REQUEST', `${field} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

/** Validates the criteria part of a request body (unknown input from the API). */
export function parseBidCriteria(input: Record<string, unknown>, now: Date = new Date()): BidCriteria {
  const { minYear, maxYear } = bidYearBounds(now);
  const minSeats = optionalInt(input.minSeats, 'minSeats', 1, 9);
  if (minSeats !== null && !BID_SEAT_OPTIONS.includes(minSeats)) {
    throw new BidError('INVALID_REQUEST', `minSeats must be one of ${BID_SEAT_OPTIONS.join(', ')}`);
  }
  return {
    bodyType: oneOf(input.bodyType, ['any', ...BID_BODY_TYPES], 'bodyType', DEFAULT_CRITERIA.bodyType),
    condition: oneOf(input.condition, BID_CONDITIONS, 'condition', DEFAULT_CRITERIA.condition),
    minYear: optionalInt(input.minYear, 'minYear', minYear, maxYear),
    maxMileageKm: optionalInt(input.maxMileageKm, 'maxMileageKm', 0, MAX_MILEAGE_KM),
    fuel: oneOf(input.fuel, ['any', ...BID_FUELS], 'fuel', DEFAULT_CRITERIA.fuel),
    minSeats,
  };
}

export type CriteriaMismatch = 'bodyType' | 'condition' | 'year' | 'mileage' | 'fuel' | 'seats';

/** Which criteria a car fails (empty: it matches). */
export function criteriaMismatches(v: Vehicle, c: BidCriteria): CriteriaMismatch[] {
  const out: CriteriaMismatch[] = [];
  if (c.bodyType !== 'any' && v.bodyType !== c.bodyType) out.push('bodyType');
  if (c.condition !== 'any' && v.condition !== c.condition) out.push('condition');
  if (c.minYear !== null && v.year < c.minYear) out.push('year');
  if (c.maxMileageKm !== null && v.mileageKm > c.maxMileageKm) out.push('mileage');
  if (c.fuel !== 'any' && v.fuel !== c.fuel) out.push('fuel');
  if (c.minSeats !== null && v.seats < c.minSeats) out.push('seats');
  return out;
}

export function matchesCriteria(v: Vehicle, c: BidCriteria): boolean {
  return criteriaMismatches(v, c).length === 0;
}

/** Largest discount a dealer may give on a car: the lower of BHD 3,000 and 15% of its price (⚠️ placeholder). */
export function maxBidDiscount(listPriceFils: Fils): Fils {
  return Math.min(BID_MAX_DISCOUNT_FILS, Math.floor((listPriceFils * BID_MAX_DISCOUNT_PCT) / 100));
}

export function bidVehicle(v: Vehicle): BidVehicle {
  return {
    id: v.id,
    title: `${v.make} ${v.model} ${v.year}`,
    make: v.make,
    model: v.model,
    trim: v.trim,
    year: v.year,
    condition: v.condition,
    mileageKm: v.mileageKm,
    bodyType: v.bodyType,
    fuel: v.fuel,
    seats: v.seats,
    accentHue: v.accentHue,
  };
}

function insuranceEstimate(priceFils: Fils, pref: BidInsurancePreference): BidInsuranceEstimate | null {
  if (pref === 'none') return null;
  const best = motorQuotes({ vehicleValueFils: priceFils, cover: 'comprehensive', takafulOnly: pref === 'takaful' })[0];
  return best ? { insurerId: best.insurerId, insurerName: best.insurerName, takaful: best.takaful, annualPremiumFils: best.annualPremiumFils } : null;
}

/**
 * Prices a car on the customer's terms with the shared engine: the discounted price, their structure and tenure, and
 * their down payment (capped at the car's maximum down payment). A car whose minimum down payment is above the
 * customer's is DOWN_PAYMENT_TOO_LOW.
 */
export function priceBidOffer(v: Vehicle, terms: BidTerms, discountFils: Fils = 0): BidPricing {
  const priceFils = v.priceFils - discountFils;
  const limits = financeLimits('vehicle', priceFils);
  const downPaymentFils = Math.min(terms.downPaymentFils, limits.maxDownPaymentFils);
  if (downPaymentFils < limits.minDownPaymentFils) {
    throw new BidError('DOWN_PAYMENT_TOO_LOW', `this car needs a down payment of at least ${limits.minDownPaymentFils} fils`);
  }
  const quote = quoteFinance({ productLine: 'vehicle', structure: terms.structure, assetPriceFils: priceFils, downPaymentFils, tenureMonths: terms.tenureMonths });
  return {
    listPriceFils: v.priceFils,
    discountFils,
    priceFils,
    downPaymentFils,
    quote,
    monthlyFils: quote.monthlyFils,
    totalCostFils: downPaymentFils + quote.totalPayableFils,
    insurance: insuranceEstimate(priceFils, terms.insurance),
  };
}

/** Like priceBidOffer, but undefined when the car cannot be priced on these terms. */
function tryPrice(v: Vehicle, terms: BidTerms, discountFils = 0): BidPricing | undefined {
  try {
    return priceBidOffer(v, terms, discountFils);
  } catch (e) {
    if (e instanceof BidError || e instanceof QuoteError) return undefined;
    throw e;
  }
}

/** System "instant matches": every catalogue car that matches and fits the budget, cheapest monthly first. */
export function instantMatches(criteria: BidCriteria, terms: BidTerms, catalogue: Vehicle[] = VEHICLES, limit = BID_INSTANT_MATCH_LIMIT): InstantMatch[] {
  return catalogue
    .filter((v) => matchesCriteria(v, criteria))
    .flatMap((v) => {
      const pricing = tryPrice(v, terms);
      return pricing && pricing.monthlyFils <= terms.maxMonthlyFils ? [{ vehicle: bidVehicle(v), seller: v.seller, pricing, href: `/cars/${v.id}` }] : [];
    })
    .sort((a, b) => a.pricing.monthlyFils - b.pricing.monthlyFils || a.pricing.totalCostFils - b.pricing.totalCostFils || a.vehicle.id.localeCompare(b.vehicle.id))
    .slice(0, limit);
}

/** Extras value for ranking: a free-service plan counts its years, every other extra counts one. */
export function extrasScore(extras: readonly BidExtra[]): number {
  return extras.reduce((s, e) => s + (e.startsWith('service-') ? Number(e.slice(8, 9)) : 1), 0);
}

function parseExtras(value: unknown): BidExtra[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((x) => typeof x === 'string' && (BID_EXTRAS as readonly string[]).includes(x))) {
    throw new BidError('INVALID_EXTRAS', `extras must come from ${BID_EXTRAS.join(', ')}`);
  }
  const unique = [...new Set(value as BidExtra[])];
  if (unique.filter((e) => e.startsWith('service-')).length > 1) throw new BidError('INVALID_EXTRAS', 'at most one free-service plan');
  return BID_EXTRAS.filter((e) => unique.includes(e));
}

/** Bids ranked for the customer: live and accepted bids first, then by the chosen key; lost bids last. */
export function sortBids(bids: readonly Bid[], sort: BidSort = 'monthly'): Bid[] {
  const key: Record<BidSort, (a: Bid, b: Bid) => number> = {
    monthly: (a, b) => a.pricing.monthlyFils - b.pricing.monthlyFils || a.pricing.totalCostFils - b.pricing.totalCostFils,
    total: (a, b) => a.pricing.totalCostFils - b.pricing.totalCostFils || a.pricing.monthlyFils - b.pricing.monthlyFils,
    extras: (a, b) => extrasScore(b.extras) - extrasScore(a.extras) || a.pricing.monthlyFils - b.pricing.monthlyFils,
  };
  return [...bids].sort((a, b) => Number(a.status === 'LOST') - Number(b.status === 'LOST') || key[sort](a, b) || a.createdAt.localeCompare(b.createdAt));
}

export function isBidSort(x: unknown): x is BidSort {
  return typeof x === 'string' && (BID_SORTS as readonly string[]).includes(x);
}

// ---------------------------------------------------------------------------------------------
// Views

export interface CustomerBidView extends Bid {
  /** 1-based position in the chosen ranking (live bids only) */
  rank: number | null;
  extrasScore: number;
}

/** GET /requests/{id} and /me/requests: everything the customer posted, plus the ranked bids. */
export interface BidRequestView extends Omit<BidRequest, 'bids'> {
  bids: CustomerBidView[];
  sort: BidSort;
  /** Live bids */
  bidCount: number;
  canAccept: boolean;
  canCancel: boolean;
  /** After acceptance: the car and the link to apply for finance on it (the existing car page) */
  accepted: { bidId: string; vehicleId: string; sellerId: string; applyHref: string; validUntil: string } | null;
  pollSeconds: number;
  sandbox: true;
}

/** ISO timestamp until which an accepted bid's price and extras can be used for a finance application. */
export function bidAcceptedUntil(r: Pick<BidRequest, 'closedAt' | 'createdAt'>): string {
  return new Date(Date.parse(r.closedAt ?? r.createdAt) + BID_ACCEPTED_VALIDITY_DAYS * 24 * 3600 * 1000).toISOString();
}

export function bidRequestView(r: BidRequest, sort: BidSort = 'monthly'): BidRequestView {
  const ranked = sortBids(r.bids, sort);
  let n = 0;
  const bids = ranked.map((b) => ({ ...b, rank: b.status === 'LOST' ? null : ++n, extrasScore: extrasScore(b.extras) }));
  const acc = r.acceptedBidId ? r.bids.find((b) => b.id === r.acceptedBidId) : undefined;
  return {
    ...r,
    bids,
    sort,
    bidCount: r.bids.filter((b) => b.status === 'ACTIVE').length,
    canAccept: r.status === 'OPEN' && r.bids.some((b) => b.status === 'ACTIVE'),
    canCancel: r.status === 'OPEN',
    accepted: acc
      ? {
          bidId: acc.id,
          vehicleId: acc.vehicle.id,
          sellerId: acc.sellerId,
          // The car page prices the application from this bid; the server re-validates it when the customer applies.
          applyHref: `/cars/${acc.vehicle.id}?requestId=${encodeURIComponent(r.id)}&bidId=${encodeURIComponent(acc.id)}`,
          validUntil: bidAcceptedUntil(r),
        }
      : null,
    pollSeconds: BID_POLL_SECONDS,
    sandbox: true,
  };
}

/** A dealer's own bid, as the dealer sees it. */
export type DealerBidView = Omit<Bid, 'requestId'>;

export interface DealerMatchingVehicle {
  vehicle: BidVehicle;
  /** Priced at list price on the customer's terms; null when the customer's down payment is below this car's minimum */
  listPricing: BidPricing | null;
  withinBudget: boolean;
  maxDiscountFils: Fils;
}

/**
 * What a dealer sees of an open request (data minimization): the criteria, the terms needed to price a car, the
 * customer's first name and whether they are pre-approved for this budget. No customer id, salary, CPR, obligations,
 * headroom, trade-in or other dealers' bids (only how many there are).
 */
export interface DealerRequestView {
  id: string;
  firstName: Localized;
  preApproved: boolean;
  criteria: BidCriteria;
  terms: Pick<BidTerms, 'maxMonthlyFils' | 'structure' | 'tenureMonths' | 'downPaymentFils' | 'insurance'>;
  status: BidRequestStatus;
  createdAt: string;
  expiresAt: string;
  bidCount: number;
  myBid: DealerBidView | null;
  /** This dealer's stock that matches the criteria */
  matchingVehicles: DealerMatchingVehicle[];
}

export function dealerRequestView(r: BidRequest, sellerId: string): DealerRequestView {
  const mine = r.bids.find((b) => b.sellerId === sellerId);
  const t = r.terms;
  return {
    id: r.id,
    firstName: { ...r.firstName },
    preApproved: r.preApproved,
    criteria: { ...r.criteria },
    terms: { maxMonthlyFils: t.maxMonthlyFils, structure: t.structure, tenureMonths: t.tenureMonths, downPaymentFils: t.downPaymentFils, insurance: t.insurance },
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    bidCount: r.bids.filter((b) => b.status === 'ACTIVE').length,
    myBid: mine ? (({ requestId: _r, ...rest }) => rest)(mine) : null,
    matchingVehicles: dealerStock(sellerId)
      .filter((v) => matchesCriteria(v, r.criteria))
      .map((v) => {
        const listPricing = tryPrice(v, r.terms) ?? null;
        return { vehicle: bidVehicle(v), listPricing, withinBudget: !!listPricing && listPricing.monthlyFils <= t.maxMonthlyFils, maxDiscountFils: maxBidDiscount(v.priceFils) };
      }),
  };
}

function dealerStock(sellerId: string): Vehicle[] {
  return VEHICLES.filter((v) => v.seller.id === sellerId);
}

/** The dealer lead an accepted bid creates (first name and initial only, like every lead). */
export function leadFromAcceptedBid(r: BidRequest, bid: Bid, now: Date = new Date()): Lead {
  const at = now.toISOString();
  return {
    id: `lead-${bid.id}`,
    sellerId: bid.sellerId,
    vehicleId: bid.vehicle.id,
    vehicleTitle: bid.vehicle.title,
    customerName: { ...r.displayName },
    source: 'bid',
    status: 'NEW',
    preApproved: r.preApproved,
    bid: { listPriceFils: bid.pricing.listPriceFils, priceFils: bid.pricing.priceFils, discountFils: bid.pricing.discountFils, extras: [...bid.extras] },
    createdAt: at,
    updatedAt: at,
  };
}

function names(name: Localized): { firstName: Localized; displayName: Localized } {
  const parts = (s: string) => s.trim().split(/\s+/);
  const first = (s: string) => parts(s)[0] ?? '';
  const initial = (s: string) => {
    const p = parts(s);
    return p.length > 1 ? `${first(s)} ${[...p[p.length - 1]!][0]}.` : first(s);
  };
  return { firstName: { en: first(name.en), ar: first(name.ar) }, displayName: { en: initial(name.en), ar: initial(name.ar) } };
}

// ---------------------------------------------------------------------------------------------
// Store

export interface BidStoreOptions {
  clock?: () => Date;
  /** Called with the dealer lead when a customer accepts a bid (e.g. appended to the dealer leads store) */
  onAccepted?: (lead: Lead) => void;
}

/**
 * ⚠️ Sandbox request and bid store (in memory). Production: a marketplace service with dealer notifications.
 * Requests belong to the posting customer (another customer's id reads as not found); expiry is applied on every read.
 */
export class SandboxBidStore {
  private readonly requests = new Map<string, BidRequest>();
  private seq = 0;
  private readonly clock: () => Date;
  private readonly onAccepted?: (lead: Lead) => void;

  constructor(opts: BidStoreOptions = {}) {
    this.clock = opts.clock ?? (() => new Date());
    this.onAccepted = opts.onAccepted;
  }

  /**
   * Posts a request. `tradeIn` is the customer's active trade-in offer (used when the body says `useTradeIn: true`).
   * Throws OVER_BUDGET when the maximum monthly is above the customer's DBR headroom.
   */
  post(customer: BidCustomer, input: unknown, tradeIn: BidTradeIn | null = null): BidRequest {
    const now = this.clock();
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new BidError('INVALID_REQUEST', 'body must be an object');
    const body = input as Record<string, unknown>;
    const mine = this.list(customer.customerId);
    if (mine.some((r) => r.status === 'OPEN')) throw new BidError('REQUEST_ALREADY_OPEN', 'you already have an open request: accept a bid or cancel it first');
    if (mine.length >= BID_MAX_REQUESTS_PER_CUSTOMER) throw new BidError('TOO_MANY_REQUESTS', `sandbox limit of ${BID_MAX_REQUESTS_PER_CUSTOMER} requests per customer`);

    const criteria = parseBidCriteria(body, now);
    const terms = this.parseTerms(body, customer, tradeIn);
    const at = now.toISOString();
    const request: BidRequest = {
      id: `breq_sbx_${now.getTime().toString(36)}_${(++this.seq).toString(36)}`,
      customerId: customer.customerId,
      ...names(customer.name),
      criteria,
      terms,
      preApproved: customer.preApprovalValidUntil >= bahrainToday(now) && terms.maxMonthlyFils <= customer.maxMonthlyFils,
      status: 'OPEN',
      instantMatches: instantMatches(criteria, terms),
      bids: [],
      createdAt: at,
      expiresAt: new Date(now.getTime() + BID_REQUEST_VALIDITY_HOURS * 3600 * 1000).toISOString(),
    };
    this.requests.set(request.id, request);
    return request;
  }

  private parseTerms(body: Record<string, unknown>, customer: BidCustomer, tradeIn: BidTradeIn | null): BidTerms {
    const card = RATE_CARDS.vehicle;
    const { maxMonthlyFils, tenureMonths, downPaymentFils } = body;
    if (typeof maxMonthlyFils !== 'number' || !Number.isSafeInteger(maxMonthlyFils) || maxMonthlyFils < BID_MIN_MONTHLY_FILS) {
      throw new BidError('INVALID_REQUEST', `maxMonthlyFils must be a whole number of fils, at least ${BID_MIN_MONTHLY_FILS}`);
    }
    if (maxMonthlyFils > customer.maxMonthlyFils) {
      throw new BidError(
        'OVER_BUDGET',
        `the maximum monthly is above what your debt-burden ratio allows (up to ${customer.maxMonthlyFils} fils a month): lower it to post`,
      );
    }
    if (typeof tenureMonths !== 'number' || !Number.isInteger(tenureMonths) || tenureMonths < card.minTenureMonths || tenureMonths > card.maxTenureMonths) {
      throw new BidError('INVALID_REQUEST', `tenureMonths must be from ${card.minTenureMonths} to ${card.maxTenureMonths}`);
    }
    const cash = downPaymentFils ?? 0;
    if (!isSafeNonNegativeInt(cash) || cash > BID_MAX_CASH_DOWN_PAYMENT_FILS) {
      throw new BidError('INVALID_REQUEST', `downPaymentFils must be a whole number of fils from 0 to ${BID_MAX_CASH_DOWN_PAYMENT_FILS}`);
    }
    if (body.useTradeIn !== undefined && typeof body.useTradeIn !== 'boolean') throw new BidError('INVALID_REQUEST', 'useTradeIn must be a boolean');
    const useTradeIn = body.useTradeIn === true;
    if (useTradeIn && !tradeIn) throw new BidError('NO_TRADE_IN', 'there is no active trade-in offer to use');
    const ti = useTradeIn && tradeIn ? { ...tradeIn } : null;
    return {
      maxMonthlyFils,
      structure: oneOf(body.structure, BID_STRUCTURES, 'structure'),
      tenureMonths,
      cashDownPaymentFils: cash,
      tradeIn: ti,
      downPaymentFils: cash + (ti?.offerFils ?? 0),
      insurance: oneOf(body.insurance, BID_INSURANCE_PREFERENCES, 'insurance', 'takaful'),
    };
  }

  /** The customer's requests, newest first. */
  list(customerId: string): BidRequest[] {
    return [...this.requests.values()]
      .filter((r) => r.customerId === customerId)
      .map((r) => this.expire(r))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  /** With another customer's id this is undefined, like an unknown request. */
  get(id: string, customerId: string): BidRequest | undefined {
    const r = this.requests.get(id);
    return r && r.customerId === customerId ? this.expire(r) : undefined;
  }

  /** Open requests a dealer can bid on: at least one car of theirs matches, or they already bid. Newest first. */
  openForDealer(sellerId: string): DealerRequestView[] {
    this.assertDealer(sellerId);
    const stock = dealerStock(sellerId);
    return [...this.requests.values()]
      .map((r) => this.expire(r))
      .filter((r) => r.status === 'OPEN' && (r.bids.some((b) => b.sellerId === sellerId) || stock.some((v) => matchesCriteria(v, r.criteria))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map((r) => dealerRequestView(r, sellerId));
  }

  /**
   * A dealer's bid: a car from their own stock that matches the criteria, an optional discount (capped) and extras.
   * The monthly is computed here on the customer's terms; above their maximum monthly it is rejected. A new bid
   * replaces the dealer's previous one (new id), so a customer can never accept a version they did not see.
   */
  bid(sellerId: string, requestId: string, input: unknown): Bid {
    const seller = this.assertDealer(sellerId);
    const r = this.requests.get(requestId);
    if (!r) throw new BidError('REQUEST_NOT_FOUND', `request ${requestId} not found`);
    this.assertOpen(this.expire(r));
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new BidError('INVALID_REQUEST', 'body must be an object');
    const body = input as Record<string, unknown>;
    if (typeof body.vehicleId !== 'string' || !body.vehicleId) throw new BidError('INVALID_REQUEST', 'vehicleId is required');
    const v = findVehicle(body.vehicleId);
    if (!v) throw new BidError('VEHICLE_NOT_FOUND', `vehicle ${body.vehicleId} not found`);
    if (v.seller.id !== sellerId) throw new BidError('VEHICLE_NOT_IN_INVENTORY', `vehicle ${v.id} is not in ${sellerId}'s inventory`);
    const mismatches = criteriaMismatches(v, r.criteria);
    if (mismatches.length) throw new BidError('CRITERIA_MISMATCH', `vehicle does not match the request: ${mismatches.join(', ')}`);
    const discountFils = body.discountFils ?? 0;
    if (!isSafeNonNegativeInt(discountFils)) throw new BidError('INVALID_DISCOUNT', 'discountFils must be a whole number of fils, 0 or more');
    const cap = maxBidDiscount(v.priceFils);
    if (discountFils > cap) throw new BidError('DISCOUNT_TOO_HIGH', `the discount on this car is capped at ${cap} fils`);
    const extras = parseExtras(body.extras);
    const pricing = priceBidOffer(v, r.terms, discountFils);
    if (pricing.monthlyFils > r.terms.maxMonthlyFils) {
      throw new BidError('OVER_MAX_MONTHLY', `the monthly (${pricing.monthlyFils} fils) is above the customer's maximum (${r.terms.maxMonthlyFils} fils)`);
    }
    const now = this.clock();
    const at = now.toISOString();
    const previous = r.bids.find((b) => b.sellerId === sellerId);
    const bid: Bid = {
      id: `bid_sbx_${now.getTime().toString(36)}_${(++this.seq).toString(36)}`,
      requestId: r.id,
      sellerId,
      seller,
      vehicle: bidVehicle(v),
      extras,
      pricing,
      status: 'ACTIVE',
      createdAt: previous?.createdAt ?? at,
      updatedAt: at,
    };
    this.save({ ...r, bids: [...r.bids.filter((b) => b.sellerId !== sellerId), bid] });
    return bid;
  }

  /** Accepts a live bid: the request closes, the bid is ACCEPTED, every other bid LOST, and the dealer gets a lead. */
  accept(id: string, customerId: string, bidId: unknown): { request: BidRequest; bid: Bid; lead: Lead } {
    const r = this.require(id, customerId);
    this.assertOpen(r);
    if (typeof bidId !== 'string' || !bidId) throw new BidError('INVALID_REQUEST', 'bidId is required');
    const chosen = r.bids.find((b) => b.id === bidId && b.status === 'ACTIVE');
    if (!chosen) throw new BidError('BID_NOT_FOUND', `bid ${bidId} is not a live bid on this request`);
    const now = this.clock();
    const at = now.toISOString();
    const bids = r.bids.map((b): Bid => (b.id === chosen.id ? { ...b, status: 'ACCEPTED', updatedAt: at } : { ...b, status: 'LOST', updatedAt: at }));
    const request = this.save({ ...r, status: 'CLOSED', bids, acceptedBidId: chosen.id, closedAt: at });
    const bid = bids.find((b) => b.id === chosen.id)!;
    const lead = leadFromAcceptedBid(request, bid, now);
    this.onAccepted?.(lead);
    return { request, bid, lead };
  }

  /** Cancels an open request; its live bids are LOST. */
  cancel(id: string, customerId: string): BidRequest {
    const r = this.require(id, customerId);
    this.assertOpen(r);
    const at = this.clock().toISOString();
    return this.save({ ...r, status: 'CANCELLED', closedAt: at, bids: r.bids.map((b) => ({ ...b, status: 'LOST' as const, updatedAt: at })) });
  }

  private require(id: string, customerId: string): BidRequest {
    const r = this.get(id, customerId);
    if (!r) throw new BidError('REQUEST_NOT_FOUND', `request ${id} not found`);
    return r;
  }

  private assertOpen(r: BidRequest): void {
    if (r.status === 'EXPIRED') throw new BidError('REQUEST_EXPIRED', 'this request has expired');
    if (r.status !== 'OPEN') throw new BidError('REQUEST_CLOSED', `this request is ${r.status}`);
  }

  private assertDealer(sellerId: string): Seller {
    const seller = findDealer(sellerId);
    // Unknown dealers are rejected by the dealer session first; this keeps the store safe on its own.
    if (!seller) throw new BidError('REQUEST_NOT_FOUND', `dealer ${sellerId} not found`);
    return seller;
  }

  /** OPEN past its expiry → EXPIRED (live bids LOST). */
  private expire(r: BidRequest): BidRequest {
    if (r.status !== 'OPEN' || this.clock().getTime() < Date.parse(r.expiresAt)) return r;
    return this.save({ ...r, status: 'EXPIRED', closedAt: r.expiresAt, bids: r.bids.map((b) => ({ ...b, status: 'LOST' as const })) });
  }

  private save(r: BidRequest): BidRequest {
    this.requests.set(r.id, r);
    return r;
  }
}
