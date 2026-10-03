import { findProperty } from './catalog';
import { OriginationError, type ApplicationRequest, type OriginationStructure } from './origination';

/**
 * Home finance applications (journey J4): conventional or Ijara Muntahia Bittamleek, from a property for sale.
 *
 * The price always comes from the catalog, never from the client. The decision is the usual one (DBR headroom of the
 * session customer and their indicative HOME pre-approval limit). After acceptance the steps run in order:
 * - Ijara: CONTRACT_SIGNED → ASSET_PURCHASED_BY_BCFC → LEASE_STARTED → (after the final rental)
 *   OWNERSHIP_TRANSFERRED_TO_CUSTOMER → COMPLETED. BCFC must own the home before it leases it.
 * - Conventional: CONTRACT_SIGNED → VALUATION_CONFIRMED (needs a captured TRESCO valuation fee for the property by
 *   this customer) → DISBURSED → COMPLETED.
 * ⚠️ Sandbox: no real valuation, purchase, lease registration (RERA / Survey and Land Registration Bureau) or transfer.
 */

export interface HomeApplicationBody {
  structure: OriginationStructure;
  propertyId?: unknown;
  downPaymentFils?: unknown;
  tenureMonths: number;
  idempotencyKey: string;
}

/**
 * Builds the origination request for a property in the catalog. Throws OriginationError NOT_FOUND for an unknown
 * property and INVALID_REQUEST for a property that is not for sale. Quote rules (down payment, tenure) are checked
 * when the application is created.
 */
export function homeApplicationRequest(body: HomeApplicationBody): ApplicationRequest {
  if (typeof body.propertyId !== 'string' || !body.propertyId) {
    throw new OriginationError('INVALID_REQUEST', 'propertyId is required for home finance');
  }
  const property = findProperty(body.propertyId);
  if (!property) throw new OriginationError('NOT_FOUND', `unknown property ${body.propertyId}`);
  if (property.purpose !== 'sale') throw new OriginationError('INVALID_REQUEST', `property ${property.id} is for rent, not for sale`);
  const down = body.downPaymentFils ?? 0;
  if (typeof down !== 'number') throw new OriginationError('INVALID_REQUEST', 'downPaymentFils must be integer fils');
  return {
    productLine: 'home',
    structure: body.structure,
    assetPriceFils: property.priceFils,
    downPaymentFils: down,
    tenureMonths: body.tenureMonths,
    reference: property.id,
    idempotencyKey: body.idempotencyKey,
  };
}
