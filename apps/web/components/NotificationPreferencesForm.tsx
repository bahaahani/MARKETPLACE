'use client';

import { useState } from 'react';
import type { NotificationCategory, NotificationChannel, NotificationPreferencesView } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';

const CATEGORY_KEY: Record<NotificationCategory, MessageKey> = {
  payments: 'notifPrefsCategoryPayments',
  overdue: 'notifPrefsCategoryOverdue',
  insurance: 'notifPrefsCategoryInsurance',
  claims: 'notifPrefsCategoryClaims',
  applications: 'notifPrefsCategoryApplications',
  cards: 'notifPrefsCategoryCards',
  vehicle: 'notifPrefsCategoryVehicle',
  account: 'notifPrefsCategoryAccount',
};

const CHANNEL_KEY: Record<NotificationChannel, MessageKey> = {
  push: 'notifChannelPush',
  sms: 'notifChannelSms',
  whatsapp: 'notifChannelWhatsapp',
  email: 'notifChannelEmail',
};

/**
 * Channel switches per category and quiet hours (PUT /api/v1/me/notification-preferences, same API as the app).
 * The API enforces the rules (mandatory categories keep a channel); this form only shows its answer.
 */
export function NotificationPreferencesForm({ locale, initial }: { locale: AppLocale; initial: NotificationPreferencesView }) {
  const tr = (k: MessageKey) => t(locale, k);
  const [prefs, setPrefs] = useState(initial);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'mandatory' | 'error'>('idle');

  function toggle(category: NotificationCategory, channel: NotificationChannel) {
    setState('idle');
    setPrefs((p) => ({
      ...p,
      categories: p.categories.map((c) => (c.category === category ? { ...c, channels: { ...c.channels, [channel]: !c.channels[channel] } } : c)),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      const res = await fetch('/api/v1/me/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: prefs.categories.map(({ category, channels }) => ({ category, channels })), quietHours: prefs.quietHours }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: { code?: string } }).error?.code;
        setState(code === 'MANDATORY_CATEGORY' ? 'mandatory' : 'error');
        return;
      }
      setPrefs(((await res.json()) as { data: NotificationPreferencesView }).data);
      setState('saved');
    } catch {
      setState('error');
    }
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{tr('notifPrefsTitle')}</h1>
        <p className="mt-1 text-sm text-text-muted">{tr('notifPrefsIntro')}</p>
      </div>
      <div className="card overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th scope="col" className="pb-2 text-start font-semibold" />
              {prefs.channels.map((ch) => (
                <th key={ch} scope="col" className="px-2 pb-2 text-center font-semibold">
                  {tr(CHANNEL_KEY[ch])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prefs.categories.map((c) => (
              <tr key={c.category} className="border-t border-border" data-testid={`notif-pref-${c.category}`}>
                <th scope="row" className="py-2 text-start font-medium">
                  {tr(CATEGORY_KEY[c.category])}
                  {c.mandatory && <span className="block text-xs font-normal text-text-muted">⚠️ {tr('notifPrefsMandatory')}</span>}
                </th>
                {prefs.channels.map((ch) => (
                  <td key={ch} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand"
                      checked={c.channels[ch]}
                      onChange={() => toggle(c.category, ch)}
                      aria-label={`${tr(CATEGORY_KEY[c.category])}: ${tr(CHANNEL_KEY[ch])}`}
                      data-testid={`notif-pref-${c.category}-${ch}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <fieldset className="card space-y-3 p-4">
        <legend className="px-1 font-semibold">{tr('notifPrefsQuietHours')}</legend>
        <p className="text-sm text-text-muted">{tr('notifPrefsQuietHoursHint')}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={prefs.quietHours.enabled}
            onChange={(e) => setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, enabled: e.target.checked } }))}
            data-testid="notif-quiet-enabled"
          />
          {tr('notifPrefsQuietEnabled')}
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['start', 'end'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              {tr(k === 'start' ? 'notifPrefsQuietFrom' : 'notifPrefsQuietTo')}
              <input
                type="time"
                className="rounded-md border border-border bg-surface px-2 py-1"
                value={prefs.quietHours[k]}
                disabled={!prefs.quietHours.enabled}
                onChange={(e) => setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, [k]: e.target.value } }))}
                data-testid={`notif-quiet-${k}`}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={state === 'busy'} data-testid="notif-prefs-save">
          {tr('notifPrefsSave')}
        </button>
        <span role="status" className="text-sm" data-testid="notif-prefs-status">
          {state === 'saved' && <span className="text-islamic">✓ {tr('notifPrefsSaved')}</span>}
          {state === 'mandatory' && <span className="text-danger">{tr('notifPrefsErrorMandatory')}</span>}
          {state === 'error' && <span className="text-danger">{tr('errorGeneric')}</span>}
        </span>
      </div>
      <p className="text-xs text-text-muted">⚠️ {tr('notifPrefsSandboxNote')}</p>
    </form>
  );
}
