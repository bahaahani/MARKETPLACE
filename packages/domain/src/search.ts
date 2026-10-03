import type { Fils } from './money';
import { quoteFinance } from './pricing';
import { LISTING_DEFAULTS } from './rates';
import type { BodyType, FinanceStructure, FuelType, Property, PropertyPurpose, PropertyType, Vehicle, VehicleCondition } from './types';

/** "From BHD X / month" shown on a vehicle listing. */
export function vehicleFromMonthly(v: Vehicle, structure: FinanceStructure = 'conventional'): Fils {
  const d = LISTING_DEFAULTS.vehicle;
  return quoteFinance({
    productLine: 'vehicle',
    structure,
    assetPriceFils: v.priceFils,
    downPaymentFils: Math.ceil((v.priceFils * d.downPaymentPct) / 100),
    tenureMonths: d.tenureMonths,
  }).monthlyFils;
}

/** "From BHD X / month" for a property for sale (rentals return their rent). */
export function propertyFromMonthly(p: Property, structure: FinanceStructure = 'conventional'): Fils {
  if (p.purpose === 'rent') return p.priceFils;
  const d = LISTING_DEFAULTS.home;
  return quoteFinance({
    productLine: 'home',
    structure,
    assetPriceFils: p.priceFils,
    downPaymentFils: Math.ceil((p.priceFils * d.downPaymentPct) / 100),
    tenureMonths: d.tenureMonths,
  }).monthlyFils;
}

export type VehicleSort = 'price-asc' | 'price-desc' | 'year-desc' | 'mileage-asc';

export interface VehicleFilters {
  q?: string;
  condition?: VehicleCondition;
  bodyType?: BodyType;
  fuel?: FuelType;
  make?: string;
  maxPriceFils?: Fils;
  maxMonthlyFils?: Fils;
  /** Structure used to compute the monthly figure for maxMonthly filtering */
  structure?: FinanceStructure;
  sort?: VehicleSort;
}

export interface VehicleListing extends Vehicle {
  fromMonthlyFils: Fils;
}

export function searchVehicles(all: Vehicle[], f: VehicleFilters = {}): VehicleListing[] {
  const q = f.q?.trim().toLowerCase();
  const structure = f.structure ?? 'conventional';
  const rows = all
    .filter((v) => !q || `${v.make} ${v.model} ${v.trim} ${v.year}`.toLowerCase().includes(q))
    .filter((v) => !f.condition || v.condition === f.condition)
    .filter((v) => !f.bodyType || v.bodyType === f.bodyType)
    .filter((v) => !f.fuel || v.fuel === f.fuel)
    .filter((v) => !f.make || v.make.toLowerCase() === f.make.toLowerCase())
    .filter((v) => f.maxPriceFils === undefined || v.priceFils <= f.maxPriceFils)
    .map((v) => ({ ...v, fromMonthlyFils: vehicleFromMonthly(v, structure) }))
    .filter((v) => f.maxMonthlyFils === undefined || v.fromMonthlyFils <= f.maxMonthlyFils);

  const sort = f.sort ?? 'price-asc';
  const cmp: Record<VehicleSort, (a: Vehicle, b: Vehicle) => number> = {
    'price-asc': (a, b) => a.priceFils - b.priceFils,
    'price-desc': (a, b) => b.priceFils - a.priceFils,
    'year-desc': (a, b) => b.year - a.year,
    'mileage-asc': (a, b) => a.mileageKm - b.mileageKm,
  };
  return rows.sort(cmp[sort]);
}

export interface PropertyFilters {
  purpose?: PropertyPurpose;
  type?: PropertyType;
  minBedrooms?: number;
  maxPriceFils?: Fils;
  q?: string;
}

export interface PropertyListing extends Property {
  fromMonthlyFils: Fils;
}

export function searchProperties(all: Property[], f: PropertyFilters = {}): PropertyListing[] {
  const q = f.q?.trim().toLowerCase();
  return all
    .filter((p) => !f.purpose || p.purpose === f.purpose)
    .filter((p) => !f.type || p.type === f.type)
    .filter((p) => f.minBedrooms === undefined || p.bedrooms >= f.minBedrooms)
    .filter((p) => f.maxPriceFils === undefined || p.priceFils <= f.maxPriceFils)
    .filter((p) => !q || `${p.title.en} ${p.title.ar} ${p.area.en} ${p.area.ar}`.toLowerCase().includes(q))
    .map((p) => ({ ...p, fromMonthlyFils: propertyFromMonthly(p) }))
    .sort((a, b) => a.priceFils - b.priceFils);
}
