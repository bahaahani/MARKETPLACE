import type { Metadata } from 'next';
import { t } from '@sahel/i18n';
import { RewardsCatalogue } from '@/components/Rewards';
import { resolveLocale, translator } from '@/lib/i18n';
import { rewardsState, rewardsStore } from '@/lib/rewards-store';
import { pageCustomerView } from '@/lib/session';

// Points belong to the session customer and are derived on every request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: t(resolveLocale((await params).locale), 'rewTitle') };
}

/** IMTIAZ Points Everywhere (⚠️ sandbox): balance, tier, history, earn rules, catalogue and vouchers. Same data as GET /api/v1/me/rewards. */
export default async function RewardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const tr = translator(resolveLocale((await params).locale));
  const me = await pageCustomerView();
  const state = rewardsState(me);
  const s = rewardsStore.summary(me.customerId, state);
  const catalogue = rewardsStore.catalogue(me.customerId, state);
  const vouchers = rewardsStore.list(me.customerId);
  const sign = (n: number) => (n > 0 ? `+${tr.num(n)}` : `−${tr.num(-n)}`);
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-brand-dark to-brand p-6 text-white md:p-8" data-testid="rew-summary">
        <h1 className="text-2xl font-bold md:text-3xl">{tr.t('rewTitle')}</h1>
        <p className="mt-1 text-sm opacity-80">{tr.t('rewIntro')}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs opacity-80">{tr.t('rewBalance')}</p>
            <p className="text-3xl font-bold" data-testid="rew-balance" data-points={s.balance}>
              {tr.t('rewardsPoints', { value: tr.num(s.balance) })}
            </p>
            <p className="text-xs opacity-80">{tr.t('rewTotals', { earned: tr.num(s.totals.earned), burned: tr.num(s.totals.burned) })}</p>
          </div>
          <div>
            <p className="text-lg font-bold" data-testid="rew-tier" data-tier={s.tier.id}>★ {tr.t('rewTier', { tier: s.tier.name[tr.locale] })}</p>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-white/20"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={s.progressPct}
              aria-label={s.nextTier ? tr.t('rewTierProgress', { points: tr.num(s.pointsToNextTier), tier: s.nextTier.name[tr.locale] }) : tr.t('rewTierTop')}
            >
              <div className="h-full bg-accent" style={{ width: `${s.progressPct}%` }} />
            </div>
            <p className="mt-1 text-xs opacity-80" data-testid="rew-progress">
              {s.nextTier ? tr.t('rewTierProgress', { points: tr.num(s.pointsToNextTier), tier: s.nextTier.name[tr.locale] }) : tr.t('rewTierTop')}
            </p>
            <p className="text-xs opacity-80">{tr.t('rewTierWindow', { points: tr.num(s.tierPoints), date: tr.date(s.windowFrom) })}</p>
          </div>
        </div>
      </section>
      <p className="text-xs text-text-muted" data-testid="rew-sandbox">⚠️ {tr.t('rewSandboxNote')}</p>

      <RewardsCatalogue locale={tr.locale} items={catalogue.items} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="rew-history">
          <h2 id="rew-history" className="mb-3 text-xl font-bold">{tr.t('rewHistory')}</h2>
          {s.entries.length === 0 ? (
            <p className="text-text-muted">{tr.t('rewHistoryEmpty')}</p>
          ) : (
            <ul className="card divide-y divide-border" data-testid="rew-history-list">
              {s.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 p-3 text-sm" data-testid="rew-entry" data-source={e.source}>
                  <span>
                    <span className="block">{e.title[tr.locale]}</span>
                    <span className="block text-xs text-text-muted">{tr.date(e.at)}</span>
                  </span>
                  <span className={`shrink-0 font-bold ${e.points < 0 ? 'text-danger' : 'text-islamic'}`} dir="ltr">{sign(e.points)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="space-y-6">
          {vouchers.length > 0 && (
            <section aria-labelledby="rew-vouchers">
              <h2 id="rew-vouchers" className="mb-3 text-xl font-bold">{tr.t('rewMyVouchers')}</h2>
              <ul className="space-y-2">
                {vouchers.map((v) => (
                  <li key={v.id} className="card p-3 text-sm" data-testid="rew-voucher">
                    <p className="font-semibold">{v.itemName[tr.locale]}</p>
                    <p className="font-mono" dir="ltr" data-testid="rew-voucher-code">{v.codeMasked}</p>
                    <p className="text-xs text-text-muted">
                      {v.partner[tr.locale]} · {tr.t('rewExpires', { date: tr.date(v.expiresOn) })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="rew-earn">
            <h2 id="rew-earn" className="mb-3 text-xl font-bold">{tr.t('rewHowToEarn')}</h2>
            <ul className="card divide-y divide-border">
              {s.earnRules.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 p-3 text-sm">
                  <span>{r.title[tr.locale]}</span>
                  <span className="shrink-0 font-semibold">
                    {r.pointsPerBhd !== undefined ? tr.t('rewRulePerBhd', { points: tr.num(r.pointsPerBhd) }) : tr.t('rewRuleFixed', { points: tr.num(r.points ?? 0) })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
