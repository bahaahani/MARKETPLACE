import { findValuationPayment, PAYMENT_AMOUNT_ERROR_STATUS, PaymentAmountError, type FulfilmentEvidence } from '@sahel/domain';
import { handleError, payments, problem } from './api';

/**
 * Home finance and server-priced payments (sandbox helpers for the API routes and pages).
 * The rules live in @sahel/domain (home-finance.ts, payment-amounts.ts); this file only connects them to the
 * in-memory sandbox stores.
 */

/**
 * Evidence for the home finance fulfilment steps of this customer: their captured TRESCO valuation fee for the
 * property (only payments created in this customer's session are considered).
 */
export function homeFulfilmentEvidence(customerId: string, propertyId: string): FulfilmentEvidence {
  const paid = findValuationPayment(payments.list(customerId), propertyId);
  return paid ? { valuationPaymentId: paid.id } : {};
}

/** handleError plus the payment amount binding errors (AMOUNT_MISMATCH, UNKNOWN_REFERENCE, NOT_SERVER_PRICED). */
export function handlePaymentAmountError(e: unknown) {
  // Matched by name too (see handleError): the class may come from another route bundle's copy of the domain.
  if (e instanceof PaymentAmountError || (e instanceof Error && e.name === 'PaymentAmountError')) {
    const err = e as PaymentAmountError;
    return problem(PAYMENT_AMOUNT_ERROR_STATUS[err.code] ?? 422, err.code, err.message);
  }
  return handleError(e);
}
