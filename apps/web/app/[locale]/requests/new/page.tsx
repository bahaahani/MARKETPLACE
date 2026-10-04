import type { Metadata } from 'next';
import Link from 'next/link';
import { t } from '@sahel/i18n';
import { BidRequestForm } from '@/components/BidForMe';
import { bidStore, customerBidRules } from '@/lib/bids-store';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageCustomer, pageCustomerView } from '@/lib/session';

// The customer's own headroom, trade-in and open request, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'bidEntryTitle'), robots: { index: false } };
}

/** "Bid For Me" (crazy idea #1): post what you want; dealers compete. One open request at a time (⚠️ sandbox). */
export default async function NewBidRequestPage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const { customerId } = await pageCustomer();
  const me = await pageCustomerView();
  const open = bidStore.list(customerId).find((r) => r.status === 'OPEN');
  const rules = customerBidRules(customerId, me.preApproval.maxMonthlyFils);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{tr.t('bidNewTitle')}</h1>
        <p className="text-text-muted">{tr.t('bidNewSubtitle')}</p>
      </header>
      {open ? (
        <section className="card space-y-3 p-5" data-testid="bid-open-exists">
          <p>{tr.t('bidOpenExists')}</p>
          <Link className="btn btn-primary" href={`/${tr.locale}/requests/${open.id}`}>
            {tr.t('bidViewOpen')}
          </Link>
        </section>
      ) : rules.canPost ? (
        <BidRequestForm locale={tr.locale} rules={rules} />
      ) : (
        <p className="card p-5" data-testid="bid-no-budget">{tr.t('bidNoBudget')}</p>
      )}
      <p className="text-xs text-text-muted">⚠️ {tr.t('bidSandboxNote')}</p>
    </div>
  );
}
