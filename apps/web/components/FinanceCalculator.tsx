'use client';

import { useMemo, useState } from 'react';
import { compareStructures, financeLimits, formatBhd, LISTING_DEFAULTS, type FinanceQuote, type FinanceStructure, type ProductLine } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';

const STRUCTURE_LABEL: Record<FinanceStructure, MessageKey> = {
  conventional: 'structureConventional',
  murabaha: 'structureMurabaha',
  ijara: 'structureIjara',
};

/**
 * Islamic / conventional side-by-side calculator. Runs the same @sahel/domain pricing engine
 * that backs POST /api/v1/quotes/finance (used by the Flutter app), so figures match on every channel.
 */
export function FinanceCalculator({ locale, productLine, assetPriceFils }: { locale: AppLocale; productLine: ProductLine; assetPriceFils: number }) {
  const limits = financeLimits(productLine, assetPriceFils);
  const defaults = LISTING_DEFAULTS[productLine];
  const step = productLine === 'home' ? 1_000_000 : 100_000;
  const roundStep = (n: number) => Math.round(n / step) * step;

  const [down, setDown] = useState(() => Math.max(limits.minDownPaymentFils, roundStep((assetPriceFils * defaults.downPaymentPct) / 100)));
  const [tenure, setTenure] = useState(defaults.tenureMonths);
  const [selected, setSelected] = useState<FinanceStructure>(limits.structures[1] ?? limits.structures[0]!);

  const quotes = useMemo(
    () => compareStructures({ productLine, assetPriceFils, downPaymentFils: down, tenureMonths: tenure }),
    [productLine, assetPriceFils, down, tenure],
  );

  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const money = (f: number, d: 0 | 3 = 3) => formatBhd(f, locale, { decimals: d });
  const minDown = Math.ceil(limits.minDownPaymentFils / step) * step;

  return (
    <section className="card p-5" aria-labelledby="calc-title" data-testid="finance-calculator">
      <h2 id="calc-title" className="mb-4 text-lg font-bold">{tr('financeCalculator')}</h2>

      <label className="mb-4 block">
        <span className="flex justify-between text-sm font-medium">
          {tr('downPayment')} <output className="font-bold">{money(down, 0)}</output>
        </span>
        <input
          type="range"
          className="w-full"
          min={minDown}
          max={limits.maxDownPaymentFils}
          step={step}
          value={down}
          onChange={(e) => setDown(Number(e.target.value))}
          aria-label={tr('downPayment')}
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
          step={12}
          value={tenure}
          onChange={(e) => setTenure(Number(e.target.value))}
          aria-label={tr('tenure')}
        />
      </label>

      <p className="mb-2 text-sm font-semibold text-text-muted">{tr('compareSideBySide')}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" role="radiogroup" aria-label={tr('compareSideBySide')}>
        {quotes.map((q) => (
          <QuoteColumn key={q.structure} q={q} active={q.structure === selected} onSelect={() => setSelected(q.structure)} tr={tr} money={money} />
        ))}
      </div>
      <p className="mt-3 text-xs text-text-muted">{tr('illustrativeDisclaimer')}</p>
    </section>
  );
}

/** One structure's column in the side-by-side comparison. Also used by the dealer showroom offer. */
export function QuoteColumn({
  q,
  active,
  onSelect,
  tr,
  money,
  children,
}: {
  q: FinanceQuote;
  active: boolean;
  onSelect: () => void;
  tr: (k: MessageKey, v?: Record<string, string | number>) => string;
  money: (f: number, d?: 0 | 3) => string;
  children?: React.ReactNode;
}) {
  const islamic = q.structure !== 'conventional';
  const rateLabel: MessageKey = q.rateBasis === 'apr' ? 'rateApr' : q.rateBasis === 'flat' ? 'rateFlat' : 'rateProfit';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      data-testid={`quote-${q.structure}`}
      className={`rounded-xl border-2 p-4 text-start transition ${
        active ? (islamic ? 'border-islamic bg-islamic-soft' : 'border-brand bg-brand-soft') : 'border-border bg-surface'
      }`}
    >
      <p className={`text-sm font-bold ${islamic ? 'text-islamic' : 'text-brand'}`}>{tr(STRUCTURE_LABEL[q.structure])}</p>
      <p className="mt-1 text-xs text-text-muted">{tr(q.structure === 'ijara' ? 'monthlyRental' : 'monthlyInstallment')}</p>
      <p className="whitespace-nowrap text-xl font-bold" data-testid={`monthly-${q.structure}`}>{money(q.monthlyFils)}</p>
      <dl className="mt-3 space-y-1 text-xs">
        <Row label={tr('financedAmount')} value={money(q.financedFils, 0)} />
        {q.salePriceFils !== undefined && <Row label={tr('salePrice')} value={money(q.salePriceFils, 0)} />}
        <Row label={tr(q.structure === 'conventional' ? 'interestCost' : 'profitCost')} value={money(q.costOfFinanceFils, 0)} />
        <Row label={tr('totalPayable')} value={money(q.totalPayableFils, 0)} />
        <Row label={tr(rateLabel)} value={`${q.ratePct}%`} />
        {q.rateBasis !== 'apr' && <Row label={tr('aprEquivalent')} value={`${q.aprPct}%`} />}
      </dl>
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className="whitespace-nowrap font-semibold">{value}</dd>
    </div>
  );
}
