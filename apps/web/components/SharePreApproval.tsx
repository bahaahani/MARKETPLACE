'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PreApprovalShare } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';

/** "mm:ss" with Latin digits in both languages. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Always-on pre-approval in the showroom (idea #3, J7): the customer creates a short-lived code and QR
 * via POST /api/v1/me/preapproval-token. The dealer redeems it for first name and limits only.
 */
export function SharePreApproval({ locale }: { locale: AppLocale }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const [share, setShare] = useState<PreApprovalShare | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  async function create() {
    setState('busy');
    try {
      const res = await fetch('/api/v1/me/preapproval-token', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const { data } = (await res.json()) as { data: PreApprovalShare };
      setQr(await QRCode.toDataURL(data.token, { margin: 1, width: 220, errorCorrectionLevel: 'M' }));
      setShare(data);
      setNow(Date.now());
      setState('idle');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    if (!share) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [share]);

  const remaining = share ? Date.parse(share.expiresAt) - now : 0;
  const expired = share !== null && remaining <= 0;

  return (
    <section className="card p-4" aria-labelledby="share-title" data-testid="share-preapproval">
      <h2 id="share-title" className="font-semibold">{tr('dealerShareTitle')}</h2>
      <p className="mt-1 text-sm text-text-muted">{tr('dealerShareHint')}</p>
      {share && !expired && (
        <div className="mt-4 flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium">{tr('dealerShareCode')}</p>
          {qr && <img src={qr} alt={tr('dealerQrAlt', { token: share.token })} width={220} height={220} className="rounded-lg border border-border" />}
          <p className="font-mono text-4xl font-bold tracking-widest" dir="ltr" data-testid="share-token">{share.token}</p>
          <p className="text-sm text-text-muted" data-testid="share-countdown">{tr('dealerShareExpiresIn', { time: formatCountdown(remaining) })}</p>
        </div>
      )}
      {expired && <p className="mt-3 text-sm text-danger">{tr('dealerShareExpired')}</p>}
      {state === 'error' && <p className="mt-3 text-sm text-danger" role="alert">{tr('errorGeneric')}</p>}
      {(!share || expired) && (
        <button type="button" className="btn btn-primary mt-4 w-full" onClick={create} disabled={state === 'busy'} data-testid="share-button">
          {tr(expired ? 'dealerShareAgain' : 'dealerShareButton')}
        </button>
      )}
    </section>
  );
}
