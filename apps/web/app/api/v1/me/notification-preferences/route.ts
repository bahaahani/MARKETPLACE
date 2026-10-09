import { notificationPreferencesView } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { handleNotificationError, notificationStore } from '@/lib/notifications-store';
import { withCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/notification-preferences: channels per category, mandatory categories and quiet hours (Bahrain time). */
export function GET(req: Request) {
  return withCustomer(req, (s) => ok(notificationPreferencesView(notificationStore.preferences(s.customerId))), handleNotificationError);
}

/**
 * PUT /api/v1/me/notification-preferences: change some switches and / or quiet hours (partial). Switching off every
 * channel of a mandatory category (overdue payments, ⚠️ CBB consumer-protection placeholder) is 422 MANDATORY_CATEGORY.
 */
export function PUT(req: Request) {
  return withCustomer(
    req,
    async (s) => ok(notificationPreferencesView(notificationStore.updatePreferences(s.customerId, await jsonBody(req, { maxBytes: 16 * 1024 })))),
    handleNotificationError,
  );
}
