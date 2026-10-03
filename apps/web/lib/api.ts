import {
  ApplicationTransitionError,
  assertDealerAccess,
  CardApplicationError,
  DealerError,
  LeadStore,
  OnboardingError,
  OriginationError,
  PaymentNotFoundError,
  PaymentTransitionError,
  PaymentValidationError,
  PreApprovalTokenStore,
  QuoteError,
  SandboxCardIssuer,
  SandboxDealerAuth,
  SandboxOriginationService,
  SandboxPaymentGateway,
  type DealerAuthProvider,
  type DealerSession,
} from '@sahel/domain';
import { LifeEventError, SandboxContractSettings, SETTLEMENT_ERROR_STATUS, SettlementError } from '@sahel/domain';
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
  // Matched by name too: the sandbox stores live on globalThis and may have been created by another
  // route's bundle, whose copy of the domain error classes is a different constructor.
  if (isError<QuoteError>(e, QuoteError, 'QuoteError')) return problem(422, e.code, e.message);
  if (isError<DealerError>(e, DealerError, 'DealerError')) return problem(DEALER_STATUS[e.code] ?? 422, e.code, e.message);
  if (isError(e, PaymentNotFoundError, 'PaymentNotFoundError')) return problem(404, 'PAYMENT_NOT_FOUND', e.message);
  if (isError(e, PaymentValidationError, 'PaymentValidationError')) return problem(422, 'PAYMENT_INVALID', e.message);
  if (isError(e, PaymentTransitionError, 'PaymentTransitionError')) return problem(409, 'INVALID_TRANSITION', e.message);
  if (isError<OnboardingError>(e, OnboardingError, 'OnboardingError')) return problem(422, e.code, e.message);
  if (isError<CardApplicationError>(e, CardApplicationError, 'CardApplicationError')) {
    return problem(e.code === 'CARD_NOT_FOUND' ? 404 : 422, e.code, e.message);
  }
  if (isError<OriginationError>(e, OriginationError, 'OriginationError')) {
    return problem(e.code === 'NOT_FOUND' ? 404 : e.code === 'NOT_APPROVED' ? 409 : 422, e.code, e.message);
  }
  if (isError(e, ApplicationTransitionError, 'ApplicationTransitionError')) return problem(409, 'INVALID_TRANSITION', e.message);
  if (e instanceof SyntaxError) return problem(400, 'BAD_JSON', 'request body must be valid JSON');
  console.error(e);
  return problem(500, 'INTERNAL', 'unexpected error');
}

/**
 * Reads a JSON request body that must be an object. `null`, arrays and other JSON values are rejected like
 * malformed JSON (400 BAD_JSON) instead of failing later with a TypeError (500).
 */
export async function jsonBody<T extends object>(req: Request, opts: { optional?: boolean } = {}): Promise<T> {
  const text = await req.text();
  if (opts.optional && !text.trim()) return {} as T;
  const body: unknown = JSON.parse(text);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new SyntaxError('request body must be a JSON object');
  return body as T;
}

function isError<T extends Error>(e: unknown, cls: abstract new (...args: never[]) => T, name: string): e is T {
  return e instanceof cls || (e instanceof Error && e.name === name);
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
  __sahelCards?: SandboxCardIssuer;
  __sahelOriginations?: SandboxOriginationService;
};
/** Sandbox payments, standing in for the Tap server integration. */
export const payments = (g.__sahelPayments ??= new SandboxPaymentGateway());
/** ⚠️ Sandbox dealer leads, standing in for the CRM. */
export const leads = (g.__sahelLeads ??= new LeadStore());
/** ⚠️ Sandbox pre-approval share tokens, standing in for a short-TTL store. */
export const preApprovalTokens = (g.__sahelPreApprovalTokens ??= new PreApprovalTokenStore());
/** ⚠️ Sandbox card issuer: virtual cards issued in this server session (no processor, no real PAN). */
export const cardIssuer = (g.__sahelCards ??= new SandboxCardIssuer());
/** ⚠️ Sandbox finance applications (in memory, lost on restart), standing in for the loan origination system. */
export const originations = (g.__sahelOriginations ??= new SandboxOriginationService());

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

// --- Life events and early settlement / autopay ---

const g2 = globalThis as unknown as { __sahelContractSettings?: SandboxContractSettings };
/**
 * ⚠️ Sandbox contract settings (autopay) per customer, in memory, standing in for the core lending system.
 * Read through customerView() in lib/session.ts, the single "current customer" mechanism.
 */
export const contractSettings = (g2.__sahelContractSettings ??= new SandboxContractSettings());

/** handleError plus the life-event and settlement errors. */
export function handleBundlesError(e: unknown) {
  if (isError<LifeEventError>(e, LifeEventError, 'LifeEventError')) {
    return problem(e.code === 'EVENT_NOT_FOUND' ? 404 : 422, e.code, e.message);
  }
  if (isError<SettlementError>(e, SettlementError, 'SettlementError')) {
    return problem(SETTLEMENT_ERROR_STATUS[e.code] ?? 422, e.code, e.message);
  }
  return handleError(e);
}
