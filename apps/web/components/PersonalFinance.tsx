'use client';

import { useMemo, useState } from 'react';
import { compareStructures, formatBhd, type OriginationStructure, type PersonalFinanceRange } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { ApplyButton } from './ApplyFinance';
import { QuoteColumn } from './FinanceCalculator';

/**
 * Personal finance: amount + tenure + structure, then apply. Quotes come from the same @sahel/domain engine
 * as POST /api/v1/quotes/finance (used by the Flutter app). The range (min, max = the customer's pre-approved limit,
 * steps and defaults) is personalFinanceRange() from @sahel/domain, the same one GET /api/v1/config serves to the app.
 */
export function PersonalFinance({ locale, range }: { locale: AppLocale; range: PersonalFinanceRange }) {
  const [amount, setAmount] = useState(range.defaultAmountFils);
  const [tenure, setTenure] = useState(range.defaultTenureMonths);
  const [selected, setSelected] = useState<OriginationStructure>('murabaha');

  const quotes = useMemo(() => compareStructures({ productLine: 'personal', assetPriceFils: amount, downPaymentFils: 0, tenureMonths: tenure }), [amount, tenure]);
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const money = (f: number, d: 0 | 3 = 3) => formatBhd(f, locale, { decimals: d });

  return (
    <section className="card p-5" data-testid="personal-finance">
      <label className="mb-4 block">
        <span className="flex justify-between text-sm font-medium">
          {tr('financeAmount')} <output className="font-bold" data-testid="amount">{money(amount, 0)}</output>
        </span>
        <input
          type="range"
          className="w-full"
          min={range.minAmountFils}
          max={range.maxAmountFils}
          step={range.amountStepFils}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          aria-label={tr('financeAmount')}
        />
      </label>
      <label className="mb-5 block">
        <span className="flex justify-between text-sm font-medium">
          {tr('tenure')} <output className="font-bold">{tr('months', { value: tenure })}</output>
        </span>
        <input
          type="range"
          className="w-full"
          min={range.minTenureMonths}
          max={range.maxTenureMonths}
          step={range.tenureStepMonths}
          value={tenure}
          onChange={(e) => setTenure(Number(e.target.value))}
          aria-label={tr('tenure')}
        />
      </label>

      <p className="mb-2 text-sm font-semibold text-text-muted">{tr('compareSideBySide')}</p>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={tr('compareSideBySide')}>
        {quotes.map((q) => (
          <QuoteColumn
            key={q.structure}
            q={q}
            active={q.structure === selected}
            onSelect={() => setSelected(q.structure as OriginationStructure)}
            tr={tr}
            money={money}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-text-muted">{tr('illustrativeDisclaimer')}</p>
      <div className="mt-4">
        <ApplyButton
          locale={locale}
          className="btn btn-primary w-full"
          body={{ productLine: 'personal', structure: selected, amountFils: amount, tenureMonths: tenure }}
        />
        <p className="mt-2 text-xs text-text-muted">{tr('applyConsent')}</p>
      </div>
    </section>
  );
}
