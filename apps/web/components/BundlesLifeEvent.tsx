import Link from 'next/link';
import type { BundleItem, BundleStructure, LifeEvent, LifeEventBundle } from '@sahel/domain';
import type { Translator } from '@/lib/i18n';
import { STRUCTURE_LABEL } from '@/lib/labels';

/** Tile for one life event (hub page). */
export function LifeEventTile({ e, tr }: { e: LifeEvent; tr: Translator }) {
  return (
    <Link
      href={`/${tr.locale}/life-events/${e.id}`}
      className="card flex items-center gap-4 p-5 transition hover:shadow-lg"
      data-testid={`life-event-${e.id}`}
    >
      <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-soft text-3xl">
        {e.icon}
      </span>
      <span className="flex-1">
        <span className="block font-bold">{e.title[tr.locale]}</span>
        <span className="block text-sm text-text-muted">{e.subtitle[tr.locale]}</span>
      </span>
      <span aria-hidden className="inline-block font-semibold text-brand rtl:rotate-180">→</span>
    </Link>
  );
}

/** Islamic / conventional toggle for the whole bundle. Plain links, so it works without JavaScript. */
export function BundleStructureToggle({ eventId, structure, tr }: { eventId: string; structure: BundleStructure; tr: Translator }) {
  const opts: { s: BundleStructure; label: string; active: string }[] = [
    { s: 'islamic', label: tr.t('lifeStructureIslamic'), active: 'bg-islamic text-white' },
    { s: 'conventional', label: tr.t('lifeStructureConventional'), active: 'bg-brand text-white' },
  ];
  return (
    <div role="group" className="inline-flex rounded-full border border-border bg-surface p-1" data-testid="bundle-structure">
      {opts.map((o) => (
        <Link
          key={o.s}
          href={`/${tr.locale}/life-events/${eventId}?structure=${o.s}`}
          aria-current={structure === o.s ? 'true' : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${structure === o.s ? o.active : 'text-text-muted'}`}
          data-testid={`structure-${o.s}`}
          replace
          scroll={false}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function ItemDetail({ item, tr }: { item: BundleItem; tr: Translator }) {
  if (item.kind === 'card' && item.cardLimitFils !== undefined && item.annualFeeFils !== undefined) {
    return <p className="text-sm text-text-muted">{tr.t('lifeCardOffer', { limit: tr.money(item.cardLimitFils, 0), fee: tr.money(item.annualFeeFils, 0) })}</p>;
  }
  if (item.structure && item.financedFils !== undefined && item.tenureMonths !== undefined) {
    const islamic = item.structure !== 'conventional';
    return (
      <div className="space-y-0.5 text-sm">
        <p className={`text-xs font-semibold ${islamic ? 'text-islamic' : 'text-brand'}`}>{tr.t(STRUCTURE_LABEL[item.structure])}</p>
        <p className="text-text-muted">{tr.t('lifeFinanced', { amount: tr.money(item.financedFils, 0), months: tr.num(item.tenureMonths) })}</p>
        {item.costOfFinanceFils !== undefined && (
          // Islamic structures carry profit, never "interest".
          <p className="text-text-muted">{tr.t(islamic ? 'lifeProfit' : 'lifeInterest', { amount: tr.money(item.costOfFinanceFils) })}</p>
        )}
      </div>
    );
  }
  return null;
}

function ItemFigure({ item, tr }: { item: BundleItem; tr: Translator }) {
  if (item.monthlyFils === 0) {
    return item.placeholder ? <span className="text-sm font-semibold text-text-muted">{tr.t('lifeComingSoon')}</span> : null;
  }
  return (
    <span className="text-end">
      <span className="block text-lg font-bold text-brand" data-testid="bundle-item-monthly">
        {tr.t('perMonth', { amount: tr.money(item.monthlyFils) })}
      </span>
      {!item.countsTowardDbr && <span className="block text-xs text-text-muted">{tr.t('lifeIndicativePremium')}</span>}
    </span>
  );
}

export function BundleItemRow({ item, tr }: { item: BundleItem; tr: Translator }) {
  return (
    <article className="card p-4" data-testid={`bundle-item-${item.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{item.title[tr.locale]}</h3>
            {item.placeholder && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-[#8a5c00]">⚠️ {tr.t('lifeComingSoon')}</span>
            )}
            {!item.countsTowardDbr && item.monthlyFils > 0 && (
              <span className="rounded-full bg-background px-2 py-0.5 text-xs text-text-muted">{tr.t('lifeNotInDbr')}</span>
            )}
          </div>
          <p className="text-sm text-text-muted">{item.description[tr.locale]}</p>
          <ItemDetail item={item} tr={tr} />
        </div>
        <ItemFigure item={item} tr={tr} />
      </div>
      {item.href && (
        <Link href={`/${tr.locale}${item.href}`} className="btn btn-ghost mt-3 w-full text-sm" data-testid="bundle-item-link">
          {tr.t('lifeView')} <span aria-hidden className="inline-block rtl:rotate-180">→</span>
        </Link>
      )}
    </article>
  );
}

/** Total monthly vs the customer's DBR headroom, with the verdict. */
export function BundleSummary({ b, tr }: { b: LifeEventBundle; tr: Translator }) {
  const fits = b.verdict === 'fits';
  return (
    <section
      aria-live="polite"
      className={`card space-y-3 border-2 p-5 ${fits ? 'border-success' : 'border-danger'}`}
      data-testid="bundle-summary"
      data-verdict={b.verdict}
    >
      <p className={`text-xl font-bold ${fits ? 'text-success' : 'text-danger'}`} data-testid="bundle-verdict">
        {fits ? '✓' : '!'} {tr.t(fits ? 'lifeVerdictFits' : 'lifeVerdictOver')}
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-text-muted">{tr.t('lifeTotalMonthly')}</dt>
          <dd className="text-lg font-bold" data-testid="bundle-total">{tr.money(b.totalMonthlyFils)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{tr.t('lifeHeadroom')}</dt>
          <dd className="text-lg font-bold" data-testid="bundle-headroom">{tr.money(b.maxMonthlyFils)}</dd>
        </div>
      </dl>
      <p className="text-sm font-semibold">
        {fits
          ? tr.t('lifeLeftAfter', { amount: tr.money(b.headroomAfterFils) })
          : tr.t('lifeShortfall', { amount: tr.money(b.shortfallFils) })}
      </p>
      {b.otherMonthlyFils > 0 && <p className="text-xs text-text-muted">{tr.t('lifeOtherMonthly', { amount: tr.money(b.otherMonthlyFils) })}</p>}
    </section>
  );
}
