'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ORIGINATION_STRUCTURES, type FinanceStructure, type OriginationStructure } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';

/** What the finance calculator currently shows, so "Apply for finance" applies for exactly that. */
export interface FinanceSelection {
  structure: FinanceStructure;
  downPaymentFils: number;
  tenureMonths: number;
}

const SelectionContext = createContext<{ selection: FinanceSelection | null; setSelection: (s: FinanceSelection) => void } | null>(null);

export function FinanceSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<FinanceSelection | null>(null);
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** Used by FinanceCalculator to publish its selection (no-op outside a provider). */
export function useSetFinanceSelection() {
  return useContext(SelectionContext)?.setSelection;
}

export type ApplicationBody =
  | { productLine: 'vehicle'; structure: OriginationStructure; vehicleId: string; downPaymentFils: number; tenureMonths: number }
  | { productLine: 'personal'; structure: OriginationStructure; amountFils: number; tenureMonths: number }
  | { productLine: 'home'; structure: OriginationStructure; propertyId: string; downPaymentFils: number; tenureMonths: number };

/**
 * Submits POST /api/v1/applications (the same API the Flutter app uses) and opens the application page.
 * One idempotency key per set of terms, so a double click never creates two applications.
 */
export function ApplyButton({
  locale,
  body,
  className = 'btn btn-primary',
  label = 'applyFinance',
}: {
  locale: AppLocale;
  body: ApplicationBody | null;
  className?: string;
  label?: MessageKey;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const termsKey = JSON.stringify(body);
  const idempotencyKey = useMemo(() => (termsKey ? crypto.randomUUID() : ''), [termsKey]);

  async function apply() {
    if (!body) return;
    setState('busy');
    try {
      const res = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { data } = (await res.json()) as { data: { id: string } };
      router.push(`/${locale}/applications/${data.id}`);
    } catch {
      setState('error');
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={apply} disabled={!body || state === 'busy'} data-testid="apply-finance">
        {t(locale, label)}
      </button>
      {state === 'error' && <p className="w-full text-sm text-danger">{t(locale, 'errorGeneric')}</p>}
    </>
  );
}

/** "Apply for finance" on the car page, carrying the calculator's structure, down payment and tenure. */
export function CarApplyButton({ locale, vehicleId }: { locale: AppLocale; vehicleId: string }) {
  const selection = useContext(SelectionContext)?.selection ?? null;
  const structure = ORIGINATION_STRUCTURES.find((s) => s === selection?.structure);
  const body: ApplicationBody | null =
    selection && structure
      ? { productLine: 'vehicle', structure, vehicleId, downPaymentFils: selection.downPaymentFils, tenureMonths: selection.tenureMonths }
      : null;
  return <ApplyButton locale={locale} body={body} className="btn btn-ghost" />;
}

/** The calculator's current selection (null until it has published one, or outside a FinanceSelectionProvider). */
export function useFinanceSelection(): FinanceSelection | null {
  return useContext(SelectionContext)?.selection ?? null;
}
