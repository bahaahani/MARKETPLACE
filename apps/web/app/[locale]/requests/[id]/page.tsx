import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { bidRequestView } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { BidBoard } from '@/components/BidForMe';
import { bidStore } from '@/lib/bids-store';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageCustomer } from '@/lib/session';

// Live bids (sandbox store), so render per request; the board then polls the API.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'bidRequestTitle'), robots: { index: false } };
}

export default async function BidRequestPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const tr = translator(resolveLocale(raw));
  // Only the customer who posted it can see it (⚠️ sandbox session).
  const request = bidStore.get(id, (await pageCustomer()).customerId);
  if (!request) notFound();
  return <BidBoard locale={tr.locale} initial={bidRequestView(request)} />;
}
