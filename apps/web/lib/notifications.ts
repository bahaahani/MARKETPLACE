import {
  deriveNotifications,
  isNotificationId,
  newCustomerProfile,
  NotificationError,
  notificationInbox,
  type CustomerProfile,
  type NotificationDraft,
  type NotificationInbox,
  type NotificationText,
} from '@sahel/domain';
import { t, type MessageKey } from '@sahel/i18n';
import { cardIssuer, originations } from './api';
import { claimStore } from './claims-store';
import { customerApplicationView } from './home-finance';
import { notificationStore } from './notifications-store';
import { policyStore } from './policy-store';
import { customerView, SESSION_COOKIE, SESSION_HEADER, sessions, settledProfile } from './session';
import { tradeInStore } from './tradein-store';

/** packages/i18n text for the notification messages (the same strings both apps use). */
const text: NotificationText = (locale, key, vars) => t(locale, key as MessageKey, vars);

/**
 * Every notification that applies to this customer now, derived from what the sandbox stores already hold for them
 * (read only: nothing here changes another module's state). `profile` is the session's (settled) profile.
 */
export function customerNotifications(profile: CustomerProfile, now: Date = new Date()): NotificationDraft[] {
  const id = profile.customerId;
  const me = customerView(profile);
  return deriveNotifications(
    {
      contracts: me.contracts,
      garage: me.garage,
      onboarding: profile.onboarding,
      preApproval: me.onboarded ? me.preApproval : undefined,
      applications: originations.list(id).map((a) => customerApplicationView(a)),
      policies: policyStore.list(id),
      claims: claimStore.list(id),
      cards: cardIssuer.list(id),
      tradeIn: tradeInStore.active(id),
    },
    now,
  );
}

/** GET /me/notifications body: the inbox with read state, text and the channels each would use (sandbox). */
export function customerInbox(profile: CustomerProfile, now: Date = new Date()): NotificationInbox {
  const id = profile.customerId;
  return notificationInbox(customerNotifications(profile, now), notificationStore.state(id), notificationStore.preferences(id), text, now);
}

/** Customer id for a request without a session: it owns nothing (same idea as pageCustomer in lib/session.ts). */
const ANONYMOUS_CUSTOMER_ID = 'cus_anonymous';

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * The profile of the request's EXISTING session (cookie or X-Sahel-Session header), or a fresh demo customer, without
 * ever starting a session. The web header's bell polls with this, so loading a page never races another request that
 * is about to start the browser's session.
 */
export function peekProfile(req: Request): CustomerProfile {
  const id = req.headers.get(SESSION_HEADER) ?? cookieValue(req.headers.get('cookie'), SESSION_COOKIE);
  return settledProfile(sessions.get(id)?.profile ?? newCustomerProfile(ANONYMOUS_CUSTOMER_ID));
}

/** The customer's current notification with this id (dismissed ones included), or NOTIFICATION_NOT_FOUND. */
export function requireNotification(profile: CustomerProfile, id: string): NotificationDraft {
  const found = isNotificationId(id) ? customerNotifications(profile).find((d) => d.id === id) : undefined;
  if (!found) throw new NotificationError('NOTIFICATION_NOT_FOUND', `no notification ${id}`);
  return found;
}
