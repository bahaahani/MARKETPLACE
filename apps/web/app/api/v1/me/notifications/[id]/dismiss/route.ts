import { ok } from '@/lib/api';
import { customerInbox, requireNotification } from '@/lib/notifications';
import { handleNotificationError, notificationStore } from '@/lib/notifications-store';
import { withCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/me/notifications/{id}/dismiss: remove one notification from the inbox (it stays dismissed when it is
 * derived again; a new period is a new id); returns the inbox. An id the session customer does not have is 404.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(
    req,
    async (s) => {
      const n = requireNotification(s.profile, (await ctx.params).id);
      notificationStore.dismiss(s.customerId, n.id);
      return ok(customerInbox(s.profile));
    },
    handleNotificationError,
  );
}
