'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { formatBhd, TRAVEL_REGIONS, TRAVEL_TIERS, type TravelQuote, type TravelQuoteInput } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { BuyPolicyButton } from './BuyPolicyButton';
import { insuranceErrorKey, REGION_LABEL, TIER_LABEL } from '@/lib/insurance-labels';
import { InsuranceApiError, postJson } from '@/lib/policy-client';

/** Travel insurance comparison and buying, via the shared API (same endpoints the Flutter app calls). */
export function TravelQuotes({ locale, defaultStart, defaultEnd }: { locale: AppLocale; defaultStart: string; defaultEnd: string }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const [form, setForm] = useState<TravelQuoteInput>({ region: 'gcc', tier: 'basic', startDate: defaultStart, endDate: defaultEnd, adults: 1, children: 0 });
  // The request last submitted; the Takaful filter re-runs it immediately.
  const [query, setQuery] = useState<TravelQuoteInput>(form);
  const [takafulOnly, setTakafulOnly] = useState(false);
  const [quotes, setQuotes] = useState<TravelQuote[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setQuotes(null);
    postJson<{ quotes: TravelQuote[] }>('/api/v1/insurance/travel-quotes', { ...query, takafulOnly })
      .then((d) => !cancelled && setQuotes(d.quotes))
      .catch((e: unknown) => !cancelled && setError(insuranceErrorKey(e instanceof InsuranceApiError ? e.code : undefined)));
    return () => {
      cancelled = true;
    };
  }, [query, takafulOnly]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQuery({ ...form });
  };
  const set = <K extends keyof TravelQuoteInput>(k: K, v: TravelQuoteInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const pill = (active: boolean) => `rounded-full border px-3 py-1 ${active ? 'border-brand bg-brand text-white' : 'border-border'}`;

  return (
    <div className="space-y-4">
      <form className="card space-y-4 p-5" onSubmit={submit} data-testid="travel-form">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{tr('insDestination')}</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {TRAVEL_REGIONS.map((r) => (
              <button key={r} type="button" aria-pressed={form.region === r} className={pill(form.region === r)} onClick={() => set('region', r)} data-testid={`region-${r}`}>
                {tr(REGION_LABEL[r])}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('insTripStart')}</span>
            <input type="date" className="w-full rounded-lg border border-border bg-surface p-2" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} data-testid="trip-start" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('insTripEnd')}</span>
            <input type="date" className="w-full rounded-lg border border-border bg-surface p-2" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} data-testid="trip-end" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('insAdults')}</span>
            <input type="number" inputMode="numeric" min={1} max={6} className="w-full rounded-lg border border-border bg-surface p-2" value={form.adults} onChange={(e) => set('adults', Number(e.target.value))} data-testid="adults" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('insChildren')}</span>
            <input type="number" inputMode="numeric" min={0} max={8} className="w-full rounded-lg border border-border bg-surface p-2" value={form.children} onChange={(e) => set('children', Number(e.target.value))} data-testid="children" />
          </label>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{tr('insTier')}</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {TRAVEL_TIERS.map((tier) => (
              <button key={tier} type="button" aria-pressed={form.tier === tier} className={pill(form.tier === tier)} onClick={() => set('tier', tier)} data-testid={`tier-${tier}`}>
                {tr(TIER_LABEL[tier])}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn btn-primary w-full sm:w-auto" data-testid="get-quotes">
          {tr('insGetQuotes')}
        </button>
      </form>

      <section className="card p-5" aria-labelledby="travel-quotes-title" data-testid="travel-quotes">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="travel-quotes-title" className="text-lg font-bold">{tr('insCompareInsurers')}</h2>
          <label className="ms-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={takafulOnly} onChange={(e) => setTakafulOnly(e.target.checked)} />
            {tr('takafulOnly')}
          </label>
        </div>
        {error && <p className="text-sm text-danger" role="alert" data-testid="quote-error">{tr(error)}</p>}
        {!quotes && !error && <p className="text-sm text-text-muted">…</p>}
        <ul className="divide-y divide-border">
          {quotes?.map((q) => (
            <li key={q.insurerId} className="flex flex-wrap items-center gap-3 py-3" data-testid="travel-quote" data-premium={q.premiumFils}>
              <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <p className="font-semibold">
                  {q.insurerName[locale]}{' '}
                  {q.takaful && <span className="ms-1 rounded-full bg-islamic-soft px-2 py-0.5 text-xs text-islamic">{tr('takaful')}</span>}
                </p>
                <p className="text-xs text-text-muted">
                  {[
                    tr('insTripDays', { days: q.days }),
                    tr('insTravellersCount', { count: q.adults + q.children }),
                    tr('insMedicalCover', { amount: formatBhd(q.medicalCoverFils, locale, { decimals: 0 }) }),
                    q.schengenCompliant && tr('insSchengen'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <p className="ms-auto font-bold sm:ms-0" data-testid="premium">{tr('insTotalPremium', { amount: formatBhd(q.premiumFils, locale) })}</p>
              <BuyPolicyButton
                locale={locale}
                label={`${tr('insTravelTitle')} · ${q.insurerName[locale]}`}
                request={{ line: 'travel', insurerId: q.insurerId, input: query }}
              />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-text-muted">{tr('insSandboxNote')}</p>
      </section>
    </div>
  );
}
