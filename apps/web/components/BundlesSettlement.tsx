import Link from 'next/link';
import { settlementQuote, type Contract, type SettlementLineKind } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';
import type { Translator } from '@/lib/i18n';

const LINE_LABEL: Record<SettlementLineKind, MessageKey> = {
  remaining_principal: 'settleLineRemainingPrincipal',
  settlement_fee: 'settleLineFee',
  remaining_sale_price: 'settleLineRemainingSalePrice',
  ibra_rebate: 'settleLineIbra',
  remaining_asset_cost: 'settleLineRemainingAssetCost',
};

/** Early-settlement quote for one contract, with "Settle now" through the sandbox checkout. */
export function ContractSettlement({ c, tr }: { c: Contract; tr: Translator }) {
  if (c.installmentsPaid >= c.quote.tenureMonths) return null;
  const q = settlementQuote(c);
  const label = tr.t('settlePaymentLabel', { title: c.title[tr.locale] });
  return (
    <details className="mt-3 rounded-lg bg-background p-3 text-sm" data-testid={`settlement-${c.id}`}>
      <summary className="cursor-pointer font-semibold text-brand">{tr.t('settleShow')}</summary>
      <dl className="mt-3 space-y-1">
        <div className="flex justify-between gap-2 text-text-muted">
          <dt>
            {tr.t('settleToTerm')} · {tr.t('settleRemaining', { count: tr.num(q.installmentsRemaining) })}
          </dt>
          <dd data-testid="settle-to-term">{tr.money(q.remainingScheduledFils)}</dd>
        </div>
        {q.lines.map((l) => (
          <div key={l.kind} className="flex justify-between gap-2">
            <dt>{tr.t(LINE_LABEL[l.kind])}</dt>
            <dd className={l.amountFils < 0 ? 'text-islamic' : undefined}>
              {l.amountFils < 0 ? `− ${tr.money(-l.amountFils)}` : tr.money(l.amountFils)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t border-border pt-2 text-base font-bold">
          <dt>{tr.t('settleAmount')}</dt>
          <dd data-testid="settle-amount">{tr.money(q.settlementAmountFils)}</dd>
        </div>
      </dl>
      <p className="mt-1 font-semibold text-success" data-testid="settle-savings">
        {tr.t('settleSavings', { amount: tr.money(q.savingsFils) })}
      </p>
      <p className="mt-1 text-xs text-text-muted">{tr.t('settleValidUntil', { date: tr.date(q.validUntil) })}</p>
      <p className="mt-1 text-xs text-text-muted">{tr.t(c.structure === 'murabaha' ? 'settleIbraNote' : 'settleFeeNote')}</p>
      <Link
        className="btn btn-primary mt-3 w-full"
        data-testid={`settle-now-${c.id}`}
        href={`/${tr.locale}/checkout?purpose=${q.payment.purpose}&amount=${q.payment.amountFils}&reference=${encodeURIComponent(q.payment.reference)}&label=${encodeURIComponent(label)}`}
      >
        {tr.t('settleNow')}
      </Link>
    </details>
  );
}
