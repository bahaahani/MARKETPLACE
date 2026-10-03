import {
  assertDealerAccess,
  DealerError,
  LeadStore,
  PaymentValidationError,
  PreApprovalTokenStore,
  QuoteError,
  SandboxDealerAuth,
  SandboxPaymentGateway,
  type DealerAuthProvider,
  type DealerSession,
} from '@sahel/domain';
import { NextResponse } from 'next/server';

/**
 * API v1 helpers. These route handlers are the single API used by BOTH the Next.js web app
 * and the Flutter mobile app, so pricing and data are identical on every channel.
 * Later they move to the dedicated platform service without changing the contract (api/openapi.yaml).
 */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function problem(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const DEALER_STATUS: Record<DealerError['code'], number> = {
  UNKNOWN_DEALER: 404,
  FORBIDDEN: 403,
  LEAD_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  VEHICLE_NOT_FOUND: 404,
  VEHICLE_NOT_IN_INVENTORY: 422,
  TOKEN_NOT_FOUND: 404,
  TOKEN_EXPIRED: 410,
  NO_PREAPPROVAL: 422,
};

export function handleError(e: unknown) {
  if (e instanceof QuoteError) return problem(422, e.code, e.message);
  if (e instanceof DealerError) return problem(DEALER_STATUS[e.code], e.code, e.message);
  if (e instanceof PaymentValidationError) return problem(422, 'PAYMENT_INVALID', e.message);
  if (e instanceof SyntaxError) return problem(400, 'BAD_JSON', 'request body must be valid JSON');
  console.error(e);
  return problem(500, 'INTERNAL', 'unexpected error');
}

export function intParam(v: string | null): number | undefined {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
}

const g = globalThis as unknown as {
  __sahelPayments?: SandboxPaymentGateway;
  __sahelLeads?: LeadStore;
  __sahelPreApprovalTokens?: PreApprovalTokenStore;
};
/** Sandbox payments, standing in for the Tap server integration. */
export const payments = (g.__sahelPayments ??= new SandboxPaymentGateway());
/** ⚠️ Sandbox dealer leads, standing in for the CRM. */
export const leads = (g.__sahelLeads ??= new LeadStore());
/** ⚠️ Sandbox pre-approval share tokens, standing in for a short-TTL store. */
export const preApprovalTokens = (g.__sahelPreApprovalTokens ??= new PreApprovalTokenStore());

/** ⚠️ Sandbox: no staff login. Production swaps in a provider that verifies partner-SSO tokens. */
const dealerAuth: DealerAuthProvider = new SandboxDealerAuth();

/**
 * Resolve the dealer session for a request and check it may act for `sellerId`.
 * Every /dealer endpoint calls this, so real auth plugs in here.
 */
export function dealerSession(req: Request, sellerId: string): DealerSession {
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  // Sandbox: the session is whichever dealer the URL names. Production: the seller comes from the token claims.
  const session = dealerAuth.authenticate({ sellerId, bearer });
  assertDealerAccess(session, sellerId);
  return session;
}
