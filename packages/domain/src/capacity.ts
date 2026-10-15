/**
 * Memory caps for the sandbox stores. Every store here lives in the web server's memory and grows with every
 * session, so each one has a global cap (the oldest entries go first: a Map keeps insertion order), most have a cap
 * per customer, and all of them can forget a customer (`purgeCustomer`) when that customer's session expires.
 *
 * ⚠️ Sandbox only: production persists to a database with retention rules, and the caps become quotas and rate limits.
 * Caps are generous (a demo user never reaches them) and are not product rules, only memory safety.
 */
export const STORE_CAPS = {
  /** Payments (and their idempotency keys) kept per customer / in total */
  paymentsPerCustomer: 500,
  paymentsTotal: 20_000,
  /** Finance applications (and their idempotency keys) per customer / in total */
  applicationsPerCustomer: 200,
  applicationsTotal: 10_000,
  /** "Bid For Me" requests (with their bids) in total; BID_MAX_REQUESTS_PER_CUSTOMER caps one customer */
  bidRequestsTotal: 5_000,
  /** Claims (and their idempotency keys) in total; CLAIM_MAX_PER_CUSTOMER caps one customer */
  claimsTotal: 10_000,
  /** Customers with a trade-in offer / notification state / rewards state */
  tradeInCustomers: 10_000,
  notificationCustomers: 10_000,
  rewardsCustomers: 10_000,
  /** Insurance: held quotes per customer / in total, policies in total */
  policyQuotesPerCustomer: 100,
  policyQuotesTotal: 20_000,
  policiesTotal: 20_000,
  /** Issued virtual cards in total */
  cardsTotal: 10_000,
  /** Autopay settings and early settlements in total */
  contractSettingsTotal: 20_000,
  /** Leads added by accepted bids (the demo pipeline is never evicted) */
  appendedLeads: 5_000,
  /** Live pre-approval share tokens */
  shareTokens: 5_000,
} as const;

/** Deletes the oldest entries of an insertion-ordered Map until at most `max` remain. Returns how many were removed. */
export function evictOldest<K, V>(map: Map<K, V>, max: number, onEvict?: (key: K, value: V) => void): number {
  let removed = 0;
  for (const [key, value] of map) {
    if (map.size <= max) break;
    map.delete(key);
    onEvict?.(key, value);
    removed++;
  }
  return removed;
}
