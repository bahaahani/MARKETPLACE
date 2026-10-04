import type { Lead, LeadStore } from './dealer';

/**
 * Adds a lead to the dealer leads store (e.g. the lead an accepted "Bid For Me" bid creates). Idempotent: a lead id
 * already in the store is kept as it is, so a repeated call never resets a lead the dealer has moved on.
 *
 * LeadStore has no add API of its own yet (its demo pipeline is seeded in the constructor). Rather than change that
 * shared class, this reaches its map through element access, which TypeScript allows for private members. When the
 * store gains `add()` (or moves to the CRM), only this function changes.
 * ⚠️ Sandbox: the store is in memory.
 */
export function appendLead(store: LeadStore, lead: Lead): Lead {
  const byId = store['byId'];
  const existing = byId.get(lead.id);
  if (existing) return existing;
  byId.set(lead.id, { ...lead, customerName: { ...lead.customerName } });
  return lead;
}
