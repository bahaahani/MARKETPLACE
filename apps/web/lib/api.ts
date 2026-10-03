import {
  CardApplicationError,
  OnboardingError,
  PaymentValidationError,
  QuoteError,
  SandboxCardIssuer,
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
  if (e instanceof QuoteError) return problem(422, e.code, e.message);
  if (e instanceof PaymentValidationError) return problem(422, 'PAYMENT_INVALID', e.message);
  if (e instanceof OnboardingError) return problem(422, e.code, e.message);
  if (e instanceof CardApplicationError) return problem(e.code === 'CARD_NOT_FOUND' ? 404 : 422, e.code, e.message);
  if (e instanceof SyntaxError) return problem(400, 'BAD_JSON', 'request body must be valid JSON');
  console.error(e);
  return problem(500, 'INTERNAL', 'unexpected error');
}

export function intParam(v: string | null): number | undefined {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
}

const g = globalThis as unknown as { __sahelPayments?: SandboxPaymentGateway; __sahelCards?: SandboxCardIssuer };
/** Sandbox payments, standing in for the Tap server integration. */
export const payments = (g.__sahelPayments ??= new SandboxPaymentGateway());
/** ⚠️ Sandbox card issuer: virtual cards issued in this server session (no processor, no real PAN). */
export const cardIssuer = (g.__sahelCards ??= new SandboxCardIssuer());
