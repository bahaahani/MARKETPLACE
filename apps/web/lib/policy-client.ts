import type { Policy, PolicyQuote, PolicyQuoteRequest } from '@sahel/domain';
import type { AppLocale } from '@sahel/i18n';

/** Browser-side calls for buying a policy (same endpoints the Flutter app calls). */

export class InsuranceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
  ) {
    super(`insurance API error ${status} ${code ?? ''}`);
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string } };
  if (!res.ok || json.data === undefined) throw new InsuranceApiError(res.status, json.error?.code);
  return json.data;
}

/** Hold a server-priced quote for one insurer (step 1 of buying). */
export const holdPolicyQuote = (req: PolicyQuoteRequest) => postJson<PolicyQuote>('/api/v1/policies/quotes', req);

/** Issue the policy for a captured payment (step 3, after checkout). */
export const confirmPolicy = (paymentId: string, quoteId: string) => postJson<Policy>('/api/v1/policies/confirm', { paymentId, quoteId });

/** Checkouts paying a held policy quote issue the policy once the payment is captured. */
export function isPolicyQuoteReference(purpose: string, reference: string): boolean {
  return purpose === 'insurance_premium' && reference.startsWith('pq_');
}

export function policyCheckoutHref(locale: AppLocale, quote: PolicyQuote, label: string): string {
  const q = new URLSearchParams({ purpose: 'insurance_premium', amount: String(quote.premiumFils), reference: quote.id, label });
  return `/${locale}/checkout?${q.toString()}`;
}
