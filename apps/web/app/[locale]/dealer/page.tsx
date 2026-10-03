import type { Metadata } from 'next';
import Link from 'next/link';
import { DEALER_SELLERS, dealerInventory } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { resolveLocale, translator } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'dealerPortalTitle') };
}

/** Dealer & broker portal entry (B2B). ⚠️ Sandbox: picking a dealership stands in for partner sign-in. */
export default async function DealerHome({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold text-brand">{tr.t('dealerPortalTitle')}</p>
      <h1 className="text-2xl font-bold">{tr.t('dealerChooseTitle')}</h1>
      <p className="mt-1 text-sm text-text-muted">{tr.t('dealerChooseSubtitle')}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {DEALER_SELLERS.map((s) => {
          const { stats } = dealerInventory(s.id);
          return (
            <li key={s.id}>
              <Link href={`/${tr.locale}/dealer/${s.id}`} className="card block h-full p-4 hover:border-brand" data-testid={`dealer-${s.id}`}>
                <span className={`rounded-full px-2 py-0.5 text-xs ${s.type === 'group' ? 'bg-brand-soft text-brand' : 'bg-accent/15 text-[#8a5c00]'}`}>
                  {tr.t(s.type === 'group' ? 'dealerSellerGroup' : 'dealerSellerPartner')}
                </span>
                <p className="mt-2 font-semibold">{s.name[tr.locale]}</p>
                <p className="text-sm text-text-muted">
                  {tr.t('dealerKpiStock')}: {tr.num(stats.count)}
                </p>
                <p className="mt-3 text-sm font-semibold text-brand">{tr.t('dealerOpen')}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
