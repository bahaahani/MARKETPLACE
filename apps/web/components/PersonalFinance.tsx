'use client';

import { useMemo, useState } from 'react';
import { compareStructures, financeLimits, formatBhd, LISTING_DEFAULTS, MIN_PERSONAL_FINANCE_FILS, type OriginationStructure } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { ApplyButton } from './ApplyFinance';
import { QuoteColumn } from './FinanceCalculator';

const AMOUNT_STEP = 100_000; // BHD 100
const TENURE_STEP = 6;

/**
 * Personal finance: amount + tenure + structure, then apply. Quotes come from the same @sahel/domain engine
 * as POST /api/v1/quotes/finance (used by the Flutter app). The slider stops at the customer's pre-approved limit.
 */
export function PersonalFinance({ locale, maxAmountFils }: { locale: AppLocale; maxAmountFils: number }) {
  const limits = financeLimits('personal', MIN_PERSONAL_FINANCE_FILS);
  const maxAmount = Math.max(MIN_PERSONAL_FINANCE_FILS, Math.floor(maxAmountFils / AMOUNT_STEP) * AMOUNT_STEP);
  const [amount, setAmount] = useState(() => Math.min(maxAmount, 5_000_000));
  const [tenure, setTenure] = useState(LISTING_DEFAULTS.personal.tenureMonths);
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
          min={MIN_PERSONAL_FINANCE_FILS}
          max={maxAmount}
          step={AMOUNT_STEP}
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
          min={limits.minTenureMonths}
          max={limits.maxTenureMonths}
          step={TENURE_STEP}
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
