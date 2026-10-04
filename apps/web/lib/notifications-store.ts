import { NOTIFICATION_ERROR_STATUS, NotificationError, SandboxNotificationStore } from '@sahel/domain';
import { handleError, problem } from '@/lib/api';

const g = globalThis as unknown as { __sahelNotifications?: SandboxNotificationStore };

/**
 * ⚠️ Sandbox notification state per session customer (in memory, lost on restart): which notifications were read or
 * dismissed, and the channel / quiet-hours preferences. The notifications themselves are never stored: they are
 * derived from the customer's data on every read (see lib/notifications.ts and packages/domain/src/notifications.ts).
 */
export const notificationStore = (g.__sahelNotifications ??= new SandboxNotificationStore());

/** handleError plus NotificationError (matched by name too: the store may come from another route's bundle). */
export function handleNotificationError(e: unknown) {
  if (e instanceof NotificationError || (e instanceof Error && e.name === 'NotificationError')) {
    const code = (e as NotificationError).code;
    return problem(NOTIFICATION_ERROR_STATUS[code] ?? 422, code, e.message);
  }
  return handleError(e);
}
