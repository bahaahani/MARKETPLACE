import type { Fils } from './money';
import { bhd } from './money';
import { VEHICLES, findVehicle } from './catalog';
import { addDaysIso, bahrainToday } from './insurance-common';
import { financeLimits } from './pricing';
import type { GarageVehicle } from './account';
import type { ProductLine } from './types';

/**
 * Instant trade-in valuation (crazy idea #6, product verticals §1).
 *
 * ⚠️ SANDBOX: a deterministic RULES model, not AI. Same input, same price, every time. It stands in for the planned
 * valuation service (plate lookup, photos, auction and dealer data). Reference prices are a small demo table derived
 * from the catalog where it has a new car, and illustrative values otherwise. Production values come from Tasheelat
 * Automotive's pricing desk.
 *
 * The model, in order (every step rounds down to the fils):
 * 1. Reference price of the model for its model year (older model years were cheaper new);
 * 2. age depreciation (first year, then every later year);
 * 3. mileage (a share per 5,000 km, capped);
 * 4. condition grade (excellent / good / fair / poor);
 * 5. accident history;
 * 6. dealer reconditioning and margin.
 * The result is a range around that value. The low end is the guaranteed instant offer, valid 7 days (Bahrain dates),
 * credited towards a car's down payment at delivery.
 */

export const TRADE_IN_CONDITIONS = ['excellent', 'good', 'fair', 'poor'] as const;
export type TradeInCondition = (typeof TRADE_IN_CONDITIONS)[number];

/** ⚠️ VERIFY: how long an instant offer is guaranteed, in Bahrain calendar days after the valuation day. */
export const TRADE_IN_OFFER_VALIDITY_DAYS = 7;
/** Oldest model year accepted: this many years before the current (Bahrain) year. */
export const TRADE_IN_MAX_AGE_YEARS = 15;
/** Newest model year accepted: next year's models are on sale from the autumn. */
export const TRADE_IN_MAX_YEARS_AHEAD = 1;
export const TRADE_IN_MAX_MILEAGE_KM = 500_000;
/** The range and the instant offer are rounded to this amount (also the vehicle down payment slider step). */
export const TRADE_IN_ROUNDING_FILS: Fils = bhd(100);

const BPS = 10_000;
/** ⚠️ Illustrative model parameters, in basis points. */
export const TRADE_IN_MODEL = {
  /** A model year older than the reference year was this much cheaper new, per year (newer: dearer) */
  modelYearIndexBps: 200,
  /** Depreciation of a current-model-year car */
  currentYearBps: 1_000,
  firstYearBps: 1_500,
  laterYearBps: 1_200,
  /** Per 5,000 km */
  mileagePer5000KmBps: 100,
  mileageCapBps: 4_000,
  condition: { excellent: 400, good: 0, fair: -800, poor: -2_000 } satisfies Record<TradeInCondition, number>,
  accidentBps: -1_200,
  dealerMarginBps: -1_000,
  /** Range around the valued amount */
  rangeLowBps: -700,
  rangeHighBps: 500,
} as const;

export interface TradeInReferenceModel {
  make: string;
  model: string;
  /** Price of a new car of `referenceYear` */
  referencePriceFils: Fils;
  referenceYear: number;
  /** First model year on the Bahrain market (demo) */
  firstYear: number;
  /** 'catalog' when the price is the catalog's new car */
  source: 'catalog' | 'reference';
}

/** Illustrative new prices for models the catalog sells only used, or not at all (BHD, model year 2026). */
const EXTRA_REFERENCE: [make: string, model: string, priceBhd: number, firstYear: number][] = [
  ['Honda', 'Accord', 11_900, 2005],
  ['Honda', 'Civic', 8_900, 2005],
  ['Toyota', 'Land Cruiser', 31_500, 2005],
  ['Toyota', 'Camry', 10_900, 2005],
  ['Toyota', 'Corolla', 7_900, 2005],
  ['Toyota', 'Prado', 19_900, 2005],
  ['Nissan', 'Patrol', 27_500, 2005],
  ['Nissan', 'Sunny', 5_200, 2005],
  ['Nissan', 'X-Trail', 9_800, 2005],
  ['Hyundai', 'Elantra', 7_400, 2005],
  ['Hyundai', 'Tucson', 9_200, 2005],
  ['Kia', 'Picanto', 4_300, 2005],
  ['Kia', 'Sportage', 9_000, 2005],
  ['Tesla', 'Model 3', 18_900, 2019],
  ['Tesla', 'Model Y', 20_900, 2021],
  ['Ford', 'F-150', 22_500, 2005],
  ['Ford', 'Explorer', 17_900, 2005],
  ['Mitsubishi', 'Pajero', 11_500, 2005],
  ['Lexus', 'LX', 42_000, 2005],
];

function buildReference(): TradeInReferenceModel[] {
  const out: TradeInReferenceModel[] = [];
  // New cars in the catalog give the reference price directly.
  for (const v of VEHICLES) {
    if (v.condition !== 'new' || out.some((m) => m.make === v.make && m.model === v.model)) continue;
    out.push({ make: v.make, model: v.model, referencePriceFils: v.priceFils, referenceYear: v.year, firstYear: v.make === 'HAVAL' ? 2015 : 2005, source: 'catalog' });
  }
  for (const [make, model, priceBhd, firstYear] of EXTRA_REFERENCE) {
    if (out.some((m) => m.make === make && m.model === model)) continue;
    out.push({ make, model, referencePriceFils: bhd(priceBhd), referenceYear: 2026, firstYear, source: 'reference' });
  }
  return out.sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));
}

/** ⚠️ Demo reference table: catalog new cars plus illustrative prices for other common models. */
export const TRADE_IN_REFERENCE: readonly TradeInReferenceModel[] = buildReference();

export type TradeInErrorCode =
  | 'INVALID_REQUEST'
  | 'UNKNOWN_MAKE'
  | 'UNKNOWN_MODEL'
  | 'YEAR_OUT_OF_RANGE'
  | 'MILEAGE_OUT_OF_RANGE'
  | 'INVALID_CONDITION'
  | 'INVALID_PLATE'
  | 'GARAGE_VEHICLE_NOT_FOUND';

export const TRADE_IN_ERROR_STATUS: Record<TradeInErrorCode, number> = {
  INVALID_REQUEST: 422,
  UNKNOWN_MAKE: 422,
  UNKNOWN_MODEL: 422,
  YEAR_OUT_OF_RANGE: 422,
  MILEAGE_OUT_OF_RANGE: 422,
  INVALID_CONDITION: 422,
  INVALID_PLATE: 422,
  GARAGE_VEHICLE_NOT_FOUND: 404,
};

export class TradeInError extends Error {
  constructor(
    public readonly code: TradeInErrorCode,
    message: string,
    /** Close matches the customer may have meant (makes or models) */
    public readonly suggestions: string[] = [],
  ) {
    super(message);
    this.name = 'TradeInError';
  }
}

/** What the customer tells us about their car. With `garageVehicleId`, make, model, year, mileage and plate default to My Garage. */
export interface TradeInRequest {
  make?: string;
  model?: string;
  year?: number;
  mileageKm?: number;
  condition?: string;
  accidentHistory?: boolean;
  /** Bahrain private plate, 1 to 6 digits. Only its masked form is kept or returned */
  plate?: string;
  garageVehicleId?: string;
}

export type TradeInStepCode = 'reference' | 'age' | 'mileage' | 'condition' | 'accident' | 'dealerMargin';

export interface TradeInStep {
  code: TradeInStepCode;
  /** Change applied at this step (negative lowers the value); the reference step carries the reference price */
  amountFils: Fils;
  /** Basis points applied at this step (0 for the reference) */
  bps: number;
  valueAfterFils: Fils;
}

export interface TradeInVehicle {
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  condition: TradeInCondition;
  accidentHistory: boolean;
  /** e.g. "****56": the full plate is never returned or stored */
  plateMasked?: string;
  garageVehicleId?: string;
}

export interface TradeInValuation {
  vehicle: TradeInVehicle;
  /** Age in whole model years at valuation (Bahrain year) */
  ageYears: number;
  /** Value after every step, before the range */
  valueFils: Fils;
  rangeLowFils: Fils;
  rangeHighFils: Fils;
  breakdown: TradeInStep[];
  /** Always 'rules': a deterministic rules model, not AI (⚠️ sandbox) */
  method: 'rules';
  sandbox: true;
}

export interface TradeInOffer {
  id: string;
  valuation: TradeInValuation;
  /** Guaranteed instant offer: the low end of the range */
  offerFils: Fils;
  createdAt: string;
  /** Last Bahrain calendar day the offer is valid (inclusive) */
  validUntil: string;
  /** End of validUntil in Bahrain (23:59:59.999 +03:00), as an ISO timestamp */
  expiresAt: string;
}

/** Applying an offer to a car: the down payment the calculator should start from. */
export interface TradeInApplication {
  vehicleId: string;
  offerFils: Fils;
  /** min(offer, maximum down payment), on the slider step; never below the minimum down payment */
  downPaymentFils: Fils;
  /** Part of the offer used as down payment */
  creditedFils: Fils;
  /** The offer is above the maximum down payment: the rest is not used (sandbox) */
  capped: boolean;
  /** The offer is below the minimum down payment: the customer adds this in cash */
  cashTopUpFils: Fils;
}

/** Normalizes a name for matching: lower case, letters and digits only ("Land-Cruiser" = "landcruiser"). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/** Close matches for `input` among `options` (prefix, containment or up to 2 typos); all options when none are close. */
export function suggestNames(input: string, options: string[]): string[] {
  const n = norm(input);
  const close = options.filter((o) => {
    const on = norm(o);
    return n.length > 0 && (on.startsWith(n) || n.startsWith(on) || on.includes(n) || editDistance(n, on) <= Math.max(1, Math.min(2, Math.floor(on.length / 3))));
  });
  return close.length ? close : [...options];
}

export function tradeInMakes(): string[] {
  return [...new Set(TRADE_IN_REFERENCE.map((m) => m.make))];
}

/** Finds the reference model; UNKNOWN_MAKE / UNKNOWN_MODEL with suggestions otherwise. */
export function findTradeInModel(make: string, model: string): TradeInReferenceModel {
  const makes = tradeInMakes();
  const m = makes.find((x) => norm(x) === norm(make));
  if (!m) {
    const s = suggestNames(make, makes);
    throw new TradeInError('UNKNOWN_MAKE', `we cannot value "${make}" yet. Did you mean: ${s.join(', ')}?`, s);
  }
  const models = TRADE_IN_REFERENCE.filter((r) => r.make === m);
  const ref = models.find((r) => norm(r.model) === norm(model));
  if (!ref) {
    const s = suggestNames(model, models.map((r) => r.model));
    throw new TradeInError('UNKNOWN_MODEL', `we cannot value a ${m} "${model}" yet. Did you mean: ${s.join(', ')}?`, s);
  }
  return ref;
}

export function bahrainYear(now: Date = new Date()): number {
  return Number(bahrainToday(now).slice(0, 4));
}

export function tradeInYearBounds(now: Date = new Date()): { minYear: number; maxYear: number } {
  const y = bahrainYear(now);
  return { minYear: y - TRADE_IN_MAX_AGE_YEARS, maxYear: y + TRADE_IN_MAX_YEARS_AHEAD };
}

/** Bahrain private plates: 1 to 6 digits (spaces ignored). */
export function normalizePlate(raw: string): string | undefined {
  const p = raw.replace(/\s/g, '');
  return /^\d{1,6}$/.test(p) ? p : undefined;
}

/** Shows only the last 2 characters ("123456" → "****56"); plates of 1 or 2 digits are fully masked. */
export function maskPlate(plate: string): string {
  return plate.length <= 2 ? '*'.repeat(plate.length) : '*'.repeat(plate.length - 2) + plate.slice(-2);
}

const applyBps = (value: Fils, bps: number): Fils => Math.floor((value * (BPS + bps)) / BPS);

function isSafeNonNegInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

/** Validates the request (filling it from My Garage when `garageVehicleId` is given) into a vehicle to value. */
export function resolveTradeInVehicle(req: TradeInRequest, garage: GarageVehicle[] = [], now: Date = new Date()): TradeInVehicle {
  if (typeof req !== 'object' || req === null) throw new TradeInError('INVALID_REQUEST', 'request body must be an object');
  let fromGarage: { make: string; model: string; year: number; mileageKm: number; plate: string; id: string } | undefined;
  if (req.garageVehicleId !== undefined) {
    const g = typeof req.garageVehicleId === 'string' ? garage.find((x) => x.vehicleId === req.garageVehicleId) : undefined;
    const v = g && findVehicle(g.vehicleId);
    if (!g || !v) throw new TradeInError('GARAGE_VEHICLE_NOT_FOUND', 'that car is not in your garage');
    fromGarage = { make: v.make, model: v.model, year: v.year, mileageKm: g.odometerKm, plate: g.plate, id: g.vehicleId };
  }
  const make = req.make ?? fromGarage?.make;
  const model = req.model ?? fromGarage?.model;
  const year = req.year ?? fromGarage?.year;
  const mileageKm = req.mileageKm ?? fromGarage?.mileageKm;
  if (typeof make !== 'string' || !make.trim()) throw new TradeInError('INVALID_REQUEST', 'make is required');
  if (typeof model !== 'string' || !model.trim()) throw new TradeInError('INVALID_REQUEST', 'model is required');
  const ref = findTradeInModel(make.trim(), model.trim());
  const { minYear, maxYear } = tradeInYearBounds(now);
  if (typeof year !== 'number' || !Number.isSafeInteger(year)) throw new TradeInError('INVALID_REQUEST', 'year must be a whole number');
  const first = Math.max(minYear, ref.firstYear);
  if (year < first || year > maxYear) {
    throw new TradeInError('YEAR_OUT_OF_RANGE', `year must be between ${first} and ${maxYear} for a ${ref.make} ${ref.model}`);
  }
  if (!isSafeNonNegInt(mileageKm) || mileageKm > TRADE_IN_MAX_MILEAGE_KM) {
    throw new TradeInError('MILEAGE_OUT_OF_RANGE', `mileage must be a whole number of km between 0 and ${TRADE_IN_MAX_MILEAGE_KM}`);
  }
  if (!TRADE_IN_CONDITIONS.includes(req.condition as TradeInCondition)) {
    throw new TradeInError('INVALID_CONDITION', `condition must be one of ${TRADE_IN_CONDITIONS.join(', ')}`);
  }
  if (req.accidentHistory !== undefined && typeof req.accidentHistory !== 'boolean') {
    throw new TradeInError('INVALID_REQUEST', 'accidentHistory must be true or false');
  }
  let plate: string | undefined;
  if (req.plate !== undefined && req.plate !== '') {
    plate = typeof req.plate === 'string' ? normalizePlate(req.plate) : undefined;
    if (!plate) throw new TradeInError('INVALID_PLATE', 'plate must be 1 to 6 digits');
  } else {
    plate = fromGarage?.plate;
  }
  return {
    make: ref.make,
    model: ref.model,
    year,
    mileageKm,
    condition: req.condition as TradeInCondition,
    accidentHistory: req.accidentHistory ?? false,
    ...(plate ? { plateMasked: maskPlate(plate) } : {}),
    ...(fromGarage ? { garageVehicleId: fromGarage.id } : {}),
  };
}

/** Values a car (validated with resolveTradeInVehicle). Pure and deterministic for a given `now` (Bahrain year). */
export function valueTradeIn(req: TradeInRequest, garage: GarageVehicle[] = [], now: Date = new Date()): TradeInValuation {
  const vehicle = resolveTradeInVehicle(req, garage, now);
  const ref = findTradeInModel(vehicle.make, vehicle.model);
  const P = TRADE_IN_MODEL;
  const breakdown: TradeInStep[] = [];
  const step = (code: TradeInStepCode, bps: number, before: Fils): Fils => {
    const after = applyBps(before, bps);
    breakdown.push({ code, bps, amountFils: after - before, valueAfterFils: after });
    return after;
  };

  // 1. Reference price for the model year (a model year after the reference year is indexed up).
  const yearsBefore = ref.referenceYear - vehicle.year;
  const referenceFils = applyBps(ref.referencePriceFils, -Math.min(BPS / 2, yearsBefore * P.modelYearIndexBps));
  breakdown.push({ code: 'reference', bps: 0, amountFils: referenceFils, valueAfterFils: referenceFils });

  // 2. Age: compounding, applied year by year so it is exact in integer fils.
  const ageYears = Math.max(0, bahrainYear(now) - vehicle.year);
  let aged = ageYears === 0 ? applyBps(referenceFils, -P.currentYearBps) : applyBps(referenceFils, -P.firstYearBps);
  for (let i = 1; i < ageYears; i++) aged = applyBps(aged, -P.laterYearBps);
  breakdown.push({
    code: 'age',
    bps: -Math.round(((referenceFils - aged) * BPS) / Math.max(1, referenceFils)),
    amountFils: aged - referenceFils,
    valueAfterFils: aged,
  });

  // 3-6. Mileage, condition, accident, dealer margin.
  let v = step('mileage', -Math.min(P.mileageCapBps, Math.floor((vehicle.mileageKm * P.mileagePer5000KmBps) / 5_000)), aged);
  v = step('condition', P.condition[vehicle.condition], v);
  if (vehicle.accidentHistory) v = step('accident', P.accidentBps, v);
  v = step('dealerMargin', P.dealerMarginBps, v);

  const r = TRADE_IN_ROUNDING_FILS;
  const rangeLowFils = Math.floor(applyBps(v, P.rangeLowBps) / r) * r;
  const rangeHighFils = Math.max(rangeLowFils + r, Math.ceil(applyBps(v, P.rangeHighBps) / r) * r);
  return { vehicle, ageYears, valueFils: v, rangeLowFils, rangeHighFils, breakdown, method: 'rules', sandbox: true };
}

/** The instant offer for a valuation: the low end of the range, valid through the 7th Bahrain day after today. */
export function tradeInOffer(id: string, valuation: TradeInValuation, now: Date = new Date()): TradeInOffer {
  const validUntil = addDaysIso(bahrainToday(now), TRADE_IN_OFFER_VALIDITY_DAYS);
  const expiresAt = new Date(Date.parse(`${validUntil}T23:59:59.999+03:00`)).toISOString();
  return { id, valuation, offerFils: valuation.rangeLowFils, createdAt: now.toISOString(), validUntil, expiresAt };
}

export function isOfferActive(offer: TradeInOffer, now: Date = new Date()): boolean {
  return now.getTime() <= Date.parse(offer.expiresAt);
}

/**
 * Uses an offer as a car's down payment: min(offer, maximum down payment), on the calculator's step, and never below
 * the minimum down payment (the customer then tops up in cash). ⚠️ Sandbox: the trade-in is credited at delivery.
 */
export function tradeInDownPayment(offerFils: Fils, vehicleId: string, assetPriceFils: Fils, productLine: ProductLine = 'vehicle'): TradeInApplication {
  const limits = financeLimits(productLine, assetPriceFils);
  const s = limits.downPaymentStepFils;
  const minDown = Math.ceil(limits.minDownPaymentFils / s) * s;
  const maxDown = Math.floor(limits.maxDownPaymentFils / s) * s;
  const capped = offerFils > maxDown;
  const used = Math.floor(Math.min(offerFils, maxDown) / s) * s;
  const downPaymentFils = Math.max(minDown, used);
  return {
    vehicleId,
    offerFils,
    downPaymentFils,
    creditedFils: Math.min(offerFils, downPaymentFils),
    capped,
    cashTopUpFils: Math.max(0, downPaymentFils - offerFils),
  };
}

/** What the trade-in form offers (GET /config `tradeIn`): the apps hard-code no makes, years or limits. */
export interface TradeInRules {
  makes: { make: string; models: { model: string; firstYear: number }[] }[];
  minYear: number;
  maxYear: number;
  maxMileageKm: number;
  conditions: TradeInCondition[];
  offerValidityDays: number;
  /** The customer's My Garage cars, to pre-fill the form (plate masked) */
  garage: { garageVehicleId: string; title: string; make: string; model: string; year: number; mileageKm: number; plateMasked: string }[];
  method: 'rules';
}

export function tradeInRules(garage: GarageVehicle[] = [], now: Date = new Date()): TradeInRules {
  const { minYear, maxYear } = tradeInYearBounds(now);
  return {
    makes: tradeInMakes().map((make) => ({
      make,
      models: TRADE_IN_REFERENCE.filter((r) => r.make === make).map((r) => ({ model: r.model, firstYear: Math.max(minYear, r.firstYear) })),
    })),
    minYear,
    maxYear,
    maxMileageKm: TRADE_IN_MAX_MILEAGE_KM,
    conditions: [...TRADE_IN_CONDITIONS],
    offerValidityDays: TRADE_IN_OFFER_VALIDITY_DAYS,
    garage: garage.flatMap((g) => {
      const v = findVehicle(g.vehicleId);
      return v
        ? [{ garageVehicleId: g.vehicleId, title: g.title, make: v.make, model: v.model, year: v.year, mileageKm: g.odometerKm, plateMasked: maskPlate(g.plate) }]
        : [];
    }),
    method: 'rules',
  };
}

/**
 * ⚠️ Sandbox offer store: one active offer per customer, in memory. A new valuation replaces the previous offer;
 * expired offers read as none. Production: the valuation service, with the offer recorded against the customer.
 */
export class SandboxTradeInStore {
  private readonly offers = new Map<string, TradeInOffer>();
  private seq = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  /** Values the car and makes it the customer's active offer. Throws TradeInError for invalid requests. */
  value(customerId: string, req: TradeInRequest, garage: GarageVehicle[] = []): TradeInOffer {
    const now = this.clock();
    const valuation = valueTradeIn(req, garage, now);
    const offer = tradeInOffer(`ti_sbx_${now.getTime().toString(36)}_${(++this.seq).toString(36)}`, valuation, now);
    this.offers.set(customerId, offer);
    return offer;
  }

  /** The customer's offer while it is valid; undefined otherwise (another customer's offer is never visible). */
  active(customerId: string): TradeInOffer | undefined {
    const o = this.offers.get(customerId);
    if (o && !isOfferActive(o, this.clock())) {
      this.offers.delete(customerId);
      return undefined;
    }
    return o;
  }

  /** Withdraws the customer's offer. Returns whether there was an active one. */
  withdraw(customerId: string): boolean {
    const had = this.active(customerId) !== undefined;
    this.offers.delete(customerId);
    return had;
  }
}
