import { describe, expect, it } from 'vitest';
import en from '../../i18n/en.json';
import ar from '../../i18n/ar.json';
import {
  applyForCard,
  bhd,
  buildPreApproval,
  defaultNotificationPreferences,
  demoCustomer,
  deriveNotifications,
  grantConsent,
  isNotificationId,
  MANDATORY_NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_RULES,
  NOTIFICATION_TYPES,
  notificationGroup,
  notificationInbox,
  notificationPreferencesView,
  quietHoursEnd,
  SandboxNotificationStore,
  SandboxTradeInStore,
  updateNotificationPreferences,
  type Claim,
  type Contract,
  type FinanceApplication,
  type GarageVehicle,
  type NotificationDraft,
  type NotificationSources,
  type NotificationText,
  type Policy,
} from '../src';

/** Bahrain is UTC+3: 20:59 UTC is 23:59 in Bahrain, 21:00 UTC is already the next Bahrain day. */
const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-03T09:00:00Z'); // 12:00 in Bahrain, Saturday 3 Oct 2026

/** packages/i18n lookup that fails on a missing key or placeholder, so every message is checked. */
const text: NotificationText = (locale, key, vars) => {
  const msgs = (locale === 'en' ? en : ar) as Record<string, string>;
  const msg = msgs[key];
  if (msg === undefined) throw new Error(`missing i18n key ${key} (${locale})`);
  return msg.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`missing {${k}} for ${key}`);
    return vars[k]!;
  });
};

const base = demoCustomer(NOW).contracts[1]!; // personal finance, autopay off

function contract(dueDate: string, over: Partial<Contract> = {}): Contract {
  return { ...base, id: 'c-9', autopay: false, nextInstallment: { number: 8, dueDate, amountFils: bhd(91.234), status: 'due' }, ...over };
}

const noGarage: GarageVehicle[] = [];
const src = (over: Partial<NotificationSources> = {}): NotificationSources => ({ contracts: [], garage: noGarage, ...over });
const types = (ds: NotificationDraft[]) => ds.map((d) => d.type).sort();
const byType = (ds: NotificationDraft[], type: string) => ds.find((d) => d.type === type);

function garageCar(registrationExpiry: string, insuranceExpiry = '2027-06-01'): GarageVehicle {
  return { vehicleId: 'v-honda-crv-2026', title: 'Honda CR-V 2026', plate: '123456', registrationExpiry, insuranceExpiry, nextServiceKm: 30_000, odometerKm: 27_000 };
}

function policy(over: Partial<Policy> = {}): Policy {
  return {
    id: 'pol_1',
    policyNumber: 'SBX-MTR-26-000001',
    customerId: 'cus_a',
    line: 'motor',
    insurerId: 'pearl-takaful',
    insurerName: { en: 'Pearl Takaful (demo)', ar: 'بيرل للتكافل (تجريبي)' },
    takaful: true,
    premiumFils: bhd(300),
    cover: { line: 'motor', cover: 'comprehensive', vehicleValueFils: bhd(14_900), agencyRepair: false, reference: '123456' },
    startDate: '2025-11-01',
    endDate: '2026-10-31',
    status: 'ACTIVE',
    quoteId: 'pq_1',
    paymentId: 'pay_1',
    issuedAt: '2025-10-31T21:00:00.000Z',
    ...over,
  };
}

function application(over: Partial<FinanceApplication> & { nextAction?: { type: 'PAY_VALUATION_FEE'; purpose: 'valuation_fee'; reference: string; feePaid: boolean } } = {}) {
  return {
    id: 'app_1',
    customerId: 'cus_a',
    productLine: 'vehicle',
    structure: 'murabaha',
    quote: { monthlyFils: bhd(250) },
    reference: 'v-honda-crv-2026',
    applicant: { monthlySalaryFils: bhd(1400), existingObligationsFils: 0 },
    status: 'APPROVED',
    timeline: [],
    idempotencyKey: 'k-12345678',
    createdAt: '2026-10-03T08:00:00.000Z',
    updatedAt: '2026-10-03T08:00:01.000Z',
    ...over,
  } as unknown as FinanceApplication;
}

function claim(status: Claim['status'], history: Claim['history']): Claim {
  return { id: 'clm_1', claimNumber: 'SBX-CLM-26-000001', customerId: 'cus_a', status, history, updatedAt: history.at(-1)!.at } as unknown as Claim;
}

describe('installments (Bahrain calendar days)', () => {
  it('due in 0..3 days, not 4; high priority at 0..1 days', () => {
    expect(deriveNotifications(src({ contracts: [contract('2026-10-07')] }), NOW).filter((d) => d.type === 'installment_due')).toEqual([]);
    const in3 = byType(deriveNotifications(src({ contracts: [contract('2026-10-06')] }), NOW), 'installment_due')!;
    expect(in3).toMatchObject({ id: 'installment_due.c-9.8', priority: 'normal', category: 'payments', link: '/account' });
    expect(byType(deriveNotifications(src({ contracts: [contract('2026-10-04')] }), NOW), 'installment_due')!.priority).toBe('high');
    expect(byType(deriveNotifications(src({ contracts: [contract('2026-10-03')] }), NOW), 'installment_due')!.priority).toBe('high');
  });

  it('switches at Bahrain midnight, not UTC midnight', () => {
    const c = [contract('2026-10-07')];
    expect(byType(deriveNotifications(src({ contracts: c }), at('2026-10-03T20:59:59Z')), 'installment_due')).toBeUndefined();
    expect(byType(deriveNotifications(src({ contracts: c }), at('2026-10-03T21:00:00Z')), 'installment_due')?.id).toBe('installment_due.c-9.8');
    // Due "today" until 23:59 Bahrain, overdue from 00:00 Bahrain (still 3 Oct in UTC).
    const today = [contract('2026-10-03')];
    expect(types(deriveNotifications(src({ contracts: today }), at('2026-10-03T20:59:59Z')))).toContain('installment_due');
    const late = deriveNotifications(src({ contracts: today }), at('2026-10-03T21:00:00Z'));
    expect(byType(late, 'installment_overdue')).toMatchObject({ id: 'installment_overdue.c-9.8', priority: 'high', category: 'overdue' });
    expect(byType(late, 'installment_due')).toBeUndefined();
  });

  it('autopay on: a due reminder that says autopay, and no autopay-off reminder', () => {
    const ds = deriveNotifications(src({ contracts: [contract('2026-10-05', { autopay: true })] }), NOW);
    expect(types(ds)).toEqual(['installment_due']);
    expect(ds[0]!.messageKey).toBe('notifInstallmentDueAutopay');
  });

  it('autopay off: reminder from 7 days before the next installment, one per installment', () => {
    expect(byType(deriveNotifications(src({ contracts: [contract('2026-10-11')] }), NOW), 'autopay_off')).toBeUndefined();
    const ds = deriveNotifications(src({ contracts: [contract('2026-10-10')] }), NOW);
    expect(byType(ds, 'autopay_off')).toMatchObject({ id: 'autopay_off.c-9.8', priority: 'low' });
    expect(byType(ds, 'installment_due')).toBeUndefined();
  });

  it('settled contract: settlement completed, no installment reminders', () => {
    const settled = contract('2026-10-04', {
      settlement: { paymentId: 'pay_1', amountFils: bhd(2000), settledAt: '2026-10-02T10:00:00.000Z', settledOn: '2026-10-02' },
    });
    delete settled.nextInstallment;
    const ds = deriveNotifications(src({ contracts: [settled] }), NOW);
    expect(types(ds)).toEqual(['settlement_completed']);
    expect(ds[0]).toMatchObject({ id: 'settlement_completed.c-9', occurredAt: '2026-10-02T10:00:00.000Z' });
  });

  it('the demo customer (installment in 4 days) gets the autopay reminder, the registration and the garage insurance', () => {
    const demo = demoCustomer(NOW);
    const ds = deriveNotifications(src({ contracts: demo.contracts, garage: demo.garage }), NOW);
    expect(types(ds)).toEqual(['garage_insurance_expiring', 'registration_expiring']);
    const later = deriveNotifications(src({ contracts: demo.contracts, garage: demo.garage }), at('2026-10-04T21:00:00Z'));
    expect(types(later)).toContain('installment_due');
  });
});

describe('My Garage and policies', () => {
  it('registration: 30 days ahead, not 31; expired shown for 30 days', () => {
    expect(deriveNotifications(src({ garage: [garageCar('2026-11-03')] }), NOW)).toEqual([]);
    expect(byType(deriveNotifications(src({ garage: [garageCar('2026-11-02')] }), NOW), 'registration_expiring')).toMatchObject({
      id: 'registration_expiring.v-honda-crv-2026.2026-11-02',
      priority: 'normal',
      messageKey: 'notifRegistrationExpiring',
    });
    expect(byType(deriveNotifications(src({ garage: [garageCar('2026-10-10')] }), NOW), 'registration_expiring')!.priority).toBe('high');
    expect(byType(deriveNotifications(src({ garage: [garageCar('2026-10-02')] }), NOW), 'registration_expiring')!.messageKey).toBe('notifRegistrationExpired');
    expect(deriveNotifications(src({ garage: [garageCar('2026-09-02')] }), NOW)).toEqual([]);
  });

  it('garage motor insurance is not mentioned once it is renewed with an active motor policy here', () => {
    const car = garageCar('2027-06-01', '2026-10-20');
    expect(types(deriveNotifications(src({ garage: [car] }), NOW))).toEqual(['garage_insurance_expiring']);
    const renewed = policy({ startDate: '2026-10-03', endDate: '2027-10-02' });
    expect(types(deriveNotifications(src({ garage: [car], policies: [renewed] }), NOW))).toEqual([]);
  });

  it('policy expiring in 0..30 days (high in the last 7), expired for 30 days', () => {
    expect(deriveNotifications(src({ policies: [policy({ endDate: '2026-11-03' })] }), NOW)).toEqual([]);
    expect(deriveNotifications(src({ policies: [policy({ endDate: '2026-11-02' })] }), NOW)[0]).toMatchObject({
      id: 'policy_expiring.pol_1.2026-11-02',
      priority: 'normal',
      link: '/insurance',
      category: 'insurance',
    });
    expect(deriveNotifications(src({ policies: [policy({ endDate: '2026-10-10' })] }), NOW)[0]!.priority).toBe('high');
    const expired = deriveNotifications(src({ policies: [policy({ endDate: '2026-10-02', status: 'EXPIRED' })] }), NOW)[0]!;
    expect(expired).toMatchObject({ id: 'policy_expired.pol_1', type: 'policy_expired' });
    expect(deriveNotifications(src({ policies: [policy({ endDate: '2026-09-02', status: 'EXPIRED' })] }), NOW)).toEqual([]);
  });

  it('a short trip bought today shows as ending, linked to travel; a future trip does not', () => {
    const trip = policy({ id: 'pol_trv', line: 'travel', startDate: '2026-10-03', endDate: '2026-10-05', issuedAt: NOW.toISOString() });
    const [d] = deriveNotifications(src({ policies: [trip] }), NOW);
    expect(d).toMatchObject({ link: '/insurance/travel', messageKey: 'notifPolicyExpiringTravel', priority: 'high', occurredAt: NOW.toISOString() });
    expect(deriveNotifications(src({ policies: [{ ...trip, startDate: '2026-10-10', endDate: '2026-10-12' }] }), NOW)).toEqual([]);
  });

  it('the demo history (a trip that ended in 2025) is not mentioned', () => {
    expect(deriveNotifications(src({ policies: [policy({ line: 'travel', startDate: '2025-12-20', endDate: '2025-12-27', status: 'EXPIRED' })] }), NOW)).toEqual([]);
  });
});

describe('claims, applications, cards, trade-in, pre-approval', () => {
  it('claim status: one notification per status the customer did not trigger', () => {
    const t0 = '2026-10-01T10:00:00.000Z';
    expect(deriveNotifications(src({ claims: [claim('SUBMITTED', [{ status: 'SUBMITTED', at: t0 }])] }), NOW)).toEqual([]);
    const assessed = claim('UNDER_ASSESSMENT', [
      { status: 'SUBMITTED', at: t0 },
      { status: 'UNDER_ASSESSMENT', at: '2026-10-02T10:00:00.000Z' },
    ]);
    expect(deriveNotifications(src({ claims: [assessed] }), NOW)[0]).toMatchObject({
      id: 'claim_status.clm_1.UNDER_ASSESSMENT',
      link: '/claims/clm_1',
      occurredAt: '2026-10-02T10:00:00.000Z',
    });
    const approved = claim('APPROVED', [...assessed.history, { status: 'APPROVED', at: '2026-10-03T08:00:00.000Z' }]);
    expect(deriveNotifications(src({ claims: [approved] }), NOW)[0]).toMatchObject({ id: 'claim_status.clm_1.APPROVED', priority: 'high' });
    expect(deriveNotifications(src({ claims: [claim('REPAIR_BOOKED', [...approved.history, { status: 'REPAIR_BOOKED', at: t0 }])] }), NOW)).toEqual([]);
  });

  it('application: approved → accept the offer; valuation fee due / paid; referred, declined, completed', () => {
    const approved = deriveNotifications(src({ applications: [application()] }), NOW)[0]!;
    expect(approved).toMatchObject({ id: 'application_update.app_1.APPROVED', priority: 'high', link: '/applications/app_1', messageKey: 'notifApplicationApproved' });
    const fee = { type: 'PAY_VALUATION_FEE' as const, purpose: 'valuation_fee' as const, reference: 'p-1', feePaid: false };
    const signed = application({ productLine: 'home', structure: 'conventional', status: 'CONTRACT_SIGNED', nextAction: fee });
    expect(deriveNotifications(src({ applications: [signed] }), NOW)[0]).toMatchObject({ id: 'application_update.app_1.CONTRACT_SIGNED-due', messageKey: 'notifApplicationValuationFee' });
    const paid = { ...signed, nextAction: { ...fee, feePaid: true } };
    expect(deriveNotifications(src({ applications: [paid] }), NOW)[0]!.messageKey).toBe('notifApplicationValuationPaid');
    for (const [status, key] of [
      ['REFERRED', 'notifApplicationReferred'],
      ['DECLINED', 'notifApplicationDeclined'],
      ['COMPLETED', 'notifApplicationCompleted'],
      ['LEASE_STARTED', 'notifApplicationLeaseStarted'],
    ] as const) {
      expect(deriveNotifications(src({ applications: [application({ status })] }), NOW)[0]!.messageKey).toBe(key);
    }
    expect(deriveNotifications(src({ applications: [application({ status: 'DRAFT' })] }), NOW)).toEqual([]);
  });

  it('card issued (active cards only)', () => {
    const r = applyForCard('imtiaz-world', { monthlySalaryFils: bhd(1400), existingObligationsFils: 0 }, { now: NOW, last4: '4242', id: 'vc_1' });
    if (r.decision !== 'APPROVED') throw new Error('expected approval');
    expect(deriveNotifications(src({ cards: [r.virtualCard] }), NOW)[0]).toMatchObject({ id: 'card_issued.vc_1', occurredAt: NOW.toISOString() });
    expect(deriveNotifications(src({ cards: [{ ...r.virtualCard, status: 'FROZEN' }] }), NOW)).toEqual([]);
  });

  it('trade-in offer: 0..2 days before it ends (valid 7 Bahrain days)', () => {
    const store = new SandboxTradeInStore(() => NOW);
    const offer = store.value('cus_a', { make: 'Toyota', model: 'Camry', year: 2021, mileageKm: 60_000, condition: 'good', accidentHistory: false });
    expect(offer.validUntil).toBe('2026-10-10');
    expect(deriveNotifications(src({ tradeIn: offer }), at('2026-10-07T09:00:00Z'))).toEqual([]);
    expect(deriveNotifications(src({ tradeIn: offer }), at('2026-10-07T21:00:00Z'))[0]).toMatchObject({ id: `tradein_expiring.${offer.id}`, link: '/trade-in' });
    expect(deriveNotifications(src({ tradeIn: offer }), at('2026-10-10T20:59:00Z'))).toHaveLength(1);
    expect(deriveNotifications(src({ tradeIn: offer }), at('2026-10-10T21:00:00Z'))).toEqual([]);
  });

  it('pre-approval and consent: 0..7 days before they end; none for the demo customer', () => {
    const onboardedAt = at('2026-09-01T09:00:00Z');
    const consent = grantConsent(['CRB', 'OPEN_BANKING'], onboardedAt);
    const result = buildPreApproval({ monthlySalaryFils: bhd(1400), existingObligationsFils: 0, employer: 'X' }, consent, onboardedAt);
    const onboarding = { financials: { monthlySalaryFils: bhd(1400), existingObligationsFils: 0 }, result, completedAt: onboardedAt.toISOString() };
    expect(result.preApproval.validUntil).toBe('2026-10-01');
    // Pre-approval ended 1 Oct: "expired"; consent (90 days) is far away.
    expect(types(deriveNotifications(src({ onboarding }), NOW))).toEqual(['preapproval_expiring']);
    expect(deriveNotifications(src({ onboarding }), NOW)[0]!.messageKey).toBe('notifPreApprovalExpired');
    expect(deriveNotifications(src({ onboarding }), at('2026-09-23T09:00:00Z'))).toEqual([]);
    expect(deriveNotifications(src({ onboarding }), at('2026-09-24T09:00:00Z'))[0]).toMatchObject({ id: 'preapproval_expiring.2026-10-01', messageKey: 'notifPreApprovalExpiring' });
    // Consent ends 30 Nov 09:00 UTC (12:00 Bahrain), so its last day is 30 Nov.
    const consentDs = deriveNotifications(src({ onboarding }), at('2026-11-23T09:00:00Z')).filter((d) => d.type === 'consent_expiring');
    expect(consentDs[0]).toMatchObject({ id: 'consent_expiring.2026-11-30', link: '/onboarding' });
    expect(deriveNotifications(src({ preApproval: demoCustomer(NOW).preApproval }), NOW)).toEqual([]);
  });
});

describe('ids, text and inbox', () => {
  const everything = (): NotificationSources => {
    const demo = demoCustomer(NOW);
    return src({
      contracts: [contract('2026-10-02'), contract('2026-10-05', { id: 'c-8' })],
      garage: demo.garage,
      policies: [policy({ endDate: '2026-10-20' }), policy({ id: 'pol_2', endDate: '2026-10-01', status: 'EXPIRED', line: 'home' })],
      applications: [application()],
      claims: [claim('SETTLED', [{ status: 'SETTLED', at: '2026-09-01T10:00:00.000Z' }])],
    });
  };

  it('same sources, same ids: re-deriving is stable and ids are unique and well formed', () => {
    const a = deriveNotifications(everything(), NOW).map((d) => d.id);
    const b = deriveNotifications(everything(), at('2026-10-03T15:00:00Z')).map((d) => d.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    for (const id of a) expect(isNotificationId(id), id).toBe(true);
    expect(isNotificationId('../etc')).toBe(false);
    expect(isNotificationId('x'.repeat(300))).toBe(false);
  });

  it('every type has a category, and every message exists in both languages with its placeholders', () => {
    const ds = deriveNotifications(everything(), NOW);
    for (const d of ds) expect(NOTIFICATION_TYPES).toContain(d.type);
    const inbox = notificationInbox(ds, new SandboxNotificationStore().state('cus_a'), defaultNotificationPreferences(), text, NOW);
    const overdue = inbox.items.find((i) => i.type === 'installment_overdue')!;
    expect(overdue.title.en).toBe('Installment overdue');
    expect(overdue.body.en).toBe('BHD 91.234 for Personal Finance was due on 2 Oct 2026. Please pay as soon as you can.');
    expect(overdue.body.ar).toContain('د.ب.');
    expect(inbox.items.find((i) => i.type === 'policy_expired')!.title.en).toBe('Home cover has ended');
  });

  it('groups by Bahrain day: today, the previous 6 days, earlier', () => {
    expect(notificationGroup('2026-10-02T21:00:00.000Z', NOW)).toBe('today');
    expect(notificationGroup('2026-10-02T20:59:00.000Z', NOW)).toBe('week');
    expect(notificationGroup('2026-09-27T09:00:00.000Z', NOW)).toBe('week');
    expect(notificationGroup('2026-09-26T09:00:00.000Z', NOW)).toBe('earlier');
  });

  it('inbox: sorted by group then priority; occurredAt never in the future', () => {
    const inbox = notificationInbox(deriveNotifications(everything(), NOW), new SandboxNotificationStore().state('x'), defaultNotificationPreferences(), text, NOW);
    const rank = { today: 0, week: 1, earlier: 2 };
    const groups = inbox.items.map((i) => rank[i.group]);
    expect(groups).toEqual([...groups].sort());
    for (const i of inbox.items) expect(Date.parse(i.occurredAt)).toBeLessThanOrEqual(NOW.getTime());
    expect(inbox.unreadCount).toBe(inbox.total);
    expect(inbox.timeZone).toBe('Asia/Bahrain');
  });

  it('read and dismissed state survives re-derivation; a new period is unread again', () => {
    const store = new SandboxNotificationStore();
    const prefs = defaultNotificationPreferences();
    const first = deriveNotifications(src({ contracts: [contract('2026-10-05')] }), NOW);
    const due = byType(first, 'installment_due')!;
    store.markRead('cus_a', [due.id]);
    store.dismiss('cus_a', byType(first, 'autopay_off')!.id);
    const again = notificationInbox(deriveNotifications(src({ contracts: [contract('2026-10-05')] }), at('2026-10-03T18:00:00Z')), store.state('cus_a'), prefs, text, NOW);
    expect(again.items.map((i) => [i.id, i.read])).toEqual([['installment_due.c-9.8', true]]);
    expect(again.unreadCount).toBe(0);
    // Next month's installment (number 9) is a new notification.
    const next = contract('2026-11-05', { nextInstallment: { number: 9, dueDate: '2026-11-05', amountFils: bhd(91.234), status: 'due' } });
    const nov = notificationInbox(deriveNotifications(src({ contracts: [next] }), at('2026-11-03T09:00:00Z')), store.state('cus_a'), prefs, text, at('2026-11-03T09:00:00Z'));
    expect(nov.items.find((i) => i.type === 'installment_due')).toMatchObject({ id: 'installment_due.c-9.9', read: false });
  });

  it('per-customer isolation: one customer reading or dismissing never changes another inbox', () => {
    const store = new SandboxNotificationStore();
    const ds = deriveNotifications(src({ contracts: [contract('2026-10-05')] }), NOW);
    store.markRead('cus_a', ds.map((d) => d.id));
    store.dismiss('cus_a', ds[0]!.id);
    store.updatePreferences('cus_a', { quietHours: { enabled: false } });
    const b = notificationInbox(ds, store.state('cus_b'), store.preferences('cus_b'), text, NOW);
    expect(b.unreadCount).toBe(ds.length);
    expect(b.total).toBe(ds.length);
    expect(store.preferences('cus_b').quietHours.enabled).toBe(true);
    expect(notificationInbox(ds, store.state('cus_a'), store.preferences('cus_a'), text, NOW).unreadCount).toBe(0);
  });

  it('keeps at most maxStoredIdsPerCustomer ids (oldest dropped)', () => {
    const store = new SandboxNotificationStore();
    const ids = Array.from({ length: NOTIFICATION_RULES.maxStoredIdsPerCustomer + 5 }, (_, i) => `installment_due.c-${i}.1`);
    store.markRead('cus_a', ids);
    expect(store.state('cus_a').isRead(ids[0]!)).toBe(false);
    expect(store.state('cus_a').isRead(ids.at(-1)!)).toBe(true);
  });
});

describe('preferences, channels and quiet hours', () => {
  it('defaults: push everywhere, WhatsApp opt-in, quiet hours 22:00–07:00 Bahrain; overdue is mandatory', () => {
    const v = notificationPreferencesView(defaultNotificationPreferences());
    expect(v.categories.map((c) => c.category)).toEqual([...NOTIFICATION_CATEGORIES]);
    expect(v.categories.every((c) => c.channels.push && !c.channels.whatsapp)).toBe(true);
    expect(v.categories.filter((c) => c.mandatory).map((c) => c.category)).toEqual([...MANDATORY_NOTIFICATION_CATEGORIES]);
    expect(v).toMatchObject({ timeZone: 'Asia/Bahrain', quietHours: { enabled: true, start: '22:00', end: '07:00' }, sandbox: true });
  });

  it('mandatory categories cannot be fully disabled; other categories can', () => {
    const p = defaultNotificationPreferences();
    const off = { push: false, sms: false, whatsapp: false, email: false };
    expect(() => updateNotificationPreferences(p, { categories: [{ category: 'overdue', channels: off }] })).toThrow(
      expect.objectContaining({ code: 'MANDATORY_CATEGORY' }),
    );
    expect(updateNotificationPreferences(p, { categories: [{ category: 'overdue', channels: { ...off, whatsapp: true } }] }).categories.overdue).toEqual({
      ...off,
      whatsapp: true,
    });
    expect(updateNotificationPreferences(p, { categories: [{ category: 'cards', channels: off }] }).categories.cards).toEqual(off);
  });

  it('rejects unknown categories, channels, non-booleans and bad times; a rejected update changes nothing', () => {
    const store = new SandboxNotificationStore();
    const code = (body: unknown) => {
      try {
        store.updatePreferences('cus_a', body);
      } catch (e) {
        return (e as { code: string }).code;
      }
      return undefined;
    };
    expect(code(null)).toBe('INVALID_REQUEST');
    expect(code({ categories: {} })).toBe('INVALID_REQUEST');
    expect(code({ categories: [{ category: 'spam', channels: {} }] })).toBe('INVALID_REQUEST');
    expect(code({ categories: [{ category: 'cards', channels: { pigeon: true } }] })).toBe('INVALID_REQUEST');
    expect(code({ categories: [{ category: 'cards', channels: { sms: 'yes' } }] })).toBe('INVALID_REQUEST');
    expect(code({ quietHours: { start: '24:00' } })).toBe('INVALID_REQUEST');
    expect(code({ quietHours: { start: '07:00' } })).toBe('INVALID_REQUEST'); // same as end
    expect(code({ quietHours: { enabled: 'no' } })).toBe('INVALID_REQUEST');
    expect(store.preferences('cus_a')).toEqual(defaultNotificationPreferences());
    expect(code({ categories: [{ category: 'cards', channels: { whatsapp: true } }], quietHours: { start: '23:30', end: '06:00' } })).toBeUndefined();
    expect(store.preferences('cus_a').categories.cards.whatsapp).toBe(true);
    expect(store.preferences('cus_a').quietHours).toEqual({ enabled: true, start: '23:30', end: '06:00' });
  });

  it('quiet hours use Bahrain time and cross midnight', () => {
    const q = defaultNotificationPreferences().quietHours;
    expect(quietHoursEnd(q, at('2026-10-03T18:59:00Z'))).toBeUndefined(); // 21:59 Bahrain
    expect(quietHoursEnd(q, at('2026-10-03T19:00:00Z'))).toBe('2026-10-04T04:00:00.000Z'); // 22:00 → 07:00 next day
    expect(quietHoursEnd(q, at('2026-10-03T23:30:00Z'))).toBe('2026-10-04T04:00:00.000Z'); // 02:30 Bahrain on the 4th
    expect(quietHoursEnd(q, at('2026-10-04T04:00:00Z'))).toBeUndefined(); // 07:00
    expect(quietHoursEnd({ enabled: true, start: '13:00', end: '15:00' }, at('2026-10-03T10:30:00Z'))).toBe('2026-10-03T12:00:00.000Z');
    expect(quietHoursEnd({ ...q, enabled: false }, at('2026-10-03T19:00:00Z'))).toBeUndefined();
  });

  it('delivery: the channels each notification would use, held in quiet hours (sandbox, nothing sent)', () => {
    const ds = deriveNotifications(src({ contracts: [contract('2026-10-01')] }), NOW);
    const prefs = updateNotificationPreferences(defaultNotificationPreferences(), { categories: [{ category: 'payments', channels: { push: false, sms: false } }] });
    const day = notificationInbox(ds, new SandboxNotificationStore().state('a'), prefs, text, NOW);
    expect(day.items[0]).toMatchObject({ type: 'installment_overdue', mandatory: true, delivery: { channels: ['push', 'sms'], sandbox: true } });
    expect(day.items[0]!.delivery.deferredUntil).toBeUndefined();
    const night = notificationInbox(ds, new SandboxNotificationStore().state('a'), prefs, text, at('2026-10-03T20:00:00Z'));
    expect(night.items[0]!.delivery.deferredUntil).toBe('2026-10-04T04:00:00.000Z');
    const autopay = deriveNotifications(src({ contracts: [contract('2026-10-05')] }), NOW);
    const inbox = notificationInbox(autopay, new SandboxNotificationStore().state('a'), prefs, text, NOW);
    expect(inbox.items.every((i) => i.delivery.channels.length === 0 && !i.mandatory)).toBe(true);
  });
});
