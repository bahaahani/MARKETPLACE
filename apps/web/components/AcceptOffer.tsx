'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { t, type AppLocale } from '@sahel/i18n';

/**
 * Accept the offer and e-sign (sandbox) via POST /api/v1/applications/{id}/accept, then refresh the page.
 * ⚠️ Production: a real e-signature flow (eKey identity, signed contract PDF) replaces this button.
 */
export function AcceptOffer({ locale, applicationId }: { locale: AppLocale; applicationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [refreshing, startTransition] = useTransition();

  async function accept() {
    setState('busy');
    try {
      const res = await fetch(`/api/v1/applications/${applicationId}/accept`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setState('idle');
      startTransition(() => router.refresh());
    } catch {
      setState('error');
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-primary w-full" onClick={accept} disabled={state === 'busy' || refreshing} data-testid="accept-offer">
        {t(locale, 'acceptAndSign')}
      </button>
      {state === 'error' && <p className="mt-2 text-sm text-danger">{t(locale, 'errorGeneric')}</p>}
      <p className="mt-2 text-center text-xs text-text-muted">{t(locale, 'sandboxNotice')}</p>
    </div>
  );
}
