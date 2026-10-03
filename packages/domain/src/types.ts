import type { Fils } from './money';

export interface Localized {
  en: string;
  ar: string;
}

/** How a facility is structured. Islamic structures are subject to Shari'a Supervisory Board approval. */
export type FinanceStructure = 'conventional' | 'murabaha' | 'ijara';

export type ProductLine = 'vehicle' | 'personal' | 'home';

export type SellerType = 'group' | 'partner';

export interface Seller {
  id: string;
  name: Localized;
  type: SellerType;
}

export type VehicleCondition = 'new' | 'used';
export type BodyType = 'sedan' | 'suv' | 'hatchback' | 'pickup' | 'coupe';
export type FuelType = 'petrol' | 'hybrid' | 'electric';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  condition: VehicleCondition;
  mileageKm: number;
  priceFils: Fils;
  bodyType: BodyType;
  fuel: FuelType;
  seats: number;
  color: Localized;
  seller: Seller;
  /** Inspected pre-owned stock (Tasheelat Automotive) */
  inspected: boolean;
  /** Hue used for the placeholder artwork until real photos exist */
  accentHue: number;
}

export type PropertyType = 'villa' | 'apartment' | 'townhouse' | 'land' | 'office';
export type PropertyPurpose = 'sale' | 'rent';

export interface Property {
  id: string;
  title: Localized;
  area: Localized;
  type: PropertyType;
  purpose: PropertyPurpose;
  /** Sale price, or monthly rent when purpose === 'rent' */
  priceFils: Fils;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  seller: Seller;
  /** Valued by TRESCO (RERA Class A) */
  valued: boolean;
  accentHue: number;
}

export type CardTier = 'world-elite' | 'world' | 'platinum' | 'prepaid' | 'youth';

export interface CreditCardProduct {
  id: string;
  name: Localized;
  tier: CardTier;
  network: 'mastercard';
  annualFeeFils: Fils;
  minSalaryFils: Fils;
  highlights: Localized[];
  forHer: boolean;
  gradient: [string, string];
}
