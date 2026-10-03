import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findDealer } from '@sahel/domain';
import { resolveLocale, translator } from '@/lib/i18n';

/**
 * Dealer portal chrome. ⚠️ Sandbox: the URL picks the dealership. Production resolves the session from
 * partner sign-in (see dealerSession in lib/api.ts) and only shows the signed-in dealer's data.
 */
export default async function DealerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string; sellerId: string }> }) {
  const { locale, sellerId } = await params;
  const tr = translator(resolveLocale(locale));
  const seller = findDealer(sellerId);
  if (!seller) notFound();
  const base = `/${tr.locale}/dealer/${seller.id}`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <div className="me-auto">
          <p className="text-xs font-semibold text-brand">{tr.t('dealerPortalTitle')}</p>
          <p className="text-lg font-bold" data-testid="dealer-name">{seller.name[tr.locale]}</p>
        </div>
        <nav className="flex gap-1" aria-label={tr.t('dealerPortalTitle')}>
          <Link href={base} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-brand-soft">{tr.t('dealerNavDashboard')}</Link>
          <Link href={`${base}/showroom`} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-brand-soft" data-testid="nav-showroom">{tr.t('dealerNavShowroom')}</Link>
          <Link href={`/${tr.locale}/dealer`} className="rounded-md px-3 py-2 text-sm text-text-muted hover:text-text">{tr.t('dealerSwitch')}</Link>
        </nav>
      </div>
      <p className="rounded-[var(--radius-sm)] bg-accent/15 px-3 py-2 text-xs text-[#8a5c00]">{tr.t('dealerSandboxBanner')}</p>
      {children}
    </div>
  );
}
