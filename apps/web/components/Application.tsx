import Link from 'next/link';
import { findVehicle, type ApplicationStep, type ApplicationView, type Decision, type DecisionReason } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';
import type { Translator } from '@/lib/i18n';
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
  const v = findVehicle(app.reference);
  return v ? `${v.make} ${v.model} ${v.year}` : app.reference;
}

export function DecisionCard({ app, tr }: { app: ApplicationView; tr: Translator }) {
  const d = app.decision;
  if (!d) return null;
  const o = OUTCOME[d.outcome];
  return (
    <section className={`rounded-[var(--radius-md)] border-2 p-5 ${o.tone}`} data-testid="decision" data-outcome={d.outcome}>
      <h2 className="text-xl font-bold">{tr.t(o.title)}</h2>
      <p className="mt-1 text-text">{tr.t(o.body)}</p>
      <h3 className="mt-3 text-sm font-semibold text-text-muted">{tr.t('decisionReasons')}</h3>
      <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-text">
        {d.reasons.map((r) => (
          <li key={r} data-testid="decision-reason" data-reason={r}>
            {reasonText(r, app, tr)}
          </li>
        ))}
      </ul>
      {d.outcome === 'DECLINED' && <p className="mt-2 text-sm text-text">{tr.t('tryLowerAmount')}</p>}
    </section>
  );
}

export function OfferSummary({ app, tr }: { app: ApplicationView; tr: Translator }) {
  const q = app.quote;
  const islamic = q.structure !== 'conventional';
  const rateLabel: MessageKey = q.rateBasis === 'apr' ? 'rateApr' : q.rateBasis === 'flat' ? 'rateFlat' : 'rateProfit';
  const rows: [string, string][] = [
    ...(app.productLine === 'vehicle'
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
      <p className="mt-3 text-xs text-text-muted">{tr.t('monthlyInstallment')}</p>
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

/** Vertical timeline. Murabaha steps are grouped and explained, since their order is a Shari'a requirement. */
export function Timeline({ steps, tr }: { steps: ApplicationStep[]; tr: Translator }) {
  const groups: { murabaha: boolean; steps: ApplicationStep[] }[] = [];
  for (const s of steps) {
    const last = groups[groups.length - 1];
    if (last && last.murabaha === s.murabaha) last.steps.push(s);
    else groups.push({ murabaha: s.murabaha, steps: [s] });
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
          s.done ? (s.murabaha ? 'border-islamic bg-islamic' : 'border-brand bg-brand') : 'border-border bg-surface'
        }`}
      />
      <p className={`font-medium ${s.done ? '' : 'text-text-muted'}`}>{tr.t(STATUS_LABEL[s.status])}</p>
      <p className="text-xs text-text-muted">{s.at ? <time dateTime={s.at}>{when.format(new Date(s.at))}</time> : tr.t('stepUpcoming')}</p>
    </li>
  );

  return (
    <section className="card p-5" aria-labelledby="progress-title">
      <h2 id="progress-title" className="mb-4 text-lg font-bold">{tr.t('applicationProgress')}</h2>
      <ol data-testid="timeline">
        {groups.map((g) =>
          g.murabaha ? (
            <li key={g.steps[0]!.status} className="mb-4 rounded-[var(--radius-md)] border border-islamic bg-islamic-soft p-3" data-testid="murabaha-steps">
              <p className="mb-3 text-xs font-semibold text-islamic">{tr.t('murabahaSequenceNote')}</p>
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
