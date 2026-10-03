import Link from 'next/link';
import { findCard, type VirtualCard, type VirtualCardStatus } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';
import type { Translator } from '@/lib/i18n';
import { CardArt } from './CardArt';

const STATUS_TEXT: Record<VirtualCardStatus, MessageKey> = {
  ACTIVE: 'cardStatusActive',
  FROZEN: 'cardStatusFrozen',
  CLOSED: 'cardStatusClosed',
};

/**
 * "My cards" on the account page: virtual cards issued to this customer (same data as GET /api/v1/me/cards).
 * ⚠️ Sandbox: masked numbers only (last 4 digits), no processor behind them.
 */
export function MyCards({ cards, tr }: { cards: VirtualCard[]; tr: Translator }) {
  return (
    <section aria-labelledby="my-cards" className="lg:col-span-2" data-testid="my-cards">
      <h2 id="my-cards" className="mb-3 text-2xl font-bold">{tr.t('myCards')}</h2>
      {cards.length === 0 ? (
        <p className="card p-4 text-sm text-text-muted">
          {tr.t('noCardsYet')}{' '}
          <Link href={`/${tr.locale}/cards`} className="font-semibold text-brand">
            {tr.t('navCards')} <span className="inline-block rtl:rotate-180">→</span>
          </Link>
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((vc) => {
            const tier = findCard(vc.cardId)?.tier ?? '';
            return (
              <article key={vc.id} className="card overflow-hidden" data-testid="my-card">
                <CardArt gradient={vc.gradient} tier={tier} panMasked={vc.panMasked} expiry={vc.expiry} validThruLabel={tr.t('cardValidThru')} />
                <dl className="grid grid-cols-2 gap-y-1 p-4 text-sm">
                  <dt className="col-span-2 font-semibold">{vc.name[tr.locale]}</dt>
                  <dt className="text-text-muted">{tr.t('cardLimit')}</dt>
                  <dd className="text-end font-semibold" data-testid="my-card-limit">
                    {tier === 'prepaid' ? tr.t('prepaidNoLimit') : tr.money(vc.limitFils, 0)}
                  </dd>
                  <dt className="text-text-muted">{tr.t('cardStatus')}</dt>
                  <dd className={`text-end font-semibold ${vc.status === 'ACTIVE' ? 'text-islamic' : 'text-text-muted'}`} data-testid="my-card-status">
                    {tr.t(STATUS_TEXT[vc.status])}
                  </dd>
                </dl>
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-text-muted">⚠️ {tr.t('cardSandboxNote')}</p>
    </section>
  );
}
