'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClaimStatus, Garage } from '@sahel/domain';
import { t, type AppLocale } from '@sahel/i18n';

async function post(url: string, body: unknown): Promise<boolean> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.ok;
}

function useClaimAction() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const run = async (url: string, body: unknown) => {
    setState('busy');
    if (await post(url, body).catch(() => false)) {
      setState('idle');
      router.refresh();
    } else {
      setState('error');
    }
  };
  return { state, run };
}

/** Garage choice for an approved claim (POST /claims/{id}/garage). */
export function GaragePicker({ locale, claimId, garages, agencyRepair }: { locale: AppLocale; claimId: string; garages: Garage[]; agencyRepair: boolean }) {
  const { state, run } = useClaimAction();
  return (
    <div className="space-y-2">
      {agencyRepair && <p className="text-xs text-text-muted">{t(locale, 'claimGarageAgencyHint')}</p>}
      <ul className="divide-y divide-border">
        {garages.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-2 py-2" data-testid="garage-option" data-garage-id={g.id}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {g.name[locale]}
                {g.agency && <span className="ms-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">{t(locale, 'claimGarageAgency')}</span>}
              </p>
              <p className="text-xs text-text-muted">{g.area[locale]}</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost px-3 py-1 text-sm"
              disabled={state === 'busy'}
              onClick={() => run(`/api/v1/claims/${claimId}/garage`, { garageId: g.id })}
              data-testid={`book-${g.id}`}
            >
              {t(locale, 'claimGarageBook')}
            </button>
          </li>
        ))}
      </ul>
      {state === 'error' && <p className="text-sm text-danger" role="alert">{t(locale, 'errorGeneric')}</p>}
    </div>
  );
}

/** ⚠️ Sandbox only: stands in for the insurer's claims team (POST /claims/{id}/advance). */
export function SandboxAdvance({ locale, claimId, nextStatuses }: { locale: AppLocale; claimId: string; nextStatuses: ClaimStatus[] }) {
  const { state, run } = useClaimAction();
  const forward = nextStatuses.find((s) => s !== 'REJECTED');
  if (nextStatuses.length === 0) return null;
  return (
    <section className="rounded-[var(--radius-md)] border border-dashed border-accent p-4 text-sm" data-testid="sandbox-advance">
      <p className="mb-2 text-xs text-text-muted">⚠️ {t(locale, 'claimSandboxAdvanceNote')}</p>
      <div className="flex flex-wrap gap-2">
        {forward && (
          <button type="button" className="btn btn-ghost px-3 py-1" disabled={state === 'busy'} onClick={() => run(`/api/v1/claims/${claimId}/advance`, { to: forward })} data-testid="advance">
            {t(locale, 'claimSandboxAdvance')}
          </button>
        )}
        {nextStatuses.includes('REJECTED') && (
          <button type="button" className="btn btn-ghost px-3 py-1 text-danger" disabled={state === 'busy'} onClick={() => run(`/api/v1/claims/${claimId}/advance`, { to: 'REJECTED' })} data-testid="reject">
            {t(locale, 'claimSandboxReject')}
          </button>
        )}
      </div>
      {state === 'error' && <p className="mt-2 text-danger" role="alert">{t(locale, 'errorGeneric')}</p>}
    </section>
  );
}
