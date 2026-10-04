import { ok } from '@/lib/api';
import { customerInbox, requireNotification } from '@/lib/notifications';
import { handleNotificationError, notificationStore } from '@/lib/notifications-store';
import { withCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/me/notifications/{id}/read: mark one notification read (idempotent); returns the inbox. An id the
 * session customer does not currently have is 404.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(
    req,
    async (s) => {
      const n = requireNotification(s.profile, (await ctx.params).id);
      notificationStore.markRead(s.customerId, [n.id]);
      return ok(customerInbox(s.profile));
    },
    handleNotificationError,
  );
}
