'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AppNotification, NotificationChannel, NotificationGroup, NotificationInbox } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { announceUnread } from './NotificationBell';

const GROUPS: { group: NotificationGroup; key: MessageKey }[] = [
  { group: 'today', key: 'notifGroupToday' },
  { group: 'week', key: 'notifGroupWeek' },
  { group: 'earlier', key: 'notifGroupEarlier' },
];

const CHANNEL_KEY: Record<NotificationChannel, MessageKey> = {
  push: 'notifChannelPush',
  sms: 'notifChannelSms',
  whatsapp: 'notifChannelWhatsapp',
  email: 'notifChannelEmail',
};

function bahrainTime(iso: string, locale: AppLocale, withDate: boolean): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', {
    timeZone: 'Asia/Bahrain',
    ...(withDate ? { day: 'numeric', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * The inbox (same API as the mobile app). Opening a notification marks it read, then goes to its deep link
 * (`/{locale}` + link). Read, dismiss and "mark all" update the header badge through announceUnread.
 */
export function NotificationsInbox({ locale, initial }: { locale: AppLocale; initial: NotificationInbox }) {
  const router = useRouter();
  const tr = (k: MessageKey, vars?: Record<string, string | number>) => t(locale, k, vars);
  const [inbox, setInbox] = useState(initial);
  const [error, setError] = useState(false);

  useEffect(() => announceUnread(inbox.unreadCount), [inbox.unreadCount]);

  async function post(path: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/v1/me/notifications/${path}`, { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      setInbox(((await res.json()) as { data: NotificationInbox }).data);
      setError(false);
      return true;
    } catch {
      setError(true);
      return false;
    }
  }

  async function open(n: AppNotification) {
    if (!n.read) await post(`${encodeURIComponent(n.id)}/read`);
    router.push(`/${locale}${n.link}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{tr('notifTitle')}</h1>
          <p className="text-sm text-text-muted" data-testid="notif-unread-count" aria-live="polite">
            {tr('notifUnreadCount', { count: inbox.unreadCount })}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={() => post('read-all')} disabled={inbox.unreadCount === 0} data-testid="notif-read-all">
            {tr('notifMarkAllRead')}
          </button>
          <Link className="btn btn-ghost text-sm" href={`/${locale}/notifications/preferences`} data-testid="notif-prefs-link">
            {tr('notifPrefsLink')}
          </Link>
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {tr('errorGeneric')}
        </p>
      )}
      {inbox.items.length === 0 && (
        <p className="card p-6 text-center text-text-muted" data-testid="notif-empty">
          {tr('notifEmpty')}
        </p>
      )}
      {GROUPS.map(({ group, key }) => {
        const items = inbox.items.filter((i) => i.group === group);
        if (!items.length) return null;
        return (
          <section key={group} aria-labelledby={`notif-${group}`} className="mb-6" data-testid={`notif-group-${group}`}>
            <h2 id={`notif-${group}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
              {tr(key)}
            </h2>
            <ul className="space-y-2">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`card p-4 ${n.read ? '' : 'border-s-4 border-s-brand'}`}
                  data-testid="notif-item"
                  data-id={n.id}
                  data-read={n.read}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        {!n.read && <span className="sr-only">{tr('notifUnread')}: </span>}
                        <button type="button" className="text-start font-semibold hover:underline" onClick={() => open(n)} data-testid="notif-open">
                          {n.title[locale]}
                        </button>
                        {n.priority === 'high' && (
                          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">{tr('notifImportant')}</span>
                        )}
                        {n.mandatory && <span className="rounded-full bg-background px-2 py-0.5 text-xs text-text-muted">{tr('notifRequired')}</span>}
                      </p>
                      <p className="mt-1 text-sm">{n.body[locale]}</p>
                      <p className="mt-2 text-xs text-text-muted">
                        <time dateTime={n.occurredAt}>{bahrainTime(n.occurredAt, locale, group !== 'today')}</time>
                      </p>
                      <p className="mt-1 text-xs text-text-muted" data-testid="notif-delivery">
                        ⚠️{' '}
                        {n.delivery.channels.length
                          ? tr('notifWouldSend', { channels: n.delivery.channels.map((c) => tr(CHANNEL_KEY[c])).join(', ') })
                          : tr('notifInAppOnly')}
                        {n.delivery.deferredUntil && <> {tr('notifDeferred', { time: bahrainTime(n.delivery.deferredUntil, locale, false) })}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button type="button" className="btn btn-primary px-3 py-1 text-xs" onClick={() => open(n)} aria-label={`${tr('notifOpen')}: ${n.title[locale]}`}>
                        {tr('notifOpen')}
                      </button>
                      {!n.read && (
                        <button
                          type="button"
                          className="text-xs text-text-muted underline hover:text-text"
                          onClick={() => post(`${encodeURIComponent(n.id)}/read`)}
                          aria-label={`${tr('notifMarkRead')}: ${n.title[locale]}`}
                          data-testid="notif-mark-read"
                        >
                          {tr('notifMarkRead')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-xs text-text-muted underline hover:text-text"
                        onClick={() => post(`${encodeURIComponent(n.id)}/dismiss`)}
                        aria-label={`${tr('notifDismiss')}: ${n.title[locale]}`}
                        data-testid="notif-dismiss"
                      >
                        {tr('notifDismiss')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="mt-4 text-xs text-text-muted">⚠️ {tr('notifSandboxNote')}</p>
    </div>
  );
}
