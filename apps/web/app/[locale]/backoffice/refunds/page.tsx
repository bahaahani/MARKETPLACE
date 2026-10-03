import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, refundQueue } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { RefundButton } from '@/components/BackOffice';
import { payments } from '@/lib/api';
import { isPolicyBound, pageStaffSession } from '@/lib/backoffice-api';
import { METHOD_LABEL } from '@/lib/backoffice-labels';
import { resolveLocale, translator } from '@/lib/i18n';

// Live sandbox store, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'boNavRefunds'), robots: { index: false } };
}

/** Refund queue: captured premiums with no policy. Payment data only. Operations refunds; compliance reads. */
export default async function RefundsPage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const staff = await pageStaffSession();
  if (!staff) redirect(`/${tr.locale}/backoffice`);
  if (!can(staff.role, 'refunds.read')) return <p className="text-danger" data-testid="bo-forbidden">{tr.t('boForbidden')}</p>;

  const items = refundQueue(staff, payments.listAll(), isPolicyBound);
  const refunds = can(staff.role, 'refunds.execute');
  const total = items.reduce((s, r) => s + r.amountFils, 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{tr.t('boRefundsTitle')}</h1>
        <p className="mt-1 text-sm text-text-muted">{tr.t('boRefundsSubtitle')}</p>
        {!refunds && <p className="mt-1 text-sm font-semibold text-text-muted" data-testid="bo-read-only">{tr.t('boReadOnly')}</p>}
      </header>
      {items.length === 0 ? (
        <p className="card p-4 text-sm text-text-muted" data-testid="bo-refunds-empty">{tr.t('boRefundsEmpty')}</p>
      ) : (
        <>
          <p className="text-sm font-semibold" data-testid="bo-refunds-total">
            {tr.t('boRefundsTotal', { count: tr.num(items.length), amount: tr.money(total) })}
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm" data-testid="bo-refunds-table">
              <thead className="bg-background text-xs text-text-muted">
                <tr>
                  <th className="p-3 text-start font-semibold">{tr.t('boColPayment')}</th>
                  <th className="p-3 text-start font-semibold">{tr.t('boColQuote')}</th>
                  <th className="p-3 text-start font-semibold">{tr.t('boColMethod')}</th>
                  <th className="p-3 text-end font-semibold">{tr.t('boColAmount')}</th>
                  <th className="p-3 text-end font-semibold">{tr.t('boColAge')}</th>
                  {refunds && <th className="p-3" />}
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.paymentId} className="border-t border-border" data-testid="bo-refund-row" data-id={r.paymentId}>
                    <td className="p-3 font-mono text-xs">{r.paymentId}</td>
                    <td className="p-3 font-mono text-xs">{r.quoteId}</td>
                    <td className="p-3">{tr.t(METHOD_LABEL[r.method])}</td>
                    <td className="whitespace-nowrap p-3 text-end font-semibold">{tr.money(r.amountFils)}</td>
                    <td className="whitespace-nowrap p-3 text-end">{tr.t('boMinutes', { value: tr.num(r.ageMinutes) })}</td>
                    {refunds && (
                      <td className="p-3 text-end">
                        <RefundButton locale={tr.locale} paymentId={r.paymentId} amountFils={r.amountFils} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
