import { cardIssuer, contractSettings, originations, payments } from './api';
import { assistant } from './assistant-store';
import { bidStore } from './bids-store';
import { claimStore } from './claims-store';
import { notificationStore } from './notifications-store';
import { policyStore } from './policy-store';
import { processRateLimits } from './rate-limit';
import { rewardsStore } from './rewards-store';
import { tradeInStore } from './tradein-store';

/**
 * ⚠️ SANDBOX data retention: when a customer session expires (or is dropped for the session cap), everything the
 * sandbox stores hold for that customer goes with it. Called by the SessionStore (lib/session.ts), so an expired
 * session leaves no payments, applications, claims, open "Bid For Me" requests (dealers stop seeing them), offers,
 * notification state, vouchers, policies, cards, autopay settings, assistant memory or rate-limit windows behind.
 *
 * Not purged: dealer leads (the dealer's own data, capped separately), the back-office audit log (append-only by
 * design) and pre-approval share tokens (they expire after 15 minutes). Production: retention rules in the database.
 */
export function purgeCustomerData(customerId: string): void {
  payments.purgeOwner(customerId);
  originations.purgeCustomer(customerId);
  bidStore.purgeCustomer(customerId);
  claimStore.purgeCustomer(customerId);
  tradeInStore.purgeCustomer(customerId);
  notificationStore.purgeCustomer(customerId);
  rewardsStore.purgeCustomer(customerId);
  policyStore.purgeCustomer(customerId);
  cardIssuer.purgeCustomer(customerId);
  contractSettings.purgeCustomer(customerId);
  assistant.purgeCustomer(customerId);
  processRateLimits().forget(customerId);
}
