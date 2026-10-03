import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { demoCustomer, findCard, offeredCardLimit } from '@sahel/domain';
import { t } from '@sahel/i18n';
import { CardApply } from '@/components/CardApply';
import { CardArt } from '@/components/CardArt';
import { resolveLocale, translator } from '@/lib/i18n';

type Params = Promise<{ locale: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, id } = await params;
  const l = resolveLocale(locale);
  const card = findCard(id);
  return { title: card ? t(l, 'applyCardTitle', { card: card.name[l] }) : t(l, 'cardsTitle'), robots: { index: false } };
}

export default async function CardApplyPage({ params }: { params: Params }) {
  const { locale, id } = await params;
  const tr = translator(resolveLocale(locale));
  const card = findCard(id);
  if (!card) notFound();
  // The eligibility check is already done from the customer's pre-approval (journey J3, step 1).
  const me = demoCustomer();
  const offered = offeredCardLimit(card, me);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-bold">{tr.t('applyCardTitle', { card: card.name[tr.locale] })}</h1>
      <div className="overflow-hidden rounded-[var(--radius-lg)]">
        <CardArt gradient={card.gradient} tier={card.tier} />
      </div>
      <dl className="card grid grid-cols-2 gap-y-1 p-4 text-sm">
        <dt className="text-text-muted">{tr.t('yourPreApprovedLimit')}</dt>
        <dd className="text-end font-semibold" data-testid="offered-limit">
          {card.tier === 'prepaid' ? tr.t('prepaidNoLimit') : tr.money(offered, 0)}
        </dd>
        <dt className="text-text-muted">{tr.t('annualFee')}</dt>
        <dd className="text-end font-semibold">{card.annualFeeFils === 0 ? tr.t('free') : tr.money(card.annualFeeFils, 0)}</dd>
      </dl>
      <p className="text-sm text-text-muted">{tr.t('cardEligibilityDone')}</p>
      <CardApply locale={tr.locale} cardId={card.id} tier={card.tier} />
    </div>
  );
}
