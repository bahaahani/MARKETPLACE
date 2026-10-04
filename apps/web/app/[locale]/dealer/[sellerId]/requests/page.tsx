import type { Metadata } from 'next';
import { findDealer } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { notFound } from 'next/navigation';
import { DealerRequestCard } from '@/components/DealerBids';
import { bidStore } from '@/lib/bids-store';
import { resolveLocale, translator } from '@/lib/i18n';

// Requests open and close at runtime, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'bidDealerTitle') };
}

/** Dealer portal: open "Bid For Me" requests this dealer's stock matches, with a bid form on each. */
export default async function DealerRequestsPage({ params }: { params: Promise<{ locale: string; sellerId: string }> }) {
  const { locale, sellerId } = await params;
  const tr = translator(resolveLocale(locale));
  if (!findDealer(sellerId)) notFound();
  const requests = bidStore.openForDealer(sellerId);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{tr.t('bidDealerTitle')}</h1>
        <p className="text-sm text-text-muted">{tr.t('bidDealerSubtitle')}</p>
      </header>
      {requests.length === 0 ? (
        <p className="card p-5 text-sm text-text-muted" data-testid="dealer-requests-empty">{tr.t('bidDealerEmpty')}</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2" data-testid="dealer-requests">
          {requests.map((r) => (
            <DealerRequestCard key={r.id} locale={tr.locale} sellerId={sellerId} initial={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
