'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { formatBhd, MEDICAL_MAX_CHILDREN, MEDICAL_NATIONALITIES, MEDICAL_TIERS, type MedicalQuote, type MedicalQuoteInput } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { BuyPolicyButton } from './BuyPolicyButton';
import { insuranceErrorKey, MEDICAL_NATIONALITY_LABEL, MEDICAL_TIER_LABEL } from '@/lib/insurance-labels';
import { InsuranceApiError, postJson } from '@/lib/policy-client';

/**
 * Medical insurance comparison and buying, via the shared API (same endpoints the Flutter app calls).
 * Indicative quote only: no medical underwriting happens here.
 */
export function MedicalQuotes({ locale, defaultPrimaryDob, defaultSpouseDob, defaultChildDob }: { locale: AppLocale; defaultPrimaryDob: string; defaultSpouseDob: string; defaultChildDob: string }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const [form, setForm] = useState<MedicalQuoteInput>({
    primaryDateOfBirth: defaultPrimaryDob,
    childrenDatesOfBirth: [],
    tier: 'basic',
    nationality: 'bahraini',
    preExistingConditions: false,
  });
  // The request last submitted; the Takaful filter re-runs it immediately.
  const [query, setQuery] = useState<MedicalQuoteInput>(form);
  const [takafulOnly, setTakafulOnly] = useState(false);
  const [quotes, setQuotes] = useState<MedicalQuote[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setQuotes(null);
    postJson<{ quotes: MedicalQuote[] }>('/api/v1/insurance/medical-quotes', { ...query, takafulOnly })
      .then((d) => !cancelled && setQuotes(d.quotes))
      .catch((e: unknown) => !cancelled && setError(insuranceErrorKey(e instanceof InsuranceApiError ? e.code : undefined)));
    return () => {
      cancelled = true;
    };
  }, [query, takafulOnly]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQuery({ ...form, childrenDatesOfBirth: [...form.childrenDatesOfBirth] });
  };
  const set = <K extends keyof MedicalQuoteInput>(k: K, v: MedicalQuoteInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setChild = (i: number, dob: string) => set('childrenDatesOfBirth', form.childrenDatesOfBirth.map((d, j) => (j === i ? dob : d)));
  const pill = (active: boolean) => `rounded-full border px-3 py-1 ${active ? 'border-brand bg-brand text-white' : 'border-border'}`;
  const field = 'w-full rounded-lg border border-border bg-surface p-2';
  const money0 = (fils: number) => formatBhd(fils, locale, { decimals: 0 });

  return (
    <div className="space-y-4">
      <form className="card space-y-4 p-5" onSubmit={submit} noValidate data-testid="medical-form">
        <p className="rounded-lg bg-background p-3 text-sm text-text-muted" data-testid="medical-indicative">{tr('insMedIndicative')}</p>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">{tr('insMedMembers')}</legend>
          <label className="block text-sm">
            <span className="mb-1 block">{tr('insMedPrimaryDob')}</span>
            <input type="date" className={field} value={form.primaryDateOfBirth} onChange={(e) => set('primaryDateOfBirth', e.target.value)} data-testid="primary-dob" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.spouseDateOfBirth !== undefined}
              onChange={(e) => setForm((f) => ({ ...f, spouseDateOfBirth: e.target.checked ? defaultSpouseDob : undefined }))}
              data-testid="add-spouse"
            />
            {tr('insMedAddSpouse')}
          </label>
          {form.spouseDateOfBirth !== undefined && (
            <label className="block text-sm">
              <span className="mb-1 block">{tr('insMedSpouseDob')}</span>
              <input type="date" className={field} value={form.spouseDateOfBirth} onChange={(e) => set('spouseDateOfBirth', e.target.value)} data-testid="spouse-dob" />
            </label>
          )}
          <div>
            <p className="mb-1 text-sm">{tr('insMedChildren')}</p>
            {form.childrenDatesOfBirth.map((dob, i) => (
              <div key={i} className="mb-2 flex items-end gap-2" data-testid="child-row">
                <label className="flex-1 text-sm">
                  <span className="mb-1 block">{tr('insMedChildDob', { n: i + 1 })}</span>
                  <input type="date" className={field} value={dob} onChange={(e) => setChild(i, e.target.value)} data-testid={`child-dob-${i}`} />
                </label>
                <button type="button" className="btn btn-ghost text-sm" onClick={() => set('childrenDatesOfBirth', form.childrenDatesOfBirth.filter((_, j) => j !== i))} data-testid={`remove-child-${i}`}>
                  {tr('insMedRemove')}
                </button>
              </div>
            ))}
            {/* The API validates the limit; the button only stops adding rows once the form could not be valid. */}
            <button
              type="button"
              className="btn btn-ghost text-sm"
              disabled={form.childrenDatesOfBirth.length >= MEDICAL_MAX_CHILDREN}
              onClick={() => set('childrenDatesOfBirth', [...form.childrenDatesOfBirth, defaultChildDob])}
              data-testid="add-child"
            >
              {tr('insMedAddChild')}
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{tr('insMedNationality')}</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {MEDICAL_NATIONALITIES.map((n) => (
              <button key={n} type="button" aria-pressed={form.nationality === n} className={pill(form.nationality === n)} onClick={() => set('nationality', n)} data-testid={`nationality-${n}`}>
                {tr(MEDICAL_NATIONALITY_LABEL[n])}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{tr('insMedPlan')}</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {MEDICAL_TIERS.map((tier) => (
              <button key={tier} type="button" aria-pressed={form.tier === tier} className={pill(form.tier === tier)} onClick={() => set('tier', tier)} data-testid={`tier-${tier}`}>
                {tr(MEDICAL_TIER_LABEL[tier])}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.preExistingConditions} onChange={(e) => set('preExistingConditions', e.target.checked)} data-testid="pre-existing" />
            {tr('insMedPreExisting')}
          </label>
          <p className="mt-1 text-xs text-text-muted">{tr('insMedPreExistingHint')}</p>
        </div>
        <button type="submit" className="btn btn-primary w-full sm:w-auto" data-testid="get-quotes">
          {tr('insGetQuotes')}
        </button>
      </form>

      <section className="card p-5" aria-labelledby="medical-quotes-title" data-testid="medical-quotes">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="medical-quotes-title" className="text-lg font-bold">{tr('insCompareInsurers')}</h2>
          <label className="ms-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={takafulOnly} onChange={(e) => setTakafulOnly(e.target.checked)} />
            {tr('takafulOnly')}
          </label>
        </div>
        {error && <p className="text-sm text-danger" role="alert" data-testid="quote-error">{tr(error)}</p>}
        {!quotes && !error && <p className="text-sm text-text-muted">…</p>}
        <ul className="divide-y divide-border">
          {quotes?.map((q) => (
            <li key={q.insurerId} className="flex flex-wrap items-center gap-3 py-3" data-testid="medical-quote" data-premium={q.annualPremiumFils} data-status={q.preExistingStatus}>
              <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <p className="font-semibold">
                  {q.insurerName[locale]}{' '}
                  {q.takaful && <span className="ms-1 rounded-full bg-islamic-soft px-2 py-0.5 text-xs text-islamic">{tr('takaful')}</span>}
                </p>
                <p className="text-xs text-text-muted">
                  {[
                    tr('insMedAnnualLimit', { amount: money0(q.annualLimitFils) }),
                    q.coPayPct > 0 ? tr('insMedCoPay', { pct: q.coPayPct }) : tr('insMedNoCoPay'),
                    q.inpatient && tr('insMedInpatient'),
                    q.outpatient && tr('insMedOutpatient'),
                    q.maternityWaitingMonths === null ? tr('insMedNoMaternity') : tr('insMedMaternity', { months: q.maternityWaitingMonths }),
                    q.dental && tr('insMedDental'),
                    q.optical && tr('insMedOptical'),
                    tr('insMedMembersCount', { count: q.adults + q.children }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {q.preExistingStatus === 'surcharge' && (
                  <p className="text-xs text-text-muted" data-testid="surcharge-note">{tr('insMedSurcharge', { amount: formatBhd(q.preExistingSurchargeFils, locale) })}</p>
                )}
                {q.preExistingStatus === 'referred' && <p className="text-xs text-danger" data-testid="referred-note">{tr('insMedReferred')}</p>}
              </div>
              <p className="ms-auto font-bold sm:ms-0" data-testid="premium">{tr('insMedPerYear', { amount: formatBhd(q.annualPremiumFils, locale) })}</p>
              {q.buyable && (
                <BuyPolicyButton
                  locale={locale}
                  label={`${tr('insMedTitle')} · ${q.insurerName[locale]}`}
                  request={{ line: 'medical', insurerId: q.insurerId, input: query }}
                />
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-text-muted">{tr('insSandboxNote')}</p>
      </section>
    </div>
  );
}
