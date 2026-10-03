'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { formatBhd, HOME_DEFAULT_INPUT, parseBhdInput, type HomeQuote, type HomeQuoteInput, type PropertyType, type ResolvedHomeInput } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { BuyPolicyButton } from './BuyPolicyButton';
import { HOME_TYPE_LABEL, insuranceErrorKey } from '@/lib/insurance-labels';
import { InsuranceApiError, postJson } from '@/lib/policy-client';

const TYPES = Object.keys(HOME_TYPE_LABEL) as PropertyType[];
/** Plain BHD for an input field ("141000", "12500.5"), no grouping. */
const bhdField = (fils: number) => String(fils / 1000);

/**
 * Home insurance comparison and buying, via the shared API (same endpoints the Flutter app calls).
 * With a propertyId the API suggests the sums insured from the listing and the form shows what was priced.
 */
export function HomeQuotes({ locale, propertyId }: { locale: AppLocale; propertyId?: string }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  // Starting point shared with the app (GET /config insurance.home); the API prices and validates.
  const [type, setType] = useState<PropertyType>(HOME_DEFAULT_INPUT.propertyType);
  const [building, setBuilding] = useState(bhdField(HOME_DEFAULT_INPUT.buildingSumInsuredFils));
  const [contents, setContents] = useState(bhdField(HOME_DEFAULT_INPUT.contentsSumInsuredFils));
  const [query, setQuery] = useState<Partial<HomeQuoteInput>>(propertyId ? { propertyId } : { ...HOME_DEFAULT_INPUT });
  const [takafulOnly, setTakafulOnly] = useState(false);
  const [result, setResult] = useState<{ input: ResolvedHomeInput; quotes: HomeQuote[] } | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setResult(null);
    postJson<{ input: ResolvedHomeInput; quotes: HomeQuote[] }>('/api/v1/insurance/home-quotes', { ...query, takafulOnly })
      .then((d) => {
        if (cancelled) return;
        setResult(d);
        // Show exactly what was priced (e.g. the sums suggested from a listing).
        setType(d.input.propertyType);
        setBuilding(bhdField(d.input.buildingSumInsuredFils));
        setContents(bhdField(d.input.contentsSumInsuredFils));
      })
      .catch((e: unknown) => !cancelled && setError(insuranceErrorKey(e instanceof InsuranceApiError ? e.code : undefined)));
    return () => {
      cancelled = true;
    };
  }, [query, takafulOnly]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const b = parseBhdInput(building || '0');
    const c = parseBhdInput(contents || '0');
    if (b === undefined || c === undefined) {
      setError('insErrorSumInsured');
      return;
    }
    setQuery({ propertyType: type, buildingSumInsuredFils: b, contentsSumInsuredFils: c, ...(propertyId ? { propertyId } : {}) });
  };

  const field = 'w-full rounded-lg border border-border bg-surface p-2';
  const linked = result?.input.propertyTitle;

  return (
    <div className="space-y-4">
      <form className="card space-y-4 p-5" onSubmit={submit} data-testid="home-form">
        {linked && (
          <p className="rounded-lg bg-brand-soft p-3 text-sm" data-testid="linked-property">
            {tr('insLinkedProperty', { title: linked[locale] })}
          </p>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{tr('insPropertyType')}</span>
          <select className={field} value={type} disabled={!!propertyId} onChange={(e) => setType(e.target.value as PropertyType)} data-testid="property-type">
            {TYPES.map((p) => (
              <option key={p} value={p}>
                {tr(HOME_TYPE_LABEL[p]!)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('insBuildingSum')}</span>
            <input inputMode="decimal" className={field} value={building} onChange={(e) => setBuilding(e.target.value)} data-testid="building-sum" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('insContentsSum')}</span>
            <input inputMode="decimal" className={field} value={contents} onChange={(e) => setContents(e.target.value)} data-testid="contents-sum" />
          </label>
        </div>
        <button type="submit" className="btn btn-primary w-full sm:w-auto" data-testid="get-quotes">
          {tr('insGetQuotes')}
        </button>
      </form>

      <section className="card p-5" aria-labelledby="home-quotes-title" data-testid="home-quotes">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="home-quotes-title" className="text-lg font-bold">{tr('insCompareInsurers')}</h2>
          <label className="ms-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={takafulOnly} onChange={(e) => setTakafulOnly(e.target.checked)} />
            {tr('takafulOnly')}
          </label>
        </div>
        {error && <p className="text-sm text-danger" role="alert" data-testid="quote-error">{tr(error)}</p>}
        {!result && !error && <p className="text-sm text-text-muted">…</p>}
        <ul className="divide-y divide-border">
          {!error &&
            result?.quotes.map((q) => (
              <li key={q.insurerId} className="flex flex-wrap items-center gap-3 py-3" data-testid="home-quote" data-premium={q.annualPremiumFils}>
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <p className="font-semibold">
                    {q.insurerName[locale]}{' '}
                    {q.takaful && <span className="ms-1 rounded-full bg-islamic-soft px-2 py-0.5 text-xs text-islamic">{tr('takaful')}</span>}
                  </p>
                  <p className="text-xs text-text-muted">
                    {[
                      q.buildingSumInsuredFils > 0 && tr('insBuildingCover', { amount: formatBhd(q.buildingSumInsuredFils, locale, { decimals: 0 }) }),
                      q.contentsSumInsuredFils > 0 && tr('insContentsCover', { amount: formatBhd(q.contentsSumInsuredFils, locale, { decimals: 0 }) }),
                      q.accidentalDamage && tr('insAccidentalDamage'),
                      q.temporaryAccommodation && tr('insTempAccommodation'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <p className="ms-auto font-bold sm:ms-0" data-testid="premium">{tr('perYear', { amount: formatBhd(q.annualPremiumFils, locale) })}</p>
                <BuyPolicyButton
                  locale={locale}
                  label={`${tr('insHomeTitle')} · ${q.insurerName[locale]}`}
                  request={{
                    line: 'home',
                    insurerId: q.insurerId,
                    input: {
                      propertyType: result.input.propertyType,
                      buildingSumInsuredFils: result.input.buildingSumInsuredFils,
                      contentsSumInsuredFils: result.input.contentsSumInsuredFils,
                      ...(result.input.propertyId ? { propertyId: result.input.propertyId } : {}),
                    },
                  }}
                />
              </li>
            ))}
        </ul>
        <p className="mt-3 text-xs text-text-muted">{tr('insSandboxNote')}</p>
      </section>
    </div>
  );
}
