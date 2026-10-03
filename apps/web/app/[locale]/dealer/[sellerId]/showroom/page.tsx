import type { Metadata } from 'next';
import { dealerInventory, findDealer } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { notFound } from 'next/navigation';
import { DealerShowroom } from '@/components/DealerShowroom';
import { resolveLocale, translator } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'dealerNavShowroom') };
}

export default async function ShowroomPage({ params }: { params: Promise<{ locale: string; sellerId: string }> }) {
  const { locale, sellerId } = await params;
  const tr = translator(resolveLocale(locale));
  if (!findDealer(sellerId)) notFound();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{tr.t('dealerShowroomTitle')}</h1>
      <DealerShowroom locale={tr.locale} sellerId={sellerId} inventory={dealerInventory(sellerId).items} />
    </div>
  );
}
