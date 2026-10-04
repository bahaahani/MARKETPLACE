import { ok } from '@/lib/api';
import { customerInbox, peekProfile } from '@/lib/notifications';
import { handleNotificationError } from '@/lib/notifications-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/notifications/unread-count: the unread count of the request's existing session, for the web header
 * bell. Unlike the other /me routes it never STARTS a session (without one it answers for a fresh demo customer, like
 * server-rendered pages), so polling it on page load cannot race a request that is starting the browser's session.
 */
export function GET(req: Request) {
  try {
    const inbox = customerInbox(peekProfile(req));
    return ok({ unreadCount: inbox.unreadCount, total: inbox.total });
  } catch (e) {
    return handleNotificationError(e);
  }
}
