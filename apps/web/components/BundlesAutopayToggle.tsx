'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type AppLocale } from '@sahel/i18n';

/** Autopay switch for one contract (PATCH /api/v1/me/contracts/{id}, sandbox in memory). */
export function AutopayToggle({ locale, contractId, autopay }: { locale: AppLocale; contractId: string; autopay: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(autopay);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  async function toggle() {
    const next = !on;
    setState('busy');
    try {
      const res = await fetch(`/api/v1/me/contracts/${encodeURIComponent(contractId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autopay: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { data } = (await res.json()) as { data: { autopay: boolean } };
      setOn(data.autopay);
      setState('idle');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${t(locale, 'settleAutopay')}: ${t(locale, on ? 'autopayOn' : 'autopayOff')}`}
        title={t(locale, 'settleAutopayHint')}
        onClick={toggle}
        disabled={state === 'busy'}
        data-testid={`autopay-${contractId}`}
        className={`flex items-center gap-2 rounded-full px-2 py-0.5 text-xs font-semibold ${on ? 'bg-islamic-soft text-islamic' : 'bg-background text-text-muted'}`}
      >
        <span aria-hidden className={`relative h-4 w-7 rounded-full transition ${on ? 'bg-islamic' : 'bg-border'}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'start-3.5' : 'start-0.5'}`} />
        </span>
        {t(locale, on ? 'autopayOn' : 'autopayOff')}
      </button>
      {state === 'error' && <span className="text-xs text-danger">{t(locale, 'errorGeneric')}</span>}
    </div>
  );
}
