import type { Metadata } from 'next';
import { tradeInRules } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { TradeInForm } from '@/components/TradeIn';
import { resolveLocale, translator } from '@/lib/i18n';
import { pageCustomerView } from '@/lib/session';
import { tradeInStore } from '@/lib/tradein-store';

// The garage and the active offer belong to the session customer, so render per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'tradeTitle') };
}

/** Instant trade-in valuation (⚠️ sandbox rules model, not AI). `?garage=<vehicleId>` pre-fills a My Garage car. */
export default async function TradeInPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ garage?: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const { garage } = await searchParams;
  const me = await pageCustomerView();
  const rules = tradeInRules(me.garage);
  const offer = tradeInStore.active(me.customerId) ?? null;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{tr.t('tradeTitle')}</h1>
        <p className="mt-1 text-text-muted">{tr.t('tradeIntro')}</p>
        <p className="mt-2 text-xs text-text-muted" data-testid="tradein-sandbox">⚠️ {tr.t('tradeSandboxNote')}</p>
      </div>
      <TradeInForm locale={tr.locale} rules={rules} initialOffer={offer} initialGarageId={typeof garage === 'string' ? garage : undefined} />
    </div>
  );
}
