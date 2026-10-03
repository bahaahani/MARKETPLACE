import {
  ApplicationTransitionError,
  OriginationError,
  PaymentValidationError,
  QuoteError,
  SandboxOriginationService,
  SandboxPaymentGateway,
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

export function handleError(e: unknown) {
  // Matched by name too: the sandbox stores live on globalThis and may have been created by another
  // route's bundle, whose copy of the domain error classes is a different constructor.
  if (isError<QuoteError>(e, QuoteError, 'QuoteError')) return problem(422, e.code, e.message);
  if (isError(e, PaymentValidationError, 'PaymentValidationError')) return problem(422, 'PAYMENT_INVALID', e.message);
  if (isError<OriginationError>(e, OriginationError, 'OriginationError')) {
    return problem(e.code === 'NOT_FOUND' ? 404 : e.code === 'NOT_APPROVED' ? 409 : 422, e.code, e.message);
  }
  if (isError(e, ApplicationTransitionError, 'ApplicationTransitionError')) return problem(409, 'INVALID_TRANSITION', e.message);
  if (e instanceof SyntaxError) return problem(400, 'BAD_JSON', 'request body must be valid JSON');
  console.error(e);
  return problem(500, 'INTERNAL', 'unexpected error');
}

function isError<T extends Error>(e: unknown, cls: abstract new (...args: never[]) => T, name: string): e is T {
  return e instanceof cls || (e instanceof Error && e.name === name);
}

export function intParam(v: string | null): number | undefined {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
}

const g = globalThis as unknown as { __sahelPayments?: SandboxPaymentGateway; __sahelOriginations?: SandboxOriginationService };
/** Sandbox payments, standing in for the Tap server integration. */
export const payments = (g.__sahelPayments ??= new SandboxPaymentGateway());
/** ⚠️ Sandbox finance applications (in memory, lost on restart), standing in for the loan origination system. */
export const originations = (g.__sahelOriginations ??= new SandboxOriginationService());
