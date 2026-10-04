'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatBhd, NUMBER_LOCALE, type RewardItem, type RewardRedemption } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';

type CatalogueItem = RewardItem & { affordable: boolean };

/**
 * The IMTIAZ rewards catalogue with redeem → confirm (⚠️ sandbox) via POST /api/v1/me/rewards/redemptions, the endpoint
 * the Flutter app calls too. `affordable` comes from the API; the API still checks the balance (422).
 * One Idempotency-Key per confirmation, so a double click or a retry never redeems twice.
 */
export function RewardsCatalogue({ locale, items }: { locale: AppLocale; items: CatalogueItem[] }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const num = (n: number) => new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(n);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const router = useRouter();
  const [confirming, setConfirming] = useState<{ itemId: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ redemption: RewardRedemption; balance: number } | null>(null);

  async function redeem() {
    if (!confirming) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/me/rewards/redemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': confirming.key },
        body: JSON.stringify({ itemId: confirming.itemId }),
      });
      const json = (await res.json()) as { data?: { redemption: RewardRedemption; balance: number }; error?: { code?: string } };
      if (!res.ok || !json.data) throw json.error ?? {};
      setIssued(json.data);
      setConfirming(null);
      router.refresh();
    } catch (e) {
      setError((e as { code?: string }).code === 'INSUFFICIENT_POINTS' ? tr('rewErrorInsufficient') : tr('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="rew-catalogue" className="space-y-3">
      <h2 id="rew-catalogue" className="text-xl font-bold">{tr('rewCatalogue')}</h2>
      {issued && (
        <div className="card border-islamic p-4" role="status" data-testid="rew-issued">
          <p className="text-sm font-semibold">{tr('rewCodeTitle')}: {issued.redemption.itemName[locale]}</p>
          <p className="my-2 font-mono text-2xl font-bold tracking-widest" dir="ltr" data-testid="rew-code">{issued.redemption.code}</p>
          <p className="text-xs text-text-muted">{tr('rewCodeNote')} {tr('rewExpires', { date: date(issued.redemption.expiresOn) })}</p>
          <p className="mt-1 text-sm font-semibold" data-testid="rew-new-balance">{tr('rewNewBalance', { points: num(issued.balance) })}</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => {
          const open = confirming?.itemId === i.id;
          return (
            <article key={i.id} className="card flex flex-col p-4" data-testid={`rew-item-${i.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{i.name[locale]}</h3>
                  <p className="text-xs text-text-muted">
                    {i.partner[locale]}
                    {i.demoPartner && <span className="ms-1 rounded bg-accent/15 px-1 text-[#8a5c00]">⚠️ {tr('rewDemoPartner')}</span>}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">{tr('rewCost', { points: num(i.pointsCost) })}</span>
              </div>
              <p className="mt-2 flex-1 text-sm">{i.description[locale]}</p>
              <p className="mt-1 text-xs text-text-muted">
                {i.valueFils !== undefined && <>{tr('rewValue', { amount: formatBhd(i.valueFils, locale, { decimals: 0 }) })} · </>}
                {tr('rewValidDays', { days: i.validityDays })}
              </p>
              {open ? (
                <div className="mt-3 rounded-lg bg-background p-3" role="alertdialog" aria-labelledby={`rew-confirm-${i.id}`}>
                  <p id={`rew-confirm-${i.id}`} className="text-sm font-semibold">
                    {tr('rewConfirmTitle', { item: i.name[locale], points: num(i.pointsCost) })}
                  </p>
                  {error && <p className="mt-1 text-sm text-danger" role="alert">{error}</p>}
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={redeem} data-testid="rew-confirm">
                      {tr('rewConfirm')}
                    </button>
                    <button type="button" className="btn btn-ghost flex-1" disabled={busy} onClick={() => setConfirming(null)}>
                      {tr('rewCancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary mt-3"
                  disabled={!i.affordable || busy}
                  onClick={() => {
                    setError(null);
                    setConfirming({ itemId: i.id, key: crypto.randomUUID() });
                  }}
                  data-testid={`rew-redeem-${i.id}`}
                >
                  {i.affordable ? tr('rewRedeem') : tr('rewNotEnough')}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
