import type { Lead, LeadStore } from './dealer';

/**
 * Adds a lead to the dealer leads store (e.g. the lead an accepted "Bid For Me" bid creates). Idempotent: a lead id
 * already in the store is kept as it is, so a repeated call never resets a lead the dealer has moved on.
 *
 * LeadStore.add() keeps the demo pipeline and evicts the oldest added leads beyond a cap (STORE_CAPS.appendedLeads).
 * ⚠️ Sandbox: the store is in memory.
 */
export function appendLead(store: LeadStore, lead: Lead): Lead {
  return store.add(lead);
}
