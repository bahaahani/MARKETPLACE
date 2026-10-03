'use client';

import { useState } from 'react';
import { LEAD_STATUSES, nextLeadStatuses, type Lead, type LeadSource, type LeadStatus } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';

export const LEAD_STATUS_LABEL: Record<LeadStatus, MessageKey> = {
  NEW: 'dealerStatusNew',
  CONTACTED: 'dealerStatusContacted',
  TEST_DRIVE: 'dealerStatusTestDrive',
  OFFER_SENT: 'dealerStatusOfferSent',
  WON: 'dealerStatusWon',
  LOST: 'dealerStatusLost',
};

const SOURCE_LABEL: Record<LeadSource, MessageKey> = {
  reserved: 'dealerSourceReserved',
  applied: 'dealerSourceApplied',
  viewed: 'dealerSourceViewed',
};

/**
 * Leads pipeline as a board: one column per status. Moves go through
 * PATCH /api/v1/dealer/{sellerId}/leads/{leadId}, which enforces the allowed transitions.
 */
export function DealerLeadsBoard({ locale, sellerId, initial }: { locale: AppLocale; sellerId: string; initial: Lead[] }) {
  const [leads, setLeads] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);

  async function move(lead: Lead, status: LeadStatus) {
    setBusy(lead.id);
    setError(false);
    try {
      const res = await fetch(`/api/v1/dealer/${sellerId}/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { data } = (await res.json()) as { data: Lead };
      setLeads((all) => all.map((l) => (l.id === data.id ? data : l)));
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && <p className="mb-2 text-sm text-danger" role="alert">{tr('errorGeneric')}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-testid="leads-board">
        {LEAD_STATUSES.map((status) => {
          const column = leads.filter((l) => l.status === status);
          return (
            <section key={status} className="rounded-[var(--radius-md)] bg-background p-2" aria-label={tr(LEAD_STATUS_LABEL[status])} data-testid={`leads-${status}`}>
              <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                {tr(LEAD_STATUS_LABEL[status])}
                <span className="rounded-full bg-surface px-2 text-xs text-text-muted">{column.length}</span>
              </h3>
              {column.length === 0 && <p className="px-1 pb-2 text-xs text-text-muted">{tr('dealerLeadsEmpty')}</p>}
              <ul className="space-y-2">
                {column.map((l) => (
                  <li key={l.id} className="card p-3 text-sm" data-testid="lead">
                    <p className="font-semibold">{l.customerName[locale]}</p>
                    <p className="text-xs text-text-muted">{l.vehicleTitle}</p>
                    <p className="mt-1 flex flex-wrap gap-1 text-xs">
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">{tr(SOURCE_LABEL[l.source])}</span>
                      {l.preApproved && <span className="rounded-full bg-islamic-soft px-2 py-0.5 text-islamic">{tr('dealerLeadPreApproved')}</span>}
                    </p>
                    {nextLeadStatuses(l.status).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {nextLeadStatuses(l.status).map((next) => (
                          <button
                            key={next}
                            type="button"
                            className={`btn px-2 py-1 text-xs ${next === 'LOST' ? 'btn-ghost text-danger' : 'btn-ghost'}`}
                            disabled={busy === l.id}
                            onClick={() => move(l, next)}
                            aria-label={tr('dealerMoveTo', { name: l.customerName[locale], status: tr(LEAD_STATUS_LABEL[next]) })}
                          >
                            <span aria-hidden className="inline-block rtl:-scale-x-100">→</span> {tr(LEAD_STATUS_LABEL[next])}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
