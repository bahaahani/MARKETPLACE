'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, type AppLocale } from '@sahel/i18n';

/** Staff areas (dealer portal, back office) have no customer notifications. */
const STAFF_AREA = /^\/(en|ar)\/(dealer|backoffice|back-office|admin)(\/|$)/;

/** Fired by the inbox after read / dismiss, with the new unread count, so the badge updates without a reload. */
export const NOTIFICATIONS_EVENT = 'sahel:notifications';

export function announceUnread(unreadCount: number) {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT, { detail: { unreadCount } }));
}

/**
 * Bell with the unread count (GET /api/v1/me/notifications/unread-count, which never starts a session), refreshed on every
 * navigation. The badge is hidden from screen readers; the link's accessible name carries the count instead.
 */
export function NotificationBell({ locale }: { locale: AppLocale }) {
  const pathname = usePathname() ?? '';
  const [unread, setUnread] = useState(0);
  const staff = STAFF_AREA.test(pathname);

  useEffect(() => {
    if (staff) return;
    let live = true;
    fetch('/api/v1/me/notifications/unread-count', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: { unreadCount?: number } } | null) => {
        if (live && typeof j?.data?.unreadCount === 'number') setUnread(j.data.unreadCount);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname, staff]);

  useEffect(() => {
    const on = (e: Event) => setUnread((e as CustomEvent<{ unreadCount: number }>).detail.unreadCount);
    window.addEventListener(NOTIFICATIONS_EVENT, on);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, on);
  }, []);

  if (staff) return null;
  const label = unread > 0 ? t(locale, 'notifBellUnread', { count: unread }) : t(locale, 'notifBellLabel');
  return (
    <Link
      href={`/${locale}/notifications`}
      className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-text-muted hover:text-text"
      aria-label={label}
      title={label}
      data-testid="notif-bell"
    >
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden
          data-testid="notif-badge"
          className="absolute -top-1.5 -end-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-5 text-white"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
