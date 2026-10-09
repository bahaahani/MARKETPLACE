import Link from 'next/link';
import { findProperty, findVehicle, type ApplicationStep, type ApplicationView, type Decision, type DecisionReason } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';
import type { Translator } from '@/lib/i18n';
import { BID_EXTRA_LABEL } from '@/lib/bids-labels';
import { STATUS_LABEL, STRUCTURE_LABEL } from '@/lib/labels';

const OUTCOME: Record<Decision['outcome'], { title: MessageKey; body: MessageKey; tone: string }> = {
  APPROVED: { title: 'decisionApproved', body: 'decisionApprovedBody', tone: 'border-islamic bg-islamic-soft text-islamic' },
  REFERRED: { title: 'decisionReferred', body: 'decisionReferredBody', tone: 'border-accent bg-accent/10 text-[#8a5c00]' },
  DECLINED: { title: 'decisionDeclined', body: 'decisionDeclinedBody', tone: 'border-danger bg-danger/10 text-danger' },
};

/** Reason codes in plain language, with the figures that explain them. */
export function reasonText(reason: DecisionReason, app: ApplicationView, tr: Translator): string {
  const d = app.decision!;
  switch (reason) {
    case 'OK':
      return tr.t('reasonOk');
    case 'DBR_EXCEEDED':
      return tr.t('reasonDbrExceeded', { monthly: tr.money(d.monthlyFils), max: tr.money(d.maxMonthlyFils), cap: d.dbrCapPct });
    case 'AMOUNT_ABOVE_PREAPPROVAL':
      return tr.t('reasonAmountAbovePreapproval', { amount: tr.money(app.quote.financedFils, 0), limit: tr.money(d.preApprovedLimitFils, 0) });
    case 'HIGH_DBR_UTILISATION':
      return tr.t('reasonHighDbrUtilisation', { monthly: tr.money(d.monthlyFils), max: tr.money(d.maxMonthlyFils) });
  }
}

export function applicationTitle(app: ApplicationView, tr: Translator): string {
  if (app.productLine === 'personal') return tr.t('personalFinanceTitle');
  if (app.productLine === 'home') return findProperty(app.reference)?.title[tr.locale] ?? app.reference;
  const v = findVehicle(app.reference);
  return v ? `${v.make} ${v.model} ${v.year}` : app.reference;
}

export function DecisionCard({ app, tr }: { app: ApplicationView; tr: Translator }) {
  const d = app.decision;
  if (!d) return null;
  // A credit officer's review of a referred application replaces the automatic outcome.
  const review = app.review;
  const outcome = review?.outcome ?? d.outcome;
  const o = OUTCOME[outcome];
  const body: MessageKey = review ? (review.outcome === 'APPROVED' ? 'boReviewedApprovedBody' : 'boReviewedDeclinedBody') : o.body;
  return (
    <section className={`rounded-[var(--radius-md)] border-2 p-5 ${o.tone}`} data-testid="decision" data-outcome={outcome}>
      <h2 className="text-xl font-bold">{tr.t(o.title)}</h2>
      {review && (
        <p className="mt-1 inline-block rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-text" data-testid="reviewed-by-officer">
          {tr.t('boReviewedByOfficer')}
        </p>
      )}
      <p className="mt-1 text-text">{tr.t(body)}</p>
      <h3 className="mt-3 text-sm font-semibold text-text-muted">{tr.t('decisionReasons')}</h3>
      <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-text">
        {d.reasons.map((r) => (
          <li key={r} data-testid="decision-reason" data-reason={r}>
            {reasonText(r, app, tr)}
          </li>
        ))}
      </ul>
      {outcome === 'DECLINED' && <p className="mt-2 text-sm text-text">{tr.t('tryLowerAmount')}</p>}
    </section>
  );
}

export function OfferSummary({ app, tr }: { app: ApplicationView; tr: Translator }) {
  const q = app.quote;
  const islamic = q.structure !== 'conventional';
  const rateLabel: MessageKey = q.rateBasis === 'apr' ? 'rateApr' : q.rateBasis === 'flat' ? 'rateFlat' : 'rateProfit';
  const rows: [string, string][] = [
    ...(app.productLine !== 'personal'
      ? ([
          [tr.t('price'), tr.money(q.assetPriceFils, 0)],
          [tr.t('downPayment'), tr.money(q.downPaymentFils, 0)],
        ] as [string, string][])
      : []),
    [tr.t('financedAmount'), tr.money(q.financedFils, 0)],
    [tr.t('tenure'), tr.t('months', { value: q.tenureMonths })],
    ...(q.salePriceFils !== undefined ? ([[tr.t('salePrice'), tr.money(q.salePriceFils, 0)]] as [string, string][]) : []),
    [tr.t(islamic ? 'profitCost' : 'interestCost'), tr.money(q.costOfFinanceFils, 0)],
    [tr.t('totalPayable'), tr.money(q.totalPayableFils, 0)],
    [tr.t(rateLabel), `${q.ratePct}%`],
    ...(q.rateBasis !== 'apr' ? ([[tr.t('aprEquivalent'), `${q.aprPct}%`]] as [string, string][]) : []),
  ];
  return (
    <section className="card p-5" data-testid="offer-summary" aria-labelledby="offer-title">
      <h2 id="offer-title" className="text-lg font-bold">{tr.t('yourOffer')}</h2>
      <p className={`text-sm font-semibold ${islamic ? 'text-islamic' : 'text-brand'}`}>{tr.t(STRUCTURE_LABEL[q.structure])}</p>
      <p className="mt-3 text-xs text-text-muted">{tr.t(q.structure === 'ijara' ? 'monthlyRental' : 'monthlyInstallment')}</p>
      <p className="text-2xl font-bold" data-testid="offer-monthly">{tr.money(q.monthlyFils)}</p>
      <dl className="mt-3 space-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-text-muted">{label}</dt>
            <dd className="whitespace-nowrap font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-text-muted">{tr.t('illustrativeDisclaimer')}</p>
    </section>
  );
}

/**
 * How the financed amount is made up, from the API's `pricing` (nothing is computed here): list price, the dealer's
 * discount from an accepted bid, the trade-in credit (credited at delivery) and the extras. Only shown when the
 * application carries a bid or a trade-in.
 */
export function PricingBreakdown({ app, tr }: { app: ApplicationView; tr: Translator }) {
  const p = app.pricing;
  if (!app.source && !app.tradeIn && p.discountFils === 0 && p.extras.length === 0) return null;
  const row = (label: string, value: string, testid: string, strong = false) => (
    <div key={testid} className={`flex items-baseline justify-between gap-2 ${strong ? 'font-bold' : ''}`}>
      <dt className={strong ? '' : 'text-text-muted'}>{label}</dt>
      <dd className="whitespace-nowrap font-semibold" data-testid={testid}>{value}</dd>
    </div>
  );
  return (
    <section className="card p-5" data-testid="pricing-breakdown" aria-labelledby="pricing-title">
      <h2 id="pricing-title" className="text-lg font-bold">{tr.t('carryPricingTitle')}</h2>
      {app.source && <p className="text-sm font-semibold text-islamic" data-testid="pricing-from-bid">{tr.t('carryPricingFromBid')}</p>}
      <dl className="mt-3 space-y-1 text-sm">
        {row(tr.t('carryPricingList'), tr.money(p.listPriceFils, 0), 'pricing-list')}
        {p.discountFils > 0 && row(tr.t('carryPricingDiscount'), `−${tr.money(p.discountFils, 0)}`, 'pricing-discount')}
        {row(tr.t('carryPricingPrice'), tr.money(p.priceFils, 0), 'pricing-price', true)}
        {p.tradeInCreditFils > 0 && row(tr.t('carryPricingTradeIn'), `−${tr.money(p.tradeInCreditFils, 0)}`, 'pricing-tradein')}
        {row(tr.t('carryPricingCash'), tr.money(p.cashDownPaymentFils, 0), 'pricing-cash')}
        {row(tr.t('financedAmount'), tr.money(p.financedFils, 0), 'pricing-financed', true)}
      </dl>
      {p.tradeInCreditFils > 0 && (
        <p className="mt-2 text-xs text-text-muted" data-testid="pricing-tradein-note">{tr.t('carryPricingTradeInNote', { amount: tr.money(p.tradeInCreditFils, 0) })}</p>
      )}
      {p.extras.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-text-muted">{tr.t('carryPricingExtras')}</p>
          <ul className="mt-1 flex flex-wrap gap-1 text-xs" data-testid="pricing-extras">
            {p.extras.map((x) => (
              <li key={x} className="rounded-full bg-islamic-soft px-2 py-0.5 text-islamic">{tr.t(BID_EXTRA_LABEL[x])}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Vertical timeline. Murabaha and Ijara steps are grouped and explained, since their order is a Shari'a requirement. */
export function Timeline({ steps, tr }: { steps: ApplicationStep[]; tr: Translator }) {
  const kind = (s: ApplicationStep) => (s.murabaha ? 'murabaha' : s.ijara ? 'ijara' : 'plain');
  const groups: { kind: 'murabaha' | 'ijara' | 'plain'; steps: ApplicationStep[] }[] = [];
  for (const s of steps) {
    const last = groups[groups.length - 1];
    if (last && last.kind === kind(s)) last.steps.push(s);
    else groups.push({ kind: kind(s), steps: [s] });
  }
  const when = new Intl.DateTimeFormat(tr.locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bahrain',
  });

  const item = (s: ApplicationStep) => (
    <li
      key={s.status}
      className="relative pb-4 ps-7 before:absolute before:start-[7px] before:top-5 before:bottom-0 before:w-0.5 before:bg-border before:content-[''] last:pb-0 last:before:hidden"
      data-testid="timeline-step"
      data-status={s.status}
      data-done={s.done}
    >
      <span
        aria-hidden
        className={`absolute start-0 top-1 h-4 w-4 rounded-full border-2 ${
          s.done ? (s.murabaha || s.ijara ? 'border-islamic bg-islamic' : 'border-brand bg-brand') : 'border-border bg-surface'
        }`}
      />
      <p className={`font-medium ${s.done ? '' : 'text-text-muted'}`}>{tr.t(STATUS_LABEL[s.status])}</p>
      <p className="text-xs text-text-muted">{s.at ? <time dateTime={s.at}>{when.format(new Date(s.at))}</time> : tr.t('stepUpcoming')}</p>
      {s.by === 'CREDIT_OFFICER' && (
        <p className="text-xs font-semibold text-brand" data-testid="step-reviewed-by-officer">
          {tr.t('boReviewedByOfficer')}
        </p>
      )}
    </li>
  );

  return (
    <section className="card p-5" aria-labelledby="progress-title">
      <h2 id="progress-title" className="mb-4 text-lg font-bold">{tr.t('applicationProgress')}</h2>
      <ol data-testid="timeline">
        {groups.map((g) =>
          g.kind !== 'plain' ? (
            <li
              key={g.steps[0]!.status}
              className="mb-4 rounded-[var(--radius-md)] border border-islamic bg-islamic-soft p-3"
              data-testid={g.kind === 'murabaha' ? 'murabaha-steps' : 'ijara-steps'}
            >
              <p className="mb-3 text-xs font-semibold text-islamic">{tr.t(g.kind === 'murabaha' ? 'murabahaSequenceNote' : 'homeIjaraSequenceNote')}</p>
              <ol>{g.steps.map(item)}</ol>
            </li>
          ) : (
            g.steps.map(item)
          ),
        )}
      </ol>
    </section>
  );
}

export function ApplicationRow({ app, tr }: { app: ApplicationView; tr: Translator }) {
  return (
    <article className="card flex items-center justify-between gap-3 p-4" data-testid="application">
      <div>
        <h3 className="font-semibold">{applicationTitle(app, tr)}</h3>
        <p className="text-xs text-text-muted">
          {tr.t(STRUCTURE_LABEL[app.structure])} · {tr.t(STATUS_LABEL[app.status])}
        </p>
      </div>
      <Link className="btn btn-ghost px-3 py-1 text-sm" href={`/${tr.locale}/applications/${app.id}`}>
        {tr.t('viewApplication')}
      </Link>
    </article>
  );
}
