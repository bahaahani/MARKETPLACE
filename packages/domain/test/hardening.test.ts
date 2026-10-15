import { describe, expect, it } from 'vitest';
import {
  appendLead,
  ASSISTANT_RATE_LIMIT,
  AssistantService,
  bhd,
  BID_REQUEST_VALIDITY_HOURS,
  bidCustomerFrom,
  claimView,
  customerCardOffers,
  customerOverview,
  customerFinancials,
  demoLeads,
  demoPolicyHistory,
  evictOldest,
  LeadStore,
  maskPlate,
  newCustomerProfile,
  normalizePlate,
  PLATE_MAX_VISIBLE,
  PLATE_MAX_VISIBLE_SHARE,
  PreApprovalTokenStore,
  randomReference,
  redactFreeText,
  redactPii,
  REWARDS_CATALOGUE,
  runAssistantTool,
  SandboxBidStore,
  SandboxCardIssuer,
  SandboxClaimStore,
  SandboxContractSettings,
  SandboxNotificationStore,
  SandboxOriginationService,
  SandboxPaymentGateway,
  SandboxPolicyStore,
  SandboxRewardsStore,
  SandboxTradeInStore,
  STORE_CAPS,
  validateClaim,
  type ApplicationRequest,
  type AssistantContext,
  type ClaimInput,
  type Lead,
  type PaymentRequest,
  type Policy,
  type RewardsState,
  type TradeInRequest,
} from '../src';

const NOW = new Date(Date.UTC(2026, 10, 3, 10, 0));

// ---- plate masking ---------------------------------------------------------------------------------------------

describe('maskPlate (never more than the last 2 characters, never more than 40% of them)', () => {
  it.each([
    ['', ''],
    ['7', '*'],
    ['12', '**'],
    ['123', '**3'],
    ['1234', '***4'],
    ['12345', '***45'],
    ['123456', '****56'],
  ])('%s → %s', (plate, masked) => {
    expect(maskPlate(plate)).toBe(masked);
  });

  it('holds the rule for every length', () => {
    for (let n = 1; n <= 12; n++) {
      const plate = '9'.repeat(n);
      const shown = maskPlate(plate).replace(/\*/g, '').length;
      expect(maskPlate(plate)).toHaveLength(n);
      expect(shown).toBeLessThanOrEqual(PLATE_MAX_VISIBLE);
      expect(shown).toBeLessThanOrEqual(Math.floor(n * PLATE_MAX_VISIBLE_SHARE));
    }
  });

  it('is what trade-in uses for the valuation and for My Garage', () => {
    const store = new SandboxTradeInStore(() => NOW);
    const camry: TradeInRequest = { make: 'Toyota', model: 'Camry', year: 2021, mileageKm: 60_000, condition: 'good', accidentHistory: false };
    for (const plate of ['1', '12', '123', '1234', '12345', '123456']) {
      const offer = store.value('cus_a', { ...camry, plate });
      expect(offer.valuation.vehicle.plateMasked).toBe(maskPlate(normalizePlate(plate)!));
    }
  });

  it('keeps plates out of the assistant: no tool result or reply carries one', async () => {
    const profile = newCustomerProfile('cus_plate');
    const garagePlate = profile.garage?.[0]?.plate ?? customerOverview(profile, NOW).garage[0]!.plate;
    const ctx: AssistantContext = {
      customer: customerOverview(profile, NOW),
      policies: [{ ...demoPolicyHistory(profile.customerId), status: 'EXPIRED' } as Policy],
      cards: [],
      cardOffers: customerCardOffers(profile, NOW),
      now: NOW,
    };
    const service = new AssistantService({ clock: () => NOW });
    for (const text of ['when does my insurance expire', 'my car', 'registration', 'plate number', 'policies']) {
      const reply = await service.handle('cus_plate', { text, locale: 'en' }, ctx);
      expect(JSON.stringify(reply)).not.toContain(garagePlate);
    }
    expect(JSON.stringify(runAssistantTool(ctx, 'list_policies'))).not.toContain(garagePlate);
  });
});

// ---- redaction -------------------------------------------------------------------------------------------------

describe('redactFreeText (CPR and phone numbers typed into free text)', () => {
  it.each([
    ['my CPR is 880412345 ok', 'my CPR is [•••] ok'],
    ['CPR 880-412-345', 'CPR [•••]'],
    ['CPR 880 412 345.', 'CPR [•••].'],
    ['CPR 880412345/', 'CPR [•••]/'],
    ['cpr ٨٨٠٤١٢٣٤٥', 'cpr [•••]'],
    ['call 36001234 now', 'call [•••] now'],
    ['call 3600 1234 now', 'call [•••] now'],
    ['call 3600-1234', 'call [•••]'],
    ['call +973 3600 1234', 'call +[•••]'],
    ['call 0097336001234', 'call [•••]'],
    ['mail me a.b@example.com', 'mail me [•••]'],
  ])('%s', (input, expected) => {
    expect(redactFreeText(input)).toBe(expected);
  });

  it('leaves dates, amounts, plates, times and police report numbers alone', () => {
    for (const text of [
      'Hit on 2026-10-03 at 08:30 on road 1503',
      'Damage about BHD 1,200.000 or 450 fils',
      'Plate 123456 and policy SBX-MTR-26-000001',
      'Police report TR/2026-0042',
      'The car was 2 years old and had 54000 km',
    ]) {
      expect(redactFreeText(text)).toBe(text);
    }
  });

  it('is a superset of the assistant redaction', () => {
    expect(redactPii('36001234')).toBe('36001234'); // the assistant keeps short references readable
    expect(redactFreeText('36001234')).toBe('[•••]');
    expect(redactFreeText('880412345')).toBe(redactPii('880412345'));
  });
});

describe('claims redact free text on the way in', () => {
  const policy: Policy = {
    id: 'pol_motor_1',
    policyNumber: 'SBX-MTR-26-000001',
    customerId: 'cus_a',
    line: 'motor',
    insurerId: 'pearl-takaful',
    insurerName: { en: 'Pearl Takaful (demo)', ar: 'بيرل للتكافل (تجريبي)' },
    takaful: true,
    premiumFils: bhd(300),
    cover: { line: 'motor', cover: 'comprehensive', vehicleValueFils: bhd(14_900), agencyRepair: false, reference: '123456' },
    startDate: '2026-10-01',
    endDate: '2027-09-30',
    status: 'ACTIVE',
    quoteId: 'pq_1',
    paymentId: 'pay_1',
    issuedAt: '2026-09-30T21:00:00.000Z',
  };
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const input = (over: Partial<ClaimInput> = {}): ClaimInput => ({
    policyId: policy.id,
    incidentAt: '2026-11-03T08:30',
    location: 'Highway, near Isa Town, call me on 3600 1234',
    type: 'collision',
    severity: 'moderate',
    description: 'Rear-ended. The other driver gave CPR 880412345 and phone +973 3600 1234; my CPR 880-412-345 too.',
    thirdPartyInvolved: true,
    photos: [{ mimeType: 'image/jpeg', dataBase64: JPEG.toString('base64') }],
    ...over,
  });

  it('stores and returns only the redacted description, location and police report', () => {
    const c = validateClaim(input({ policeReportNumber: 'TR/880412345' }), [policy], NOW);
    const all = JSON.stringify(c);
    for (const secret of ['880412345', '880-412-345', '3600 1234', '36001234']) expect(all).not.toContain(secret);
    expect(c.description).toContain('[•••]');
    expect(c.location).toContain('Isa Town');
    expect(c.location).toContain('[•••]');
    expect(c.policeReportNumber).toBe('TR/[•••]');
  });

  it('the store keeps the masked form, in the list and in the view too', () => {
    const store = new SandboxClaimStore(() => [policy], () => NOW);
    const claim = store.file('cus_a', input());
    expect(JSON.stringify(store.get(claim.id, 'cus_a'))).not.toContain('880412345');
    expect(JSON.stringify(claimView(claim))).not.toContain('880412345');
    expect(JSON.stringify(store.list('cus_a'))).not.toContain('3600 1234');
  });

  it('still validates the length and shape of what the customer typed, not of the redacted text', () => {
    const c = validateClaim(input({ description: 'CPR 880412345, again 880412345' }), [policy], NOW);
    expect(c.description).toBe('CPR [•••], again [•••]');
  });
});

// ---- random ids ------------------------------------------------------------------------------------------------

describe('ids do not reveal volume across customers', () => {
  it('randomReference is random, of the asked length, from unambiguous characters', () => {
    const refs = Array.from({ length: 200 }, () => randomReference(8));
    expect(new Set(refs).size).toBe(200);
    for (const r of refs) expect(r).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });

  it('hand-off references and reply ids are not counters', async () => {
    const profile = newCustomerProfile('cus_ho');
    const ctx: AssistantContext = { customer: customerOverview(profile, NOW), policies: [], cards: [], cardOffers: [], now: NOW };
    const refs = Array.from({ length: 30 }, () => (runAssistantTool(ctx, 'request_human_handoff') as { reference: string }).reference);
    expect(new Set(refs).size).toBe(30);
    for (const r of refs) expect(r).toMatch(/^HO-SBX-[0-9A-Z]{5}$/);
    // a counter would be monotonic in base 36: 30 random ones are not
    const asNumbers = refs.map((r) => parseInt(r.slice(7), 36));
    expect(asNumbers.every((n, i) => i === 0 || n > asNumbers[i - 1]!)).toBe(false);

    const service = new AssistantService({ clock: () => NOW, limiter: undefined });
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) ids.add((await service.handle(`k${i}`, { text: 'hello', locale: 'en' }, ctx)).id);
    expect(ids.size).toBe(5);
    for (const id of ids) expect(id).toMatch(/^msg_[0-9a-z]{12}$/);
  });
});

// ---- store caps and purge --------------------------------------------------------------------------------------

describe('evictOldest', () => {
  it('removes the oldest entries beyond the cap and reports them', () => {
    const m = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
    const seen: string[] = [];
    expect(evictOldest(m, 2, (k) => seen.push(k))).toBe(2);
    expect([...m.keys()]).toEqual(['c', 'd']);
    expect(seen).toEqual(['a', 'b']);
    expect(evictOldest(m, 5)).toBe(0);
  });

  it('has caps above anything a demo session reaches', () => {
    for (const v of Object.values(STORE_CAPS)) expect(v).toBeGreaterThanOrEqual(100);
  });
});

const payReq = (n: number): PaymentRequest => ({
  amountFils: bhd(100),
  method: 'benefitpay',
  purpose: 'reservation_deposit',
  reference: 'v-honda-city-2026',
  idempotencyKey: `key-${n}-xxxxxxxx`,
});

describe('payments: caps, idempotency keys and purge', () => {
  it('keeps at most N payments per owner, oldest first, and forgets their idempotency keys', async () => {
    const gw = new SandboxPaymentGateway({ perOwner: 3, total: 100 });
    const first = await gw.createCharge(payReq(1), 'cus_a');
    for (let i = 2; i <= 4; i++) await gw.createCharge(payReq(i), 'cus_a');
    expect(gw.list('cus_a')).toHaveLength(3);
    expect(gw.get(first.id, 'cus_a')).toBeUndefined();
    // the evicted key is free again: the same key makes a NEW payment, not a replay of a ghost
    const again = await gw.createCharge(payReq(1), 'cus_a');
    expect(again.id).not.toBe(first.id);
    expect(gw.size).toBe(3);
  });

  it('caps the total across owners, evicting the oldest', async () => {
    const gw = new SandboxPaymentGateway({ perOwner: 100, total: 5 });
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push((await gw.createCharge(payReq(i), `cus_${i}`)).id);
    expect(gw.size).toBe(5);
    expect(gw.get(ids[0]!, 'cus_0')).toBeUndefined();
    expect(gw.get(ids[7]!, 'cus_7')).toBeDefined();
    expect(gw.listAll()).toHaveLength(5);
  });

  it('purgeOwner removes everything of one owner and nothing of another', async () => {
    const gw = new SandboxPaymentGateway();
    await gw.createCharge(payReq(1), 'cus_a');
    const b = await gw.createCharge(payReq(2), 'cus_b');
    gw.purgeOwner('cus_a');
    expect(gw.list('cus_a')).toEqual([]);
    expect(gw.get(b.id, 'cus_b')).toBeDefined();
    expect(gw.size).toBe(1);
    // the key of the purged owner is free
    expect((await gw.createCharge(payReq(1), 'cus_a')).status).toBe('INITIATED');
  });
});

const crv: ApplicationRequest = {
  productLine: 'vehicle',
  structure: 'murabaha',
  assetPriceFils: bhd(14_900),
  downPaymentFils: bhd(2_980),
  tenureMonths: 60,
  reference: 'v-honda-crv-2026',
  idempotencyKey: 'key-crv-0001',
};
const applicant = { monthlySalaryFils: bhd(1_400), existingObligationsFils: 326_753 };

describe('applications: caps, idempotency keys and purge', () => {
  it('evicts the oldest per customer and in total, with their idempotency keys', () => {
    const svc = new SandboxOriginationService(() => NOW, { perCustomer: 2, total: 4 });
    const first = svc.apply({ ...crv, idempotencyKey: 'key-0000001' }, applicant, 'cus_a');
    svc.apply({ ...crv, idempotencyKey: 'key-0000002' }, applicant, 'cus_a');
    svc.apply({ ...crv, idempotencyKey: 'key-0000003' }, applicant, 'cus_a');
    expect(svc.list('cus_a')).toHaveLength(2);
    expect(svc.get(first.id, 'cus_a')).toBeUndefined();
    expect(svc.findByKey('cus_a', 'key-0000001')).toBeUndefined();
    for (let i = 0; i < 4; i++) svc.apply({ ...crv, idempotencyKey: `key-b-${i}-xxxxx` }, applicant, `cus_b${i}`);
    expect(svc.size).toBe(4);
    expect(svc.list('cus_a')).toHaveLength(0); // the oldest overall went first
  });

  it('purgeCustomer forgets applications and keys', () => {
    const svc = new SandboxOriginationService(() => NOW);
    const a = svc.apply(crv, applicant, 'cus_a');
    const b = svc.apply(crv, applicant, 'cus_b');
    svc.purgeCustomer('cus_a');
    expect(svc.get(a.id)).toBeUndefined();
    expect(svc.findByKey('cus_a', crv.idempotencyKey)).toBeUndefined();
    expect(svc.get(b.id, 'cus_b')).toBeDefined();
  });
});

describe('"Bid For Me": caps, purge, and dealers stop seeing a gone customer', () => {
  const SUV = { bodyType: 'suv', condition: 'any', maxMonthlyFils: bhd(300), structure: 'murabaha', tenureMonths: 60, downPaymentFils: bhd(3_000), insurance: 'takaful' };
  const cust = (id: string) => bidCustomerFrom(customerOverview(newCustomerProfile(id), NOW));

  it('purgeCustomer removes the open request from the dealers view at once', () => {
    const store = new SandboxBidStore({ clock: () => NOW });
    const r = store.post(cust('cus_a'), SUV);
    store.post(cust('cus_b'), SUV);
    expect(store.openForDealer('nmc').map((x) => x.id)).toContain(r.id);
    store.purgeCustomer('cus_a');
    expect(store.openForDealer('nmc').map((x) => x.id)).not.toContain(r.id);
    expect(store.get(r.id, 'cus_a')).toBeUndefined();
    expect(store.size).toBe(1);
  });

  it('a request still expires at its own validity, whichever comes first', () => {
    let now = NOW;
    const store = new SandboxBidStore({ clock: () => now });
    const r = store.post(cust('cus_a'), SUV);
    now = new Date(now.getTime() + (BID_REQUEST_VALIDITY_HOURS + 1) * 3600 * 1000);
    expect(store.openForDealer('nmc').map((x) => x.id)).not.toContain(r.id);
    expect(store.get(r.id, 'cus_a')?.status).toBe('EXPIRED');
  });

  it('keeps at most maxRequests, evicting the oldest', () => {
    const store = new SandboxBidStore({ clock: () => NOW, maxRequests: 3 });
    const ids = ['a', 'b', 'c', 'd', 'e'].map((x) => store.post(cust(`cus_${x}`), SUV).id);
    expect(store.size).toBe(3);
    expect(store.get(ids[0]!, 'cus_a')).toBeUndefined();
    expect(store.get(ids[4]!, 'cus_e')).toBeDefined();
  });
});

describe('claims: caps, idempotency keys and purge', () => {
  const policyOf = (customerId: string): Policy => ({
    id: `pol_${customerId}`,
    policyNumber: 'SBX-MTR-26-000001',
    customerId,
    line: 'motor',
    insurerId: 'pearl-takaful',
    insurerName: { en: 'Pearl Takaful (demo)', ar: 'بيرل للتكافل (تجريبي)' },
    takaful: true,
    premiumFils: bhd(300),
    cover: { line: 'motor', cover: 'comprehensive', vehicleValueFils: bhd(14_900), agencyRepair: false, reference: '123456' },
    startDate: '2026-10-01',
    endDate: '2027-09-30',
    status: 'ACTIVE',
    quoteId: 'pq_1',
    paymentId: 'pay_1',
    issuedAt: '2026-09-30T21:00:00.000Z',
  });
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const claimOf = (customerId: string): ClaimInput => ({
    policyId: `pol_${customerId}`,
    incidentAt: '2026-11-03T08:30',
    location: 'Sheikh Khalifa Highway',
    type: 'collision',
    severity: 'moderate',
    description: 'Rear-ended at a traffic light.',
    thirdPartyInvolved: true,
    photos: [{ mimeType: 'image/jpeg', dataBase64: JPEG.toString('base64') }],
  });

  it('evicts the oldest claim in total, with its idempotency key', () => {
    const store = new SandboxClaimStore((c) => [policyOf(c)], () => NOW, 2);
    const a = store.file('cus_a', claimOf('cus_a'), 'key-a-00001');
    store.file('cus_b', claimOf('cus_b'), 'key-b-00001');
    store.file('cus_c', claimOf('cus_c'), 'key-c-00001');
    expect(store.size).toBe(2);
    expect(store.get(a.id, 'cus_a')).toBeUndefined();
    // the evicted key files a new claim instead of returning a ghost
    const again = store.file('cus_a', claimOf('cus_a'), 'key-a-00001');
    expect(again.id).not.toBe(a.id);
  });

  it('purgeCustomer forgets claims and keys of one customer only', () => {
    const store = new SandboxClaimStore((c) => [policyOf(c)], () => NOW);
    store.file('cus_a', claimOf('cus_a'), 'key-a-00001');
    const b = store.file('cus_b', claimOf('cus_b'), 'key-b-00001');
    store.purgeCustomer('cus_a');
    expect(store.list('cus_a')).toEqual([]);
    expect(store.file('cus_b', claimOf('cus_b'), 'key-b-00001')).toBe(b);
  });
});

describe('trade-in offers, notification state, rewards: global caps and purge', () => {
  it('trade-in: keeps the newest customers, purges one', () => {
    const store = new SandboxTradeInStore(() => NOW, 2);
    const camry: TradeInRequest = { make: 'Toyota', model: 'Camry', year: 2021, mileageKm: 60_000, condition: 'good', accidentHistory: false };
    for (const c of ['cus_a', 'cus_b', 'cus_c']) store.value(c, camry);
    expect(store.size).toBe(2);
    expect(store.active('cus_a')).toBeUndefined();
    expect(store.active('cus_c')).toBeDefined();
    store.purgeCustomer('cus_c');
    expect(store.active('cus_c')).toBeUndefined();
    expect(store.size).toBe(1);
  });

  it('notifications: caps customers (read, dismissed, preferences) and purges', () => {
    const store = new SandboxNotificationStore(2);
    for (const c of ['cus_a', 'cus_b', 'cus_c']) {
      store.markRead(c, ['x.1']);
      store.dismiss(c, 'x.2');
      store.updatePreferences(c, { quietHours: { enabled: false } });
    }
    expect(store.size).toBe(2);
    expect(store.state('cus_a').isRead('x.1')).toBe(false);
    expect(store.state('cus_c').isRead('x.1')).toBe(true);
    expect(store.state('cus_c').isDismissed('x.2')).toBe(true);
    store.purgeCustomer('cus_c');
    expect(store.state('cus_c').isRead('x.1')).toBe(false);
    expect(store.size).toBe(1);
  });

  it('rewards: caps customers, drops redemptions, keys and codes with them, purges', () => {
    const state: RewardsState = { openingPoints: 1_000_000, contracts: [], payments: [], cards: [], policies: [] };
    const store = new SandboxRewardsStore(() => NOW, undefined, 2);
    const item = REWARDS_CATALOGUE[0]!;
    const first = store.redeem('cus_a', state, { itemId: item.id, idempotencyKey: 'key-a-00001' });
    store.redeem('cus_b', state, { itemId: item.id, idempotencyKey: 'key-b-00001' });
    store.redeem('cus_c', state, { itemId: item.id, idempotencyKey: 'key-c-00001' });
    expect(store.size).toBe(2);
    expect(store.list('cus_a')).toEqual([]);
    // the evicted key redeems anew instead of replaying
    const again = store.redeem('cus_a', state, { itemId: item.id, idempotencyKey: 'key-a-00001' });
    expect(again.replayed).toBe(false);
    expect(again.redemption.id).not.toBe(first.redemption.id);
    store.purgeCustomer('cus_b');
    expect(store.list('cus_b')).toEqual([]);
  });
});

describe('policies, cards, autopay, leads, share tokens: caps and purge', () => {
  const travel = { line: 'travel' as const, insurerId: 'awal-takaful', input: { region: 'gcc' as const, startDate: '2026-11-10', endDate: '2026-11-11' } };

  it('policy quotes: per customer and total caps; purgeCustomer', () => {
    const store = new SandboxPolicyStore(() => NOW, undefined, { quotesPerCustomer: 2, quotesTotal: 3 });
    const q1 = store.createQuote('cus_a', travel);
    store.createQuote('cus_a', travel);
    store.createQuote('cus_a', travel);
    expect(store.getQuote(q1.id)).toBeUndefined();
    expect(store.size).toBe(2);
    store.createQuote('cus_b', travel);
    store.createQuote('cus_b', travel);
    expect(store.size).toBe(3); // total cap
    store.purgeCustomer('cus_b');
    expect(store.size).toBe(1);
  });

  it('virtual cards: total cap and purge', () => {
    const issuer = new SandboxCardIssuer(2);
    const f = customerFinancials(newCustomerProfile('cus_x'));
    for (const c of ['cus_a', 'cus_b', 'cus_c']) issuer.apply(c, 'imtiaz-prepaid', f);
    expect(issuer.size).toBe(2);
    expect(issuer.list('cus_a')).toEqual([]);
    issuer.purgeCustomer('cus_c');
    expect(issuer.list('cus_c')).toEqual([]);
  });

  it('autopay settings: cap and purge', () => {
    const s = new SandboxContractSettings(2);
    const overview = (id: string) => customerOverview(newCustomerProfile(id), NOW);
    for (const c of ['cus_a', 'cus_b', 'cus_c']) s.setAutopay(overview(c), 'c-1002', true);
    expect(s.size).toBe(2);
    s.purgeCustomer('cus_c');
    expect(s.size).toBe(1);
  });

  it('leads added from bids are capped; the demo pipeline is never evicted', () => {
    const store = new LeadStore(demoLeads(NOW), 2);
    const demo = store.list('nmc').length;
    const mk = (n: number): Lead => ({ ...demoLeads(NOW)[0]!, id: `lead-bid_${n}`, sellerId: 'nmc' });
    for (let i = 0; i < 5; i++) appendLead(store, mk(i));
    expect(store.list('nmc')).toHaveLength(demo + 2);
    expect(store.list('nmc').map((l) => l.id)).toEqual(expect.arrayContaining(['lead-bid_3', 'lead-bid_4']));
    expect(store.list('nmc').map((l) => l.id)).not.toContain('lead-bid_0');
  });

  it('share tokens: capped', () => {
    const tokens = new PreApprovalTokenStore(15 * 60_000, undefined, 2);
    const overview = customerOverview(newCustomerProfile('cus_a'), NOW);
    const first = tokens.issue(overview, NOW);
    tokens.issue(overview, NOW);
    tokens.issue(overview, NOW);
    expect(tokens.size).toBe(2);
    expect(() => tokens.redeem(first.token, NOW)).toThrow();
  });
});

describe('assistant memory: forget a customer', () => {
  it('purgeCustomer clears the conversation and the rate-limit window', async () => {
    const service = new AssistantService({ clock: () => NOW });
    const profile = newCustomerProfile('cus_m');
    const ctx: AssistantContext = { customer: customerOverview(profile, NOW), policies: [], cards: [], cardOffers: [], now: NOW };
    for (let i = 0; i < ASSISTANT_RATE_LIMIT.messages; i++) await service.handle('cus_m', { text: 'hello', locale: 'en' }, ctx);
    await expect(service.handle('cus_m', { text: 'hello', locale: 'en' }, ctx)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(service.conversations.history('cus_m').length).toBeGreaterThan(0);
    service.purgeCustomer('cus_m');
    expect(service.conversations.history('cus_m')).toEqual([]);
    expect(service.limiter.size).toBe(0);
    await expect(service.handle('cus_m', { text: 'hello', locale: 'en' }, ctx)).resolves.toBeDefined();
  });
});
