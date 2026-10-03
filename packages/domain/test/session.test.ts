import { describe, expect, it } from 'vitest';
import { customerOverview, newCustomerProfile } from '../src';
// The in-memory session store lives with the API (apps/web/lib); it has no Next.js imports, so it is tested here.
import { isWellFormedSessionId, SessionStore } from '../../../apps/web/lib/session-store';

describe('SessionStore (sandbox customer sessions)', () => {
  it('creates opaque random ids, distinct from the customer id', () => {
    const store = new SessionStore();
    const a = store.create();
    const b = store.create();
    expect(isWellFormedSessionId(a.id)).toBe(true);
    expect(a.id).toHaveLength(32);
    expect(a.id).not.toBe(b.id);
    expect(a.profile.customerId).not.toBe(b.profile.customerId);
    expect(a.profile.customerId).not.toContain(a.id);
    expect(a.profile.customerId).toMatch(/^cus_sbx_/);
  });

  it('resolves a known id and never adopts an id chosen by the client', () => {
    const store = new SessionStore();
    const a = store.create();
    expect(store.resolve(a.id)).toEqual({ session: a, created: false });
    const forged = 'A'.repeat(32);
    const r = store.resolve(forged);
    expect(r.created).toBe(true);
    expect(r.session.id).not.toBe(forged);
    for (const bad of [undefined, null, '', 'new', 'short', '../../etc', 'x'.repeat(200)]) {
      expect(store.resolve(bad).created).toBe(true);
    }
  });

  it('keeps each session\'s profile separate', () => {
    const store = new SessionStore();
    const a = store.create();
    const b = store.create();
    store.update(a.id, (p) => ({ ...p, onboarding: { financials: { monthlySalaryFils: 2_000_000, existingObligationsFils: 0 }, result: {} as never, completedAt: '' } }));
    expect(store.get(a.id)?.profile.onboarding?.financials.monthlySalaryFils).toBe(2_000_000);
    expect(store.get(b.id)?.profile.onboarding).toBeUndefined();
    expect(customerOverview(store.get(b.id)!.profile).onboarded).toBe(false);
  });

  it('forgets idle sessions and caps how many it keeps', () => {
    let now = 0;
    const store = new SessionStore({ idleTtlMs: 1000, maxSessions: 3, clock: () => now });
    const a = store.create();
    now = 500;
    expect(store.get(a.id)).toBeDefined(); // refreshes the idle timer
    now = 1400;
    expect(store.get(a.id)).toBeDefined();
    now = 2500;
    expect(store.get(a.id)).toBeUndefined();
    for (let i = 0; i < 5; i++) store.create();
    expect(store.size).toBeLessThanOrEqual(3);
    expect(newCustomerProfile('x').onboarding).toBeUndefined();
  });
});
