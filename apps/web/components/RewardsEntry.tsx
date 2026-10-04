import Link from 'next/link';
import type { CustomerView } from '@sahel/domain';
import type { Translator } from '@/lib/i18n';
import { rewardsState, rewardsStore } from '@/lib/rewards-store';

/** Home page entry to IMTIAZ Points: the session customer's balance and tier (server component). */
export function RewardsEntry({ tr, customer }: { tr: Translator; customer: CustomerView }) {
  const s = rewardsStore.summary(customer.customerId, rewardsState(customer));
  return (
    <Link href={`/${tr.locale}/rewards`} className="card flex items-center gap-4 p-5 transition hover:shadow-lg" data-testid="rewards-cta">
      <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent/15 text-2xl">
        ★
      </span>
      <span className="flex-1">
        <span className="block font-bold">{tr.t('rewTitle')}</span>
        <span className="block text-sm text-text-muted">{tr.t('rewHomeSubtitle', { points: tr.num(s.balance), tier: s.tier.name[tr.locale] })}</span>
      </span>
      <span className="font-semibold text-brand">
        {tr.t('rewHomeCta')} <span className="inline-block rtl:rotate-180">→</span>
      </span>
    </Link>
  );
}
