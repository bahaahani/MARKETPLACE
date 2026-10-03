'use client';

import { useEffect, useState } from 'react';
import { formatBhd, type MotorCover, type MotorQuote } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';

/** Motor insurance comparison, via the shared API (same endpoint the Flutter app calls). */
export function InsuranceQuotes({ locale, vehicleValueFils, reference, defaultTakaful = false }: { locale: AppLocale; vehicleValueFils: number; reference: string; defaultTakaful?: boolean }) {
  const [cover, setCover] = useState<MotorCover>('comprehensive');
  const [takafulOnly, setTakafulOnly] = useState(defaultTakaful);
  const [quotes, setQuotes] = useState<MotorQuote[] | null>(null);
  const [error, setError] = useState(false);
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetch('/api/v1/insurance/motor-quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleValueFils, cover, takafulOnly }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j: { data: { quotes: MotorQuote[] } }) => !cancelled && setQuotes(j.data.quotes))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [vehicleValueFils, cover, takafulOnly]);

  return (
    <section className="card p-5" aria-labelledby="ins-title" data-testid="insurance-quotes">
      <h2 id="ins-title" className="mb-3 text-lg font-bold">{tr('motorInsurance')}</h2>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(['comprehensive', 'third-party'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCover(c)}
            aria-pressed={cover === c}
            className={`rounded-full border px-3 py-1 ${cover === c ? 'border-brand bg-brand text-white' : 'border-border'}`}
          >
            {tr(c === 'comprehensive' ? 'comprehensive' : 'thirdParty')}
          </button>
        ))}
        <label className="ms-auto flex items-center gap-2">
          <input type="checkbox" checked={takafulOnly} onChange={(e) => setTakafulOnly(e.target.checked)} />
          {tr('takafulOnly')}
        </label>
      </div>
      {error && <p className="text-sm text-danger">{tr('errorGeneric')}</p>}
      {!quotes && !error && <p className="text-sm text-text-muted">…</p>}
      <ul className="divide-y divide-border">
        {quotes?.map((q) => (
          <li key={q.insurerId} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {q.insurerName[locale]}{' '}
                {q.takaful && <span className="ms-1 rounded-full bg-islamic-soft px-2 py-0.5 text-xs text-islamic">{tr('takaful')}</span>}
              </p>
              <p className="text-xs text-text-muted">
                {[q.roadsideAssistance && tr('roadside'), q.agencyRepair && tr('agencyRepair')].filter(Boolean).join(' · ')}
              </p>
            </div>
            <p className="font-bold">{tr('perYear', { amount: formatBhd(q.annualPremiumFils, locale) })}</p>
            <a
              className="btn btn-ghost text-sm"
              href={`/${locale}/checkout?purpose=insurance_premium&amount=${q.annualPremiumFils}&reference=${encodeURIComponent(`${reference}:${q.insurerId}`)}&label=${encodeURIComponent(q.insurerName[locale])}`}
            >
              {tr('buyPolicy')}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
