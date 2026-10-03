'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ORIGINATION_STRUCTURES } from '@sahel/domain';
import { t, type AppLocale } from '@sahel/i18n';
import { ApplyButton, useFinanceSelection, type ApplicationBody } from './ApplyFinance';

/**
 * "Apply for home finance" on a property for sale, carrying the calculator's structure (conventional or Ijara),
 * down payment and tenure. The API takes the price from the catalog and decides with the session customer's numbers.
 */
export function HomeApplyButton({ locale, propertyId }: { locale: AppLocale; propertyId: string }) {
  const selection = useFinanceSelection();
  const structure = ORIGINATION_STRUCTURES.find((s) => s === selection?.structure);
  const body: ApplicationBody | null =
    selection && structure
      ? { productLine: 'home', structure, propertyId, downPaymentFils: selection.downPaymentFils, tenureMonths: selection.tenureMonths }
      : null;
  return <ApplyButton locale={locale} body={body} className="btn btn-primary" label="homeApplyFinance" />;
}

/**
 * Continues an accepted application (POST /api/v1/applications/{id}/accept again), e.g. once the TRESCO valuation fee
 * is paid, then refreshes the page. The server decides which steps can run.
 */
export function ContinueFulfilment({ locale, applicationId }: { locale: AppLocale; applicationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [refreshing, startTransition] = useTransition();

  async function go() {
    setState('busy');
    try {
      const res = await fetch(`/api/v1/applications/${applicationId}/accept`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setState('idle');
      startTransition(() => router.refresh());
    } catch {
      setState('error');
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-primary w-full" onClick={go} disabled={state === 'busy' || refreshing} data-testid="continue-fulfilment">
        {t(locale, 'homeContinue')}
      </button>
      {state === 'error' && <p className="mt-2 text-sm text-danger">{t(locale, 'errorGeneric')}</p>}
    </div>
  );
}
