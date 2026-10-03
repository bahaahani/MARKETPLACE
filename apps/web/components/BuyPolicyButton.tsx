'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PolicyQuoteRequest } from '@sahel/domain';
import { t, type AppLocale } from '@sahel/i18n';
import { holdPolicyQuote, policyCheckoutHref } from '@/lib/policy-client';

/**
 * "Buy": the server re-prices and holds the quote, then checkout pays that exact premium.
 * The policy is issued after the payment is captured (see Checkout).
 */
export function BuyPolicyButton({ locale, request, label }: { locale: AppLocale; request: PolicyQuoteRequest; label: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  async function buy() {
    setState('busy');
    try {
      const quote = await holdPolicyQuote(request);
      router.push(policyCheckoutHref(locale, quote, label));
    } catch {
      setState('error');
    }
  }

  return (
    <span className="flex flex-col items-end">
      <button type="button" className="btn btn-ghost text-sm" onClick={buy} disabled={state === 'busy'} data-testid={`buy-${request.insurerId}`}>
        {t(locale, 'buyPolicy')}
      </button>
      {state === 'error' && <span className="text-xs text-danger">{t(locale, 'errorGeneric')}</span>}
    </span>
  );
}
