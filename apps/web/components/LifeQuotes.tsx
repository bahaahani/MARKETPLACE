'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  formatBhd,
  LIFE_DEFAULT_SUM_ASSURED_FILS,
  LIFE_DEFAULT_TERM_YEARS,
  LIFE_MAX_END_AGE,
  LIFE_MAX_SUM_ASSURED_FILS,
  LIFE_MAX_TERM_YEARS,
  LIFE_MIN_SUM_ASSURED_FILS,
  LIFE_MIN_TERM_YEARS,
  LIFE_SUM_ASSURED_STEP_FILS,
  parseBhdInput,
  type LifeQuote,
  type LifeQuoteInput,
} from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { BuyPolicyButton } from './BuyPolicyButton';
import { insuranceErrorKey } from '@/lib/insurance-labels';
import { InsuranceApiError, postJson } from '@/lib/policy-client';

/** Plain BHD for an input field ("100000"), no grouping. */
const bhdField = (fils: number) => String(fils / 1000);

/**
 * Life insurance comparison and buying, via the shared API (same endpoints the Flutter app calls).
 * Indicative quote only. Beneficiary names are not collected here; they are collected at issuance.
 */
export function LifeQuotes({ locale, defaultDob }: { locale: AppLocale; defaultDob: string }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const [dob, setDob] = useState(defaultDob);
  const [smoker, setSmoker] = useState(false);
  const [sum, setSum] = useState(bhdField(LIFE_DEFAULT_SUM_ASSURED_FILS));
  const [term, setTerm] = useState(String(LIFE_DEFAULT_TERM_YEARS));
  const [rider, setRider] = useState(false);
  const [query, setQuery] = useState<LifeQuoteInput>({
    dateOfBirth: defaultDob,
    smoker: false,
    sumAssuredFils: LIFE_DEFAULT_SUM_ASSURED_FILS,
    termYears: LIFE_DEFAULT_TERM_YEARS,
    criticalIllnessRider: false,
  });
  const [takafulOnly, setTakafulOnly] = useState(false);
  const [quotes, setQuotes] = useState<LifeQuote[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setQuotes(null);
    postJson<{ quotes: LifeQuote[] }>('/api/v1/insurance/life-quotes', { ...query, takafulOnly })
      .then((d) => !cancelled && setQuotes(d.quotes))
      .catch((e: unknown) => !cancelled && setError(insuranceErrorKey(e instanceof InsuranceApiError ? e.code : undefined)));
    return () => {
      cancelled = true;
    };
  }, [query, takafulOnly]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const sumFils = parseBhdInput(sum);
    const termYears = Number(term);
    if (sumFils === undefined) {
      setError('insLifeErrorSum');
      return;
    }
    setQuery({ dateOfBirth: dob, smoker, sumAssuredFils: sumFils, termYears, criticalIllnessRider: rider });
  };

  const field = 'w-full rounded-lg border border-border bg-surface p-2';
  const money0 = (fils: number) => formatBhd(fils, locale, { decimals: 0 });

  return (
    <div className="space-y-4">
      <form className="card space-y-4 p-5" onSubmit={submit} noValidate data-testid="life-form">
        <p className="rounded-lg bg-background p-3 text-sm text-text-muted" data-testid="life-indicative">{tr('insLifeIndicative')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('insLifeDob')}</span>
            <input type="date" className={field} value={dob} onChange={(e) => setDob(e.target.value)} data-testid="life-dob" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('insLifeSum')} (BHD)</span>
            <input
              type="number"
              inputMode="numeric"
              min={LIFE_MIN_SUM_ASSURED_FILS / 1000}
              max={LIFE_MAX_SUM_ASSURED_FILS / 1000}
              step={LIFE_SUM_ASSURED_STEP_FILS / 1000}
              className={field}
              value={sum}
              onChange={(e) => setSum(e.target.value)}
              data-testid="sum-assured"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('insLifeTerm')}</span>
            <input type="number" inputMode="numeric" min={LIFE_MIN_TERM_YEARS} max={LIFE_MAX_TERM_YEARS} className={field} value={term} onChange={(e) => setTerm(e.target.value)} data-testid="term-years" />
            <span className="mt-1 block text-xs text-text-muted">{tr('insLifeTermHint', { age: LIFE_MAX_END_AGE })}</span>
          </label>
          <div className="space-y-2 pt-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={smoker} onChange={(e) => setSmoker(e.target.checked)} data-testid="smoker" />
              {tr('insLifeSmoker')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rider} onChange={(e) => setRider(e.target.checked)} data-testid="ci-rider" />
              {tr('insLifeRider')}
            </label>
          </div>
        </div>
        <button type="submit" className="btn btn-primary w-full sm:w-auto" data-testid="get-quotes">
          {tr('insGetQuotes')}
        </button>
      </form>

      <section className="card p-5" aria-labelledby="life-quotes-title" data-testid="life-quotes">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="life-quotes-title" className="text-lg font-bold">{tr('insCompareInsurers')}</h2>
          <label className="ms-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={takafulOnly} onChange={(e) => setTakafulOnly(e.target.checked)} />
            {tr('takafulOnly')}
          </label>
        </div>
        {error && <p className="text-sm text-danger" role="alert" data-testid="quote-error">{tr(error)}</p>}
        {!quotes && !error && <p className="text-sm text-text-muted">…</p>}
        <ul className="divide-y divide-border">
          {quotes?.map((q) => (
            <li key={q.insurerId} className="flex flex-wrap items-center gap-3 py-3" data-testid="life-quote" data-premium={q.annualPremiumFils} data-total={q.totalPremiumsFils}>
              <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <p className="font-semibold">
                  {q.insurerName[locale]}{' '}
                  <span
                    className={`ms-1 rounded-full px-2 py-0.5 text-xs ${q.takaful ? 'bg-islamic-soft text-islamic' : 'bg-background text-text-muted'}`}
                    data-testid="product-type"
                  >
                    {tr(q.productType === 'family-takaful' ? 'insLifeFamilyTakaful' : 'insLifeConventional')}
                  </span>
                </p>
                <p className="text-xs text-text-muted">
                  {[
                    tr('insLifeSumAssured', { amount: money0(q.sumAssuredFils) }),
                    tr('insLifeTermYears', { years: q.termYears }),
                    q.criticalIllnessRider && tr('insLifeRiderShort'),
                    tr('insLifeMonthly', { amount: formatBhd(q.monthlyPremiumFils, locale) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="text-xs text-text-muted" data-testid="total-premiums">
                  {tr('insLifeTotal', { years: q.termYears, amount: formatBhd(q.totalPremiumsFils, locale) })} · {tr('insLifeSumAssured', { amount: formatBhd(q.sumAssuredFils, locale) })}
                </p>
              </div>
              <p className="ms-auto font-bold sm:ms-0" data-testid="premium">{tr('insLifeAnnual', { amount: formatBhd(q.annualPremiumFils, locale) })}</p>
              <BuyPolicyButton
                locale={locale}
                label={`${tr('insLifeTitle')} · ${q.insurerName[locale]}`}
                request={{
                  line: 'life',
                  insurerId: q.insurerId,
                  input: { dateOfBirth: query.dateOfBirth, smoker: query.smoker, sumAssuredFils: query.sumAssuredFils, termYears: query.termYears, criticalIllnessRider: query.criticalIllnessRider },
                }}
              />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-text-muted" data-testid="beneficiary-note">{tr('insLifeBeneficiaryNote')}</p>
        <p className="mt-1 text-xs text-text-muted">{tr('insSandboxNote')}</p>
      </section>
    </div>
  );
}
