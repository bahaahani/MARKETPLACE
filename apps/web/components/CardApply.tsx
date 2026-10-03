'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CardApplication, CardDeclineReason } from '@sahel/domain';
import type { AppLocale, MessageKey } from '@sahel/i18n';
import { translator } from '@/lib/i18n';
import { CardArt } from './CardArt';

const DECLINE_TEXT: Record<CardDeclineReason, MessageKey> = {
  BELOW_MIN_SALARY: 'declineBelowMinSalary',
  NO_DBR_HEADROOM: 'declineNoDbrHeadroom',
};

/**
 * Instant card application (journey J3): confirm → the API decides → virtual card shown.
 * ⚠️ SANDBOX: no processor; the card number is masked and wallet provisioning is simulated.
 * On the web, push provisioning to Apple / Google Wallet is impossible (docs/12-web-platform.md §3),
 * so the wallet buttons explain that it happens in the Sahel app on the phone.
 */
export function CardApply({ locale, cardId, tier }: { locale: AppLocale; cardId: string; tier: string }) {
  const tr = translator(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<CardApplication | null>(null);
  const [walletNote, setWalletNote] = useState(false);

  async function apply() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/v1/cards/${encodeURIComponent(cardId)}/apply`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setResult(((await res.json()) as { data: CardApplication }).data);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (result?.decision === 'DECLINED') {
    return (
      <div className="card p-5 text-center" data-testid="card-declined" role="status">
        <h2 className="text-xl font-bold">{tr.t('cardDeclined')}</h2>
        <p className="mt-1 text-text-muted">{tr.t(DECLINE_TEXT[result.reason])}</p>
        <Link href={`/${locale}/cards`} className="btn btn-primary mt-4 w-full">
          {tr.t('seeOtherCards')}
        </Link>
      </div>
    );
  }

  if (result?.decision === 'APPROVED') {
    const vc = result.virtualCard;
    return (
      <div className="space-y-4" data-testid="card-approved">
        <h2 className="text-xl font-bold" role="status">
          ✓ {tr.t('cardApproved')}
        </h2>
        <div className="overflow-hidden rounded-[var(--radius-lg)] shadow-lg">
          <CardArt gradient={vc.gradient} tier={tier} panMasked={vc.panMasked} expiry={vc.expiry} validThruLabel={tr.t('cardValidThru')} />
        </div>
        <dl className="card grid grid-cols-2 gap-y-1 p-4 text-sm">
          <dt className="text-text-muted">{tr.t('cardLimit')}</dt>
          <dd className="text-end font-semibold" data-testid="card-limit">
            {tier === 'prepaid' ? tr.t('prepaidNoLimit') : tr.money(vc.limitFils, 0)}
          </dd>
          <dt className="text-text-muted">{tr.t('cardValidThru')}</dt>
          <dd className="text-end font-semibold" dir="ltr">
            {vc.expiry}
          </dd>
          <dt className="text-text-muted">{tr.t('cardStatus')}</dt>
          <dd className="text-end font-semibold text-islamic">{vc.status === 'ACTIVE' ? tr.t('cardStatusActive') : vc.status}</dd>
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          {vc.wallet.applePay && (
            <button type="button" className="btn btn-ghost" onClick={() => setWalletNote(true)} data-testid="wallet-apple">
              {tr.t('addToAppleWallet')}
            </button>
          )}
          {vc.wallet.googlePay && (
            <button type="button" className="btn btn-ghost" onClick={() => setWalletNote(true)} data-testid="wallet-google">
              {tr.t('addToGoogleWallet')}
            </button>
          )}
        </div>
        {walletNote && (
          <p className="rounded-md bg-brand-soft p-3 text-sm text-brand" role="status" data-testid="wallet-on-phone">
            📱 {tr.t('walletOnPhone')}
          </p>
        )}
        <p className="rounded-md bg-background p-2 text-center text-xs text-text-muted">⚠️ {tr.t('cardSandboxNote')}</p>
        <Link href={`/${locale}/account`} className="btn btn-primary w-full">
          {tr.t('done')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {tr.t('errorGeneric')}
        </p>
      )}
      <button type="button" className="btn btn-primary w-full" onClick={apply} disabled={busy} data-testid="confirm-card">
        {tr.t('confirmAndIssue')}
      </button>
      <p className="mt-3 text-center text-xs text-text-muted">⚠️ {tr.t('cardSandboxNote')}</p>
    </div>
  );
}
