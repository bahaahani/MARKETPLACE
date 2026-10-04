import { ok } from '@/lib/api';
import { customerInbox } from '@/lib/notifications';
import { handleNotificationError } from '@/lib/notifications-store';
import { withCustomer } from '@/lib/session';

// Per customer session and derived from the current time (Bahrain days), so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/notifications: the session customer's inbox, derived on every read from their contracts, policies,
 * claims, applications, cards, trade-in offer, pre-approval and My Garage (stable ids), minus dismissed ones, with
 * `unreadCount`. ⚠️ Sandbox: `delivery` says what WOULD be sent; nothing is.
 */
export function GET(req: Request) {
  return withCustomer(req, (s) => ok(customerInbox(s.profile)), handleNotificationError);
}
