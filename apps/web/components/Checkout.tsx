'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatBhd, PAYMENT_METHODS, type Payment, type PaymentMethod, type PaymentPurpose, type Policy } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { confirmPolicy, isPolicyQuoteReference } from '@/lib/policy-client';

const METHOD_LABEL: Record<PaymentMethod, MessageKey> = {
  benefitpay: 'methodBenefitpay',
  apple_pay: 'methodApplePay',
  google_pay: 'methodGooglePay',
  samsung_pay: 'methodSamsungPay',
  click_to_pay: 'methodClickToPay',
  card: 'methodCard',
};

/**
 * Sandbox checkout. Production: Tap Web SDKs (Card, Apple Pay, Google Pay, BenefitPay) tokenize in the
 * browser; the server creates the charge and only marks it paid after the verified Tap webhook.
 */
export function Checkout({
  locale,
  amountFils,
  purpose,
  reference,
  label,
  serverPriced = false,
}: {
  locale: AppLocale;
  amountFils: number;
  purpose: PaymentPurpose;
  reference: string;
  label: string;
  /** The amount was set by the server (GET /payments/price), not taken from the link */
  serverPriced?: boolean;
}) {
  const [method, setMethod] = useState<PaymentMethod>('benefitpay');
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [result, setResult] = useState<Payment | null>(null);
  // Insurance premiums for a held quote: the policy issued once the payment is captured (or the failure).
  const [policy, setPolicy] = useState<Policy | 'failed' | null>(null);
  // One key per checkout attempt, so double-clicks never double-charge.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const amount = formatBhd(amountFils, locale);

  async function pay() {
    setState('busy');
    try {
      const created = await fetch('/api/v1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ amountFils, method, purpose, reference }),
      });
      if (!created.ok) throw new Error(await created.text());
      const { data } = (await created.json()) as { data: Payment };
      const confirmed = await fetch(`/api/v1/payments/${data.id}/confirm`, { method: 'POST' });
      if (!confirmed.ok) throw new Error(await confirmed.text());
      const paid = ((await confirmed.json()) as { data: Payment }).data;
      if (isPolicyQuoteReference(purpose, reference)) setPolicy(await confirmPolicy(paid.id, reference).catch(() => 'failed' as const));
      setResult(paid);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  if (result) {
    return (
      <div className="card mx-auto max-w-md p-6 text-center" data-testid="payment-success">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-islamic-soft text-2xl text-islamic">✓</div>
        <h1 className="text-xl font-bold">{tr('paymentSuccess')}</h1>
        <p className="mt-1 text-2xl font-bold">{amount}</p>
        <p className="mt-1 text-sm text-text-muted">{label}</p>
        <p className="mt-1 font-mono text-xs text-text-muted">{tr('paymentReference', { value: result.id })}</p>
        {policy === 'failed' && <p className="mt-3 text-sm text-danger" data-testid="policy-failed">{tr('insPolicyBindFailed')}</p>}
        {policy && policy !== 'failed' && (
          <p className="mt-3 rounded-lg bg-islamic-soft p-3 text-sm text-islamic" data-testid="policy-issued" data-policy-number={policy.policyNumber}>
            {tr('insPolicyIssued')} · <span dir="ltr">{policy.policyNumber}</span>
          </p>
        )}
        <Link href={`/${locale}/account`} className="btn btn-primary mt-5 w-full">
          {tr('done')}
        </Link>
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-md p-6">
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`${serverPriced ? '' : 'mb-5 '}text-3xl font-bold`} data-testid="checkout-amount">
        {amount}
      </p>
      {serverPriced && (
        <p className="mb-5 text-xs text-text-muted" data-testid="server-priced">
          {tr('bindServerAmount')}
        </p>
      )}
      <fieldset>
        <legend className="mb-2 font-semibold">{tr('choosePaymentMethod')}</legend>
        <div className="space-y-2">
          {PAYMENT_METHODS.map((m) => (
            <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${method === m ? 'border-brand bg-brand-soft' : 'border-border'}`}>
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
              <span className="font-medium">{tr(METHOD_LABEL[m])}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {state === 'error' && <p className="mt-3 text-sm text-danger">{tr('errorGeneric')}</p>}
      <button type="button" className="btn btn-primary mt-5 w-full" onClick={pay} disabled={state === 'busy'} data-testid="pay">
        {tr('pay', { amount })}
      </button>
      <p className="mt-3 text-center text-xs text-text-muted">{tr('sandboxNotice')}</p>
    </div>
  );
}
