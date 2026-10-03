import type { Fils } from './money';
import { bhd } from './money';
import { findProperty, findVehicle } from './catalog';
import { RESERVATION_DEPOSIT_FILS } from './config';
import type { Payment, PaymentPurpose, PaymentRequest } from './payments';

/**
 * Server-side amount binding (open question P1): for these purposes the SERVER decides what the customer pays,
 * never the client. The apps read the amount from GET /api/v1/payments/price, and POST /payments refuses any other
 * amount (422 AMOUNT_MISMATCH) before a charge is created.
 *
 * Insurance premiums and early settlements are bound elsewhere (a policy is issued, or a contract settled, only for a
 * captured payment equal to the held quote / settlement quote). Installments are not bound yet.
 */

/** ⚠️ VERIFY with TRESCO: placeholder fee for a property valuation (P14). The web and the app show this amount. */
export const VALUATION_FEE_FILS: Fils = bhd(150);

export type ServerPricedPurpose = Extract<PaymentPurpose, 'reservation_deposit' | 'valuation_fee'>;

/** Purposes whose amount the server decides from its own records. */
export const SERVER_PRICED_PURPOSES: ServerPricedPurpose[] = ['reservation_deposit', 'valuation_fee'];

export function isServerPricedPurpose(purpose: unknown): purpose is ServerPricedPurpose {
  return SERVER_PRICED_PURPOSES.includes(purpose as ServerPricedPurpose);
}

export type PaymentAmountErrorCode = 'AMOUNT_MISMATCH' | 'UNKNOWN_REFERENCE' | 'NOT_SERVER_PRICED' | 'INVALID_REQUEST';

/** Suggested HTTP status for each error. */
export const PAYMENT_AMOUNT_ERROR_STATUS: Record<PaymentAmountErrorCode, number> = {
  AMOUNT_MISMATCH: 422,
  UNKNOWN_REFERENCE: 404,
  NOT_SERVER_PRICED: 422,
  INVALID_REQUEST: 400,
};

export class PaymentAmountError extends Error {
  constructor(
    public readonly code: PaymentAmountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentAmountError';
  }
}

/** What a server-priced payment costs. `payment` is exactly what to send to POST /payments (plus a method). */
export interface PaymentPrice {
  purpose: ServerPricedPurpose;
  reference: string;
  amountFils: Fils;
  currency: 'BHD';
  /** ⚠️ Placeholder amount pending business sign-off */
  pendingApproval: true;
}

/**
 * The server amount for a payment purpose and reference:
 * - reservation_deposit: the deposit to reserve a car in the catalog (reference = vehicle id)
 * - valuation_fee: the TRESCO valuation fee for a property for sale (reference = property id)
 * Throws NOT_SERVER_PRICED for other purposes and UNKNOWN_REFERENCE when the reference is not in the catalog.
 */
export function serverPaymentPrice(purpose: unknown, reference: unknown): PaymentPrice {
  if (!isServerPricedPurpose(purpose)) {
    throw new PaymentAmountError('NOT_SERVER_PRICED', `the server does not price ${String(purpose)} payments here`);
  }
  if (typeof reference !== 'string' || !reference) throw new PaymentAmountError('INVALID_REQUEST', 'reference is required');
  let amountFils: Fils;
  if (purpose === 'reservation_deposit') {
    if (!findVehicle(reference)) throw new PaymentAmountError('UNKNOWN_REFERENCE', `no vehicle ${reference} to reserve`);
    amountFils = RESERVATION_DEPOSIT_FILS;
  } else {
    const property = findProperty(reference);
    if (!property || property.purpose !== 'sale') throw new PaymentAmountError('UNKNOWN_REFERENCE', `no property for sale ${reference} to value`);
    amountFils = VALUATION_FEE_FILS;
  }
  return { purpose, reference, amountFils, currency: 'BHD', pendingApproval: true };
}

/**
 * Checks a payment request before a charge is created: for a server-priced purpose the reference must be known and
 * the amount must equal the server amount to the fils (AMOUNT_MISMATCH otherwise). Other purposes pass through.
 */
export function assertServerAmount(req: Pick<PaymentRequest, 'purpose' | 'reference' | 'amountFils'>): void {
  if (!isServerPricedPurpose(req.purpose)) return;
  const price = serverPaymentPrice(req.purpose, req.reference);
  if (req.amountFils !== price.amountFils) {
    throw new PaymentAmountError(
      'AMOUNT_MISMATCH',
      `amount ${String(req.amountFils)} does not match the ${req.purpose} of ${price.amountFils} fils for ${req.reference}`,
    );
  }
}

/**
 * The customer's captured TRESCO valuation fee for this property, if any: purpose valuation_fee, the property id as
 * reference, CAPTURED, and the server amount. The caller passes only that customer's payments (gateway.list(owner)).
 */
export function findValuationPayment(payments: readonly Payment[], propertyId: string): Payment | undefined {
  return payments.find(
    (p) => p.purpose === 'valuation_fee' && p.reference === propertyId && p.status === 'CAPTURED' && p.amountFils === VALUATION_FEE_FILS,
  );
}
