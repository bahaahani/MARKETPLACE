import { describe, expect, it } from 'vitest';
import {
  assertDealerAccess,
  bhd,
  buildShowroomOffer,
  canTransitionLead,
  DEALER_SELLERS,
  DealerError,
  dealerInventory,
  demoCustomer,
  demoLeads,
  LEAD_STATUSES,
  leadStats,
  LeadStore,
  nextLeadStatuses,
  normalizeToken,
  PREAPPROVAL_TOKEN_TTL_MS,
  PreApprovalTokenStore,
  quoteFinance,
  SandboxDealerAuth,
  VEHICLES,
  type SharedPreApproval,
} from '../src';

const NOW = new Date('2026-10-03T09:00:00Z');

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof DealerError) return e.code;
    throw e;
  }
  return undefined;
}

describe('dealer session (sandbox)', () => {
  const auth = new SandboxDealerAuth();
  it('offers NMC, TAC and the partner dealer', () => {
    expect(DEALER_SELLERS.map((s) => s.id)).toEqual(['nmc', 'tac', 'demo-dealer']);
  });
  it('starts a session for a known dealer and rejects unknown ones', () => {
    const s = auth.authenticate({ sellerId: 'tac' });
    expect(s.seller.id).toBe('tac');
    expect(s.sandbox).toBe(true);
    expect(code(() => auth.authenticate({ sellerId: 'tresco' }))).toBe('UNKNOWN_DEALER');
  });
  it('only lets a session access its own dealership', () => {
    const s = auth.authenticate({ sellerId: 'nmc' });
    expect(() => assertDealerAccess(s, 'nmc')).not.toThrow();
    expect(code(() => assertDealerAccess(s, 'tac'))).toBe('FORBIDDEN');
  });
});

describe('dealerInventory', () => {
  it("lists only the seller's vehicles with monthly prices and stats", () => {
    const inv = dealerInventory('nmc');
    const expected = VEHICLES.filter((v) => v.seller.id === 'nmc');
    expect(inv.items.map((v) => v.id).sort()).toEqual(expected.map((v) => v.id).sort());
    for (const v of inv.items) {
      expect(v.fromMonthlyFils).toBeGreaterThan(0);
      expect(v.fromMonthlyMurabahaFils).toBeGreaterThan(0);
      expect(Number.isInteger(v.fromMonthlyFils)).toBe(true);
    }
    expect(inv.stats.count).toBe(expected.length);
    expect(inv.stats.newCount + inv.stats.usedCount).toBe(expected.length);
    expect(inv.stats.avgPriceFils).toBe(Math.round(expected.reduce((s, v) => s + v.priceFils, 0) / expected.length));
  });
  it('counts new vs used', () => {
    const tac = dealerInventory('tac');
    expect(tac.stats.newCount).toBe(0);
    expect(tac.stats.usedCount).toBe(tac.items.length);
  });
  it('rejects an unknown dealer', () => {
    expect(code(() => dealerInventory('nope'))).toBe('UNKNOWN_DEALER');
  });
});

describe('lead pipeline', () => {
  it('allows only forward moves along NEW → CONTACTED → TEST_DRIVE → OFFER_SENT → WON/LOST', () => {
    expect(canTransitionLead('NEW', 'CONTACTED')).toBe(true);
    expect(canTransitionLead('CONTACTED', 'TEST_DRIVE')).toBe(true);
    expect(canTransitionLead('TEST_DRIVE', 'OFFER_SENT')).toBe(true);
    expect(canTransitionLead('OFFER_SENT', 'WON')).toBe(true);
    expect(canTransitionLead('NEW', 'WON')).toBe(false);
    expect(canTransitionLead('CONTACTED', 'NEW')).toBe(false);
    for (const s of LEAD_STATUSES) expect(canTransitionLead(s, s)).toBe(false);
    for (const s of LEAD_STATUSES.filter((x) => x !== 'WON' && x !== 'LOST')) expect(nextLeadStatuses(s)).toContain('LOST');
    expect(nextLeadStatuses('WON')).toEqual([]);
    expect(nextLeadStatuses('LOST')).toEqual([]);
  });

  it('seeds demo leads for every dealer, on their own stock', () => {
    const leads = demoLeads(NOW);
    for (const d of DEALER_SELLERS) {
      const mine = leads.filter((l) => l.sellerId === d.id);
      expect(mine.length).toBeGreaterThan(0);
      for (const l of mine) expect(VEHICLES.find((v) => v.id === l.vehicleId)?.seller.id).toBe(d.id);
    }
  });

  it('updates status through the store and enforces transitions', () => {
    const store = new LeadStore(demoLeads(NOW));
    const lead = store.list('nmc').find((l) => l.status === 'NEW')!;
    const later = new Date(NOW.getTime() + 60_000);
    const updated = store.updateStatus('nmc', lead.id, 'CONTACTED', later);
    expect(updated.status).toBe('CONTACTED');
    expect(updated.updatedAt).toBe(later.toISOString());
    expect(store.get('nmc', lead.id).status).toBe('CONTACTED');
    expect(code(() => store.updateStatus('nmc', lead.id, 'WON'))).toBe('INVALID_TRANSITION');
    expect(code(() => store.updateStatus('nmc', lead.id, 'NEW'))).toBe('INVALID_TRANSITION');
  });

  it("hides other dealers' leads", () => {
    const store = new LeadStore(demoLeads(NOW));
    const tacLead = store.list('tac')[0]!;
    expect(store.list('nmc').some((l) => l.id === tacLead.id)).toBe(false);
    expect(code(() => store.get('nmc', tacLead.id))).toBe('LEAD_NOT_FOUND');
    expect(code(() => store.updateStatus('nmc', tacLead.id, 'LOST'))).toBe('LEAD_NOT_FOUND');
  });

  it('summarizes the pipeline', () => {
    const s = leadStats(new LeadStore(demoLeads(NOW)).list('nmc'));
    expect(s.total).toBe(s.open + s.won + s.lost);
    expect(Object.values(s.byStatus).reduce((a, b) => a + b, 0)).toBe(s.total);
  });
});

describe('pre-approval share token', () => {
  const customer = demoCustomer(NOW);

  it('issues an opaque, random token that expires after 15 minutes', () => {
    const store = new PreApprovalTokenStore();
    const a = store.issue(customer, NOW);
    const b = store.issue(customer, NOW);
    expect(a.token).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.ttlSeconds).toBe(15 * 60);
    expect(Date.parse(a.expiresAt) - NOW.getTime()).toBe(PREAPPROVAL_TOKEN_TTL_MS);
    // Opaque: nothing about the customer is encoded in the token itself.
    expect(a.token).not.toContain(customer.customerId);
  });

  it('redeems to the minimal summary and nothing else', () => {
    const store = new PreApprovalTokenStore();
    const { token } = store.issue(customer, NOW);
    const s = store.redeem(token, new Date(NOW.getTime() + 60_000));
    const vehicle = customer.preApproval.limits.find((l) => l.productLine === 'vehicle')!;
    expect(s.firstName).toEqual({ en: 'Fatima', ar: 'فاطمة' });
    expect(s.vehicleLimitFils).toBe(vehicle.maxFinanceFils);
    expect(s.maxMonthlyFils).toBe(customer.preApproval.maxMonthlyFils);
    expect(s.validUntil).toBe(customer.preApproval.validUntil);
    // Data minimization: exactly these fields, and no salary, CPR, obligations, surname or contracts anywhere.
    expect(Object.keys(s).sort()).toEqual(['firstName', 'maxMonthlyFils', 'tokenExpiresAt', 'validUntil', 'vehicleLimitFils']);
    const json = JSON.stringify(s);
    for (const forbidden of ['Salary', 'salary', 'Obligation', 'cpr', 'CPR', 'Ahmed', 'أحمد', 'contracts', 'customerId', String(customer.monthlySalaryFils)]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('accepts the token typed in lower case or without the dash', () => {
    const store = new PreApprovalTokenStore();
    const { token } = store.issue(customer, NOW);
    expect(normalizeToken(' ab cd-12 ')).toBe('ABCD12');
    expect(store.redeem(token.replace('-', ' ').toLowerCase(), NOW).firstName.en).toBe('Fatima');
  });

  it('rejects expired and unknown tokens', () => {
    const store = new PreApprovalTokenStore();
    const { token } = store.issue(customer, NOW);
    const justBefore = new Date(NOW.getTime() + PREAPPROVAL_TOKEN_TTL_MS - 1);
    expect(store.redeem(token, justBefore).firstName.en).toBe('Fatima');
    expect(code(() => store.redeem(token, new Date(NOW.getTime() + PREAPPROVAL_TOKEN_TTL_MS)))).toBe('TOKEN_EXPIRED');
    // Once expired it is forgotten.
    expect(code(() => store.redeem(token, NOW))).toBe('TOKEN_NOT_FOUND');
    expect(code(() => store.redeem('ZZZZ-ZZZZ', NOW))).toBe('TOKEN_NOT_FOUND');
    expect(code(() => store.redeem('', NOW))).toBe('TOKEN_NOT_FOUND');
  });

  it('supports a custom TTL and retries on collision', () => {
    const seq = ['AAAA-AAAA', 'AAAA-AAAA', 'BBBB-BBBB'];
    const store = new PreApprovalTokenStore(60_000, () => seq.shift()!);
    expect(store.issue(customer, NOW).token).toBe('AAAA-AAAA');
    const second = store.issue(customer, NOW);
    expect(second.token).toBe('BBBB-BBBB');
    expect(second.ttlSeconds).toBe(60);
  });

  it('refuses to share when there is no vehicle headroom', () => {
    const broke = { ...customer, preApproval: { ...customer.preApproval, maxMonthlyFils: 0, limits: [] } };
    expect(code(() => new PreApprovalTokenStore().issue(broke, NOW))).toBe('NO_PREAPPROVAL');
  });
});

describe('showroom offer', () => {
  const shared: SharedPreApproval = {
    firstName: { en: 'Fatima', ar: 'فاطمة' },
    vehicleLimitFils: bhd(15_000),
    maxMonthlyFils: bhd(300),
    validUntil: '2026-11-02',
    tokenExpiresAt: '2026-10-03T09:15:00.000Z',
  };

  it('quotes every vehicle structure with quoteFinance and checks the shared limit', () => {
    const offer = buildShowroomOffer(shared, { sellerId: 'nmc', vehicleId: 'v-honda-crv-2026', downPaymentFils: bhd(3_000), tenureMonths: 60 }, NOW);
    expect(offer.quotes.map((q) => q.structure)).toEqual(['conventional', 'murabaha']);
    const murabaha = offer.quotes.find((q) => q.structure === 'murabaha')!;
    const direct = quoteFinance({ productLine: 'vehicle', structure: 'murabaha', assetPriceFils: bhd(14_900), downPaymentFils: bhd(3_000), tenureMonths: 60 });
    expect(murabaha.monthlyFils).toBe(direct.monthlyFils);
    expect(murabaha.withinLimit).toBe(true);
    expect(offer.withinLimit).toBe(true);
    expect(offer.customer).toEqual(shared);
  });

  it('flags an offer above the limit', () => {
    const offer = buildShowroomOffer(shared, { sellerId: 'nmc', vehicleId: 'v-cadillac-escalade-2026', downPaymentFils: bhd(4_650), tenureMonths: 60 }, NOW);
    expect(offer.withinLimit).toBe(false);
    for (const q of offer.quotes) {
      expect(q.withinFinanceLimit).toBe(false);
      expect(q.withinLimit).toBe(false);
    }
  });

  it('checks the monthly cap separately from the finance limit', () => {
    // Financed amount fits, but a short tenure pushes the monthly above the cap.
    const offer = buildShowroomOffer(shared, { sellerId: 'nmc', vehicleId: 'v-honda-crv-2026', downPaymentFils: bhd(3_000), tenureMonths: 12 }, NOW);
    for (const q of offer.quotes) {
      expect(q.withinFinanceLimit).toBe(true);
      expect(q.withinMonthlyLimit).toBe(false);
    }
    expect(offer.withinLimit).toBe(false);
  });

  it("only offers the dealer's own vehicles", () => {
    const input = { sellerId: 'nmc', downPaymentFils: bhd(2_000), tenureMonths: 48 };
    expect(code(() => buildShowroomOffer(shared, { ...input, vehicleId: 'v-honda-accord-2023' }))).toBe('VEHICLE_NOT_IN_INVENTORY');
    expect(code(() => buildShowroomOffer(shared, { ...input, vehicleId: 'nope' }))).toBe('VEHICLE_NOT_FOUND');
  });
});
