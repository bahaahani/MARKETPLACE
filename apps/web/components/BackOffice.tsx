'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatBhd, STAFF_ROLES, type StaffRole } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/backoffice-labels';

/** Back-office client actions. Every call goes to /api/v1/backoffice/*, which checks the staff role (staffSession). */

function useTr(locale: AppLocale) {
  return (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
}

async function post(url: string, body?: unknown, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { code: string } };
  if (!res.ok) throw new Error(json.error?.code ?? String(res.status));
  return json.data;
}

/** ⚠️ Sandbox sign-in: pick a role. Production: staff SSO. */
export function BackOfficeSignIn({ locale }: { locale: AppLocale }) {
  const tr = useTr(locale);
  const router = useRouter();
  const [busy, setBusy] = useState<StaffRole | null>(null);
  const [error, setError] = useState(false);

  async function signIn(role: StaffRole) {
    setBusy(role);
    setError(false);
    try {
      await post('/api/v1/backoffice/session', { role });
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {STAFF_ROLES.map((role) => (
          <li key={role}>
            <button
              type="button"
              className="card block h-full w-full p-4 text-start hover:border-brand disabled:opacity-60"
              disabled={busy !== null}
              onClick={() => signIn(role)}
              data-testid={`bo-role-${role}`}
            >
              <p className="font-semibold">{tr(ROLE_LABEL[role])}</p>
              <p className="mt-1 text-sm text-text-muted">{tr(ROLE_DESCRIPTION[role])}</p>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{tr('errorGeneric')}</p>}
    </div>
  );
}

export function BackOfficeSignOut({ locale }: { locale: AppLocale }) {
  const tr = useTr(locale);
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-md px-3 py-2 text-sm text-text-muted hover:text-text"
      data-testid="bo-sign-out"
      onClick={async () => {
        await post('/api/v1/backoffice/session', undefined, 'DELETE').catch(() => undefined);
        router.push(`/${locale}/backoffice`);
        router.refresh();
      }}
    >
      {tr('boSignOut')}
    </button>
  );
}

/** Approve or decline one referred application, with the mandatory internal note. */
export function CreditDecisionForm({ locale, applicationId }: { locale: AppLocale; applicationId: string }) {
  const tr = useTr(locale);
  const [note, setNote] = useState('');
  const [decided, setDecided] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ key: MessageKey; error: boolean } | null>(null);

  async function decide(outcome: 'APPROVED' | 'DECLINED') {
    if (note.trim().length < 5) {
      setMessage({ key: 'boNoteRequired', error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await post(`/api/v1/backoffice/applications/${applicationId}/decision`, { outcome, note });
      // The row stays (with this message) until the page is reloaded; the server list no longer has it.
      setMessage({ key: outcome === 'APPROVED' ? 'boDecidedApproved' : 'boDecidedDeclined', error: false });
      setDecided(true);
    } catch (e) {
      setMessage({ key: (e as Error).message === 'NOTE_REQUIRED' ? 'boNoteRequired' : 'errorGeneric', error: true });
    } finally {
      setBusy(false);
    }
  }

  if (decided && message) {
    return (
      <p className="text-sm text-islamic" role="status" data-testid="bo-decision-message">
        {tr(message.key)}
      </p>
    );
  }
  return (
    <div className="space-y-2" data-testid="bo-decision-form">
      <label className="block text-xs font-semibold text-text-muted" htmlFor={`note-${applicationId}`}>
        {tr('boNoteLabel')}
      </label>
      <textarea
        id={`note-${applicationId}`}
        className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm"
        rows={2}
        maxLength={1000}
        placeholder={tr('boNotePlaceholder')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        data-testid="bo-note"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary px-3 py-1 text-sm" disabled={busy} onClick={() => decide('APPROVED')} data-testid="bo-approve">
          {tr('boApprove')}
        </button>
        <button type="button" className="btn btn-ghost px-3 py-1 text-sm text-danger" disabled={busy} onClick={() => decide('DECLINED')} data-testid="bo-decline">
          {tr('boDecline')}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.error ? 'text-danger' : 'text-islamic'}`} role={message.error ? 'alert' : 'status'} data-testid="bo-decision-message">
          {tr(message.key)}
        </p>
      )}
    </div>
  );
}

/** Refund one captured premium that has no policy (idempotent on the server). */
export function RefundButton({ locale, paymentId, amountFils }: { locale: AppLocale; paymentId: string; amountFils: number }) {
  const tr = useTr(locale);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function refund() {
    setBusy(true);
    setError(false);
    try {
      await post(`/api/v1/backoffice/refunds/${paymentId}`, {});
      setDone(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-islamic" role="status" data-testid="bo-refunded">
        {tr('boRefunded', { amount: formatBhd(amountFils, locale) })}
      </p>
    );
  }
  return (
    <div>
      <button type="button" className="btn btn-primary px-3 py-1 text-sm" disabled={busy} onClick={refund} data-testid="bo-refund">
        {tr('boRefund')}
      </button>
      {error && <p className="text-sm text-danger" role="alert">{tr('errorGeneric')}</p>}
    </div>
  );
}
