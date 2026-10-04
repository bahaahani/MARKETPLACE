import { ok } from '@/lib/api';
import { customerInbox, customerNotifications } from '@/lib/notifications';
import { handleNotificationError, notificationStore } from '@/lib/notifications-store';
import { withCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** POST /api/v1/me/notifications/read-all: mark every current notification read; returns the inbox. */
export function POST(req: Request) {
  return withCustomer(
    req,
    (s) => {
      notificationStore.markRead(s.customerId, customerNotifications(s.profile).map((d) => d.id));
      return ok(customerInbox(s.profile));
    },
    handleNotificationError,
  );
}
