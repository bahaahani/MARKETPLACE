import type { Contract, GarageVehicle } from './account';
import type { VirtualCard } from './cards';
import type { Claim, ClaimStatus } from './claims';
import type { CustomerProfile } from './customer';
import type { PreApproval } from './affordability';
import { addDaysIso, bahrainToday, daysBetweenIso, type InsuranceLine } from './insurance-common';
import { formatBhd, type Fils, type Locale } from './money';
import type { ApplicationNextAction, FinanceApplication } from './origination';
import type { Policy } from './policies';
import type { TradeInOffer } from './tradein';
import type { Localized } from './types';

/**
 * Notifications inbox, reminders and preferences (⚠️ sandbox).
 *
 * Notifications are DERIVED, never stored: `deriveNotifications` is a pure function over what the customer already
 * has (contracts and installments, policies, claims, applications, cards, the trade-in offer, pre-approval and
 * consent validity, My Garage expiry dates). Each one has a stable id (type + entity id + period), so the only state
 * kept is which ids the customer read or dismissed, plus their channel preferences (SandboxNotificationStore).
 * Re-deriving gives the same ids, so read / dismissed survive; a new period (next installment, new claim status,
 * new expiry date) is a new id, so it shows up unread.
 *
 * Every date rule uses the Bahrain calendar day (Asia/Bahrain, UTC+3, no daylight saving).
 *
 * ⚠️ Sandbox: nothing is sent. Channels (push, SMS, WhatsApp, email) and quiet hours are modelled so the apps can say
 * what WOULD be sent. Production: a messaging service (APNs / FCM / HMS push, an SMS aggregator, the WhatsApp Business
 * API, email) with consent records, templates approved by Compliance, and delivery receipts.
 */

export const NOTIFICATION_TIME_ZONE = 'Asia/Bahrain';
const BAHRAIN_OFFSET = '+03:00';
const BAHRAIN_OFFSET_MIN = 180;

export const NOTIFICATION_CHANNELS = ['push', 'sms', 'whatsapp', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Preference categories, in the order the apps show them. */
export const NOTIFICATION_CATEGORIES = ['payments', 'overdue', 'insurance', 'claims', 'applications', 'cards', 'vehicle', 'account'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * ⚠️ CBB consumer-protection PLACEHOLDER: categories the customer cannot fully switch off (at least one channel stays
 * on; the in-app inbox always shows them). Overdue-payment notices are treated as mandatory pending Compliance's
 * reading of the CBB Rulebook (consumer protection / collections). VERIFY with Compliance.
 */
export const MANDATORY_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = ['overdue'];

export const NOTIFICATION_TYPES = [
  'installment_due',
  'installment_overdue',
  'autopay_off',
  'settlement_completed',
  'registration_expiring',
  'garage_insurance_expiring',
  'policy_expiring',
  'policy_expired',
  'claim_status',
  'application_update',
  'card_issued',
  'tradein_expiring',
  'preapproval_expiring',
  'consent_expiring',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CATEGORY_OF: Readonly<Record<NotificationType, NotificationCategory>> = {
  installment_due: 'payments',
  installment_overdue: 'overdue',
  autopay_off: 'payments',
  settlement_completed: 'payments',
  registration_expiring: 'vehicle',
  garage_insurance_expiring: 'insurance',
  policy_expiring: 'insurance',
  policy_expired: 'insurance',
  claim_status: 'claims',
  application_update: 'applications',
  card_issued: 'cards',
  tradein_expiring: 'vehicle',
  preapproval_expiring: 'account',
  consent_expiring: 'account',
};

/**
 * ⚠️ VERIFY (Product, Operations): reminder thresholds, in Bahrain calendar days.
 * "≤ N days" includes the day itself (0 days left = today).
 */
export const NOTIFICATION_RULES = {
  /** Installment due in 0..3 days */
  installmentDueDays: 3,
  /** Autopay-off reminder from 7 days before the next installment */
  autopayReminderDays: 7,
  /** My Garage registration and motor insurance: 0..30 days left, and up to 30 days after expiry */
  registrationExpiringDays: 30,
  /** Motor / home / travel policy: 0..30 days left */
  policyExpiringDays: 30,
  /** An expired policy is mentioned for this many days after its last day */
  policyExpiredShownDays: 30,
  /** Trade-in instant offer: 0..2 days left */
  tradeInExpiringDays: 2,
  /** Pre-approval and CRB / Open Banking consent: 0..7 days left (and up to 30 days after) */
  preApprovalExpiringDays: 7,
  consentExpiringDays: 7,
  expiredShownDays: 30,
  /** Read / dismissed ids kept per customer (oldest dropped first) */
  maxStoredIdsPerCustomer: 1000,
} as const;

export type NotificationPriority = 'high' | 'normal' | 'low';
export type NotificationGroup = 'today' | 'week' | 'earlier';

/** A value a message needs, formatted per locale when the notification is localized. */
export type NotificationParam = { money: Fils } | { date: string } | { text: Localized | string } | { key: string };

/** A derived notification, before the customer's read state and preferences are applied. */
export interface NotificationDraft {
  /** Stable: `${type}.${entityId}[.${period}]` */
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  /** Deep link, the same path on web (after /{locale}) and in the mobile app (go_router) */
  link: string;
  /** ISO instant the notification became relevant (never in the future) */
  occurredAt: string;
  /** i18n key prefix: `${messageKey}Title` and `${messageKey}Body` in packages/i18n */
  messageKey: string;
  params: Record<string, NotificationParam>;
}

/** What the API returns (GET /me/notifications). */
export interface AppNotification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  mandatory: boolean;
  link: string;
  occurredAt: string;
  /** Bahrain-calendar group: today, the previous 6 days, or earlier */
  group: NotificationGroup;
  read: boolean;
  title: Localized;
  body: Localized;
  /** ⚠️ Sandbox: the channels this WOULD be sent on (nothing is sent), held until `deferredUntil` in quiet hours */
  delivery: { channels: NotificationChannel[]; deferredUntil?: string; sandbox: true };
}

export interface NotificationInbox {
  items: AppNotification[];
  unreadCount: number;
  total: number;
  timeZone: typeof NOTIFICATION_TIME_ZONE;
}

/** Everything the rules look at, all belonging to ONE customer (the caller scopes it to the session customer). */
export interface NotificationSources {
  contracts: readonly Contract[];
  garage: readonly GarageVehicle[];
  /** The onboarding outcome (pre-approval and consent); the demo customer has none, so nothing expires */
  onboarding?: CustomerProfile['onboarding'];
  /** Pre-approval currently shown (used when onboarding is present) */
  preApproval?: PreApproval;
  applications?: readonly (FinanceApplication & { nextAction?: ApplicationNextAction })[];
  policies?: readonly Policy[];
  claims?: readonly Claim[];
  cards?: readonly VirtualCard[];
  tradeIn?: TradeInOffer;
}

// ---- Rules

/** Start of a Bahrain calendar day, as an ISO instant. */
function bahrainDayStart(date: string): string {
  return new Date(`${date}T00:00:00${BAHRAIN_OFFSET}`).toISOString();
}

function latest(...isos: (string | undefined)[]): string {
  return isos.filter((x): x is string => !!x).reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

function notLater(iso: string, now: Date): string {
  return Date.parse(iso) > now.getTime() ? now.toISOString() : iso;
}

const LINE_KEY: Record<InsuranceLine, string> = { motor: 'notifLineMotor', travel: 'notifLineTravel', home: 'notifLineHome' };
const PRODUCT_KEY: Record<FinanceApplication['productLine'], string> = {
  vehicle: 'notifProductVehicle',
  personal: 'notifProductPersonal',
  home: 'notifProductHome',
};

/** Claim statuses the customer is told about (SUBMITTED and REPAIR_BOOKED are their own actions). */
const CLAIM_STATUS_KEY: Partial<Record<ClaimStatus, string>> = {
  UNDER_ASSESSMENT: 'notifClaimUnderAssessment',
  APPROVED: 'notifClaimApproved',
  REJECTED: 'notifClaimRejected',
  SETTLED: 'notifClaimSettled',
};

function draft(
  type: NotificationType,
  key: string[],
  d: Omit<NotificationDraft, 'id' | 'type' | 'category'>,
  now: Date,
): NotificationDraft {
  return { id: [type, ...key].join('.'), type, category: NOTIFICATION_CATEGORY_OF[type], ...d, occurredAt: notLater(d.occurredAt, now) };
}

function contractRules(c: Contract, today: string, now: Date): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  if (c.settlement) {
    out.push(
      draft('settlement_completed', [c.id], {
        priority: 'normal',
        link: '/account',
        occurredAt: c.settlement.settledAt,
        messageKey: 'notifSettlementCompleted',
        params: { contract: { text: c.title }, date: { date: c.settlement.settledOn } },
      }, now),
    );
    return out;
  }
  const next = c.nextInstallment;
  if (!next) return out;
  const days = daysBetweenIso(today, next.dueDate);
  const params = { contract: { text: c.title }, amount: { money: next.amountFils }, date: { date: next.dueDate } };
  const period = String(next.number);
  if (days < 0) {
    out.push(
      draft('installment_overdue', [c.id, period], {
        priority: 'high',
        link: '/account',
        occurredAt: bahrainDayStart(addDaysIso(next.dueDate, 1)),
        messageKey: 'notifInstallmentOverdue',
        params,
      }, now),
    );
  } else if (days <= NOTIFICATION_RULES.installmentDueDays) {
    out.push(
      draft('installment_due', [c.id, period], {
        priority: days <= 1 ? 'high' : 'normal',
        link: '/account',
        occurredAt: bahrainDayStart(addDaysIso(next.dueDate, -NOTIFICATION_RULES.installmentDueDays)),
        messageKey: c.autopay ? 'notifInstallmentDueAutopay' : 'notifInstallmentDue',
        params,
      }, now),
    );
  }
  if (!c.autopay && days >= 0 && days <= NOTIFICATION_RULES.autopayReminderDays) {
    out.push(
      draft('autopay_off', [c.id, period], {
        priority: 'low',
        link: '/account',
        occurredAt: bahrainDayStart(addDaysIso(next.dueDate, -NOTIFICATION_RULES.autopayReminderDays)),
        messageKey: 'notifAutopayOff',
        params,
      }, now),
    );
  }
  return out;
}

/** 0..N days left → "expiring"; up to `shownAfter` days after → "expired"; otherwise nothing. */
function expiryWindow(today: string, lastDay: string, before: number, shownAfter: number): 'expiring' | 'expired' | undefined {
  const days = daysBetweenIso(today, lastDay);
  if (days >= 0 && days <= before) return 'expiring';
  if (days < 0 && -days <= shownAfter) return 'expired';
  return undefined;
}

function garageRules(g: GarageVehicle, policies: readonly Policy[], today: string, now: Date): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const reg = expiryWindow(today, g.registrationExpiry, NOTIFICATION_RULES.registrationExpiringDays, NOTIFICATION_RULES.expiredShownDays);
  if (reg) {
    out.push(
      draft('registration_expiring', [g.vehicleId, g.registrationExpiry], {
        priority: reg === 'expired' || daysBetweenIso(today, g.registrationExpiry) <= 7 ? 'high' : 'normal',
        link: '/account',
        occurredAt:
          reg === 'expired'
            ? bahrainDayStart(addDaysIso(g.registrationExpiry, 1))
            : bahrainDayStart(addDaysIso(g.registrationExpiry, -NOTIFICATION_RULES.registrationExpiringDays)),
        messageKey: reg === 'expired' ? 'notifRegistrationExpired' : 'notifRegistrationExpiring',
        params: { vehicle: { text: g.title }, date: { date: g.registrationExpiry } },
      }, now),
    );
  }
  // The garage car's motor insurance (held elsewhere), unless it is already renewed with an ACTIVE motor policy here.
  const renewed = policies.some(
    (p) => p.line === 'motor' && p.status === 'ACTIVE' && p.cover.line === 'motor' && p.cover.reference === g.plate && p.endDate > g.insuranceExpiry,
  );
  const ins = renewed ? undefined : expiryWindow(today, g.insuranceExpiry, NOTIFICATION_RULES.policyExpiringDays, NOTIFICATION_RULES.expiredShownDays);
  if (ins) {
    out.push(
      draft('garage_insurance_expiring', [g.vehicleId, g.insuranceExpiry], {
        priority: ins === 'expired' || daysBetweenIso(today, g.insuranceExpiry) <= 7 ? 'high' : 'normal',
        link: '/insurance',
        occurredAt:
          ins === 'expired'
            ? bahrainDayStart(addDaysIso(g.insuranceExpiry, 1))
            : bahrainDayStart(addDaysIso(g.insuranceExpiry, -NOTIFICATION_RULES.policyExpiringDays)),
        messageKey: ins === 'expired' ? 'notifGarageInsuranceExpired' : 'notifGarageInsuranceExpiring',
        params: { vehicle: { text: g.title }, date: { date: g.insuranceExpiry } },
      }, now),
    );
  }
  return out;
}

function policyRules(p: Policy, today: string, now: Date): NotificationDraft[] {
  // Cover that has not started yet (a future trip) is not "ending".
  if (p.startDate > today) return [];
  const w = expiryWindow(today, p.endDate, NOTIFICATION_RULES.policyExpiringDays, NOTIFICATION_RULES.policyExpiredShownDays);
  if (!w) return [];
  const link = p.line === 'travel' ? '/insurance/travel' : p.line === 'home' ? '/insurance/home' : '/insurance';
  const params = { line: { key: LINE_KEY[p.line] }, number: { text: p.policyNumber }, insurer: { text: p.insurerName }, date: { date: p.endDate } };
  if (w === 'expired') {
    return [
      draft('policy_expired', [p.id], {
        priority: 'normal',
        link,
        occurredAt: bahrainDayStart(addDaysIso(p.endDate, 1)),
        messageKey: 'notifPolicyExpired',
        params,
      }, now),
    ];
  }
  return [
    draft('policy_expiring', [p.id, p.endDate], {
      priority: daysBetweenIso(today, p.endDate) <= 7 ? 'high' : 'normal',
      link,
      occurredAt: latest(bahrainDayStart(addDaysIso(p.endDate, -NOTIFICATION_RULES.policyExpiringDays)), p.issuedAt),
      messageKey: p.line === 'travel' ? 'notifPolicyExpiringTravel' : 'notifPolicyExpiring',
      params,
    }, now),
  ];
}

function claimRules(c: Claim, now: Date): NotificationDraft[] {
  const key = CLAIM_STATUS_KEY[c.status];
  if (!key) return [];
  // The id carries the status: each new status is a new (unread) notification; the time is when it changed.
  const changedAt = [...c.history].reverse().find((h) => h.status === c.status)?.at ?? c.updatedAt;
  return [
    draft('claim_status', [c.id, c.status], {
      priority: c.status === 'APPROVED' || c.status === 'REJECTED' ? 'high' : 'normal',
      link: `/claims/${c.id}`,
      occurredAt: changedAt,
      messageKey: key,
      params: { number: { text: c.claimNumber }, ...(c.approvedAmountFils !== undefined ? { amount: { money: c.approvedAmountFils } } : {}) },
    }, now),
  ];
}

function applicationRules(a: FinanceApplication & { nextAction?: ApplicationNextAction }, now: Date): NotificationDraft[] {
  let key: string | undefined;
  let priority: NotificationPriority = 'normal';
  if (a.nextAction?.type === 'PAY_VALUATION_FEE') {
    key = a.nextAction.feePaid ? 'notifApplicationValuationPaid' : 'notifApplicationValuationFee';
    priority = 'high';
  } else {
    switch (a.status) {
      case 'APPROVED':
        key = 'notifApplicationApproved';
        priority = 'high';
        break;
      case 'REFERRED':
        key = 'notifApplicationReferred';
        break;
      case 'DECLINED':
        key = 'notifApplicationDeclined';
        break;
      case 'LEASE_STARTED':
        key = 'notifApplicationLeaseStarted';
        break;
      case 'COMPLETED':
        key = 'notifApplicationCompleted';
        break;
    }
  }
  if (!key) return [];
  const period = a.nextAction?.type === 'PAY_VALUATION_FEE' ? `${a.status}-${a.nextAction.feePaid ? 'paid' : 'due'}` : a.status;
  return [
    draft('application_update', [a.id, period], {
      priority,
      link: `/applications/${a.id}`,
      occurredAt: a.updatedAt,
      messageKey: key,
      params: { product: { key: PRODUCT_KEY[a.productLine] }, monthly: { money: a.quote.monthlyFils } },
    }, now),
  ];
}

function cardRules(c: VirtualCard, now: Date): NotificationDraft[] {
  if (c.status !== 'ACTIVE') return [];
  return [
    draft('card_issued', [c.id], {
      priority: 'normal',
      link: '/account',
      occurredAt: c.issuedAt,
      messageKey: 'notifCardIssued',
      params: { card: { text: c.name }, last4: { text: c.last4 } },
    }, now),
  ];
}

function tradeInRules(o: TradeInOffer, today: string, now: Date): NotificationDraft[] {
  if (now.getTime() > Date.parse(o.expiresAt)) return [];
  const days = daysBetweenIso(today, o.validUntil);
  if (days < 0 || days > NOTIFICATION_RULES.tradeInExpiringDays) return [];
  const v = o.valuation.vehicle;
  return [
    draft('tradein_expiring', [o.id], {
      priority: 'high',
      link: '/trade-in',
      occurredAt: latest(bahrainDayStart(addDaysIso(o.validUntil, -NOTIFICATION_RULES.tradeInExpiringDays)), o.createdAt),
      messageKey: 'notifTradeInExpiring',
      params: { amount: { money: o.offerFils }, vehicle: { text: `${v.make} ${v.model} ${v.year}` }, date: { date: o.validUntil } },
    }, now),
  ];
}

function onboardingRules(s: NotificationSources, today: string, now: Date): NotificationDraft[] {
  const done = s.onboarding;
  if (!done) return [];
  const out: NotificationDraft[] = [];
  const validUntil = s.preApproval?.validUntil ?? done.result.preApproval.validUntil;
  const pa = expiryWindow(today, validUntil, NOTIFICATION_RULES.preApprovalExpiringDays, NOTIFICATION_RULES.expiredShownDays);
  if (pa) {
    out.push(
      draft('preapproval_expiring', [validUntil], {
        priority: 'normal',
        link: '/onboarding',
        occurredAt:
          pa === 'expired'
            ? bahrainDayStart(addDaysIso(validUntil, 1))
            : latest(bahrainDayStart(addDaysIso(validUntil, -NOTIFICATION_RULES.preApprovalExpiringDays)), done.completedAt),
        messageKey: pa === 'expired' ? 'notifPreApprovalExpired' : 'notifPreApprovalExpiring',
        params: { date: { date: validUntil } },
      }, now),
    );
  }
  // Consent expires at an instant; its last valid Bahrain day is the day of that instant.
  const consentLastDay = bahrainToday(new Date(Date.parse(done.result.consent.expiresAt) - 1));
  const cw = expiryWindow(today, consentLastDay, NOTIFICATION_RULES.consentExpiringDays, NOTIFICATION_RULES.expiredShownDays);
  if (cw) {
    out.push(
      draft('consent_expiring', [consentLastDay], {
        priority: 'normal',
        link: '/onboarding',
        occurredAt:
          cw === 'expired'
            ? done.result.consent.expiresAt
            : latest(bahrainDayStart(addDaysIso(consentLastDay, -NOTIFICATION_RULES.consentExpiringDays)), done.result.consent.grantedAt),
        messageKey: cw === 'expired' ? 'notifConsentExpired' : 'notifConsentExpiring',
        params: { date: { date: consentLastDay } },
      }, now),
    );
  }
  return out;
}

/**
 * Every notification that applies to this customer now. Pure: same sources and time → same list (same ids).
 * Not sorted; see notificationInbox.
 */
export function deriveNotifications(s: NotificationSources, now: Date = new Date()): NotificationDraft[] {
  const today = bahrainToday(now);
  const policies = s.policies ?? [];
  return [
    ...s.contracts.flatMap((c) => contractRules(c, today, now)),
    ...s.garage.flatMap((g) => garageRules(g, policies, today, now)),
    ...policies.flatMap((p) => policyRules(p, today, now)),
    ...(s.claims ?? []).flatMap((c) => claimRules(c, now)),
    ...(s.applications ?? []).flatMap((a) => applicationRules(a, now)),
    ...(s.cards ?? []).flatMap((c) => cardRules(c, now)),
    ...(s.tradeIn ? tradeInRules(s.tradeIn, today, now) : []),
    ...onboardingRules(s, today, now),
  ];
}

// ---- Text

/** Looks up a packages/i18n message (with {placeholder} interpolation); the API passes @sahel/i18n's `t`. */
export type NotificationText = (locale: Locale, key: string, vars: Record<string, string>) => string;

const DATE_LOCALE: Record<Locale, string> = { en: 'en-GB', ar: 'ar-BH-u-nu-latn' };

/** A Bahrain calendar date (YYYY-MM-DD) as the apps show it ("12 Oct 2026"). */
export function formatNotificationDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function formatParam(p: NotificationParam, locale: Locale, text: NotificationText): string {
  if ('money' in p) return formatBhd(p.money, locale);
  if ('date' in p) return formatNotificationDate(p.date, locale);
  if ('key' in p) return text(locale, p.key, {});
  return typeof p.text === 'string' ? p.text : p.text[locale];
}

export function localizeNotification(d: NotificationDraft, text: NotificationText): { title: Localized; body: Localized } {
  const one = (locale: Locale, part: 'Title' | 'Body') => {
    const vars = Object.fromEntries(Object.entries(d.params).map(([k, v]) => [k, formatParam(v, locale, text)]));
    return text(locale, `${d.messageKey}${part}`, vars);
  };
  return { title: { en: one('en', 'Title'), ar: one('ar', 'Title') }, body: { en: one('en', 'Body'), ar: one('ar', 'Body') } };
}

// ---- Preferences

export type ChannelSwitches = Record<NotificationChannel, boolean>;

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM", Bahrain time */
  start: string;
  end: string;
}

export interface NotificationPreferences {
  categories: Record<NotificationCategory, ChannelSwitches>;
  quietHours: QuietHours;
}

/** API representation (GET / PUT /me/notification-preferences). */
export interface NotificationPreferencesView {
  timeZone: typeof NOTIFICATION_TIME_ZONE;
  channels: NotificationChannel[];
  categories: { category: NotificationCategory; mandatory: boolean; channels: ChannelSwitches }[];
  quietHours: QuietHours;
  /** Always true: nothing is sent in the prototype */
  sandbox: true;
}

const sw = (push: boolean, sms: boolean, whatsapp: boolean, email: boolean): ChannelSwitches => ({ push, sms, whatsapp, email });

/**
 * ⚠️ VERIFY (Product, Compliance): defaults. Push for everything; SMS for money that is due; email for documents
 * (policies, applications, claims, consent). WhatsApp is opt-in (off by default) pending PDPL consent wording.
 * Quiet hours 22:00–07:00 Bahrain time.
 */
export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    categories: {
      payments: sw(true, true, false, false),
      overdue: sw(true, true, false, false),
      insurance: sw(true, false, false, true),
      claims: sw(true, false, false, true),
      applications: sw(true, false, false, true),
      cards: sw(true, false, false, false),
      vehicle: sw(true, false, false, false),
      account: sw(true, false, false, true),
    },
    quietHours: { enabled: true, start: '22:00', end: '07:00' },
  };
}

export function notificationPreferencesView(p: NotificationPreferences): NotificationPreferencesView {
  return {
    timeZone: NOTIFICATION_TIME_ZONE,
    channels: [...NOTIFICATION_CHANNELS],
    categories: NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      mandatory: MANDATORY_NOTIFICATION_CATEGORIES.includes(category),
      channels: { ...p.categories[category] },
    })),
    quietHours: { ...p.quietHours },
    sandbox: true,
  };
}

export type NotificationErrorCode = 'NOTIFICATION_NOT_FOUND' | 'INVALID_REQUEST' | 'MANDATORY_CATEGORY';

export const NOTIFICATION_ERROR_STATUS: Record<NotificationErrorCode, number> = {
  NOTIFICATION_NOT_FOUND: 404,
  INVALID_REQUEST: 422,
  MANDATORY_CATEGORY: 422,
};

export class NotificationError extends Error {
  constructor(
    public readonly code: NotificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationError';
  }
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Applies a PUT body to the current preferences. Every field is optional:
 * `{ categories?: [{ category, channels: { push?, sms?, whatsapp?, email? } }], quietHours?: { enabled?, start?, end? } }`.
 * Unknown categories or channels, non-booleans and bad times are INVALID_REQUEST; switching off every channel of a
 * mandatory category is MANDATORY_CATEGORY (nothing is changed then).
 */
export function updateNotificationPreferences(current: NotificationPreferences, input: unknown): NotificationPreferences {
  if (!isObject(input)) throw new NotificationError('INVALID_REQUEST', 'body must be an object');
  const next: NotificationPreferences = {
    categories: Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, { ...current.categories[c] }])) as NotificationPreferences['categories'],
    quietHours: { ...current.quietHours },
  };
  if (input.categories !== undefined) {
    if (!Array.isArray(input.categories)) throw new NotificationError('INVALID_REQUEST', 'categories must be an array');
    for (const entry of input.categories) {
      if (!isObject(entry) || !NOTIFICATION_CATEGORIES.includes(entry.category as NotificationCategory)) {
        throw new NotificationError('INVALID_REQUEST', `category must be one of ${NOTIFICATION_CATEGORIES.join(', ')}`);
      }
      if (!isObject(entry.channels)) throw new NotificationError('INVALID_REQUEST', 'channels must be an object');
      const target = next.categories[entry.category as NotificationCategory];
      for (const [ch, on] of Object.entries(entry.channels)) {
        if (!NOTIFICATION_CHANNELS.includes(ch as NotificationChannel)) {
          throw new NotificationError('INVALID_REQUEST', `channel must be one of ${NOTIFICATION_CHANNELS.join(', ')}`);
        }
        if (typeof on !== 'boolean') throw new NotificationError('INVALID_REQUEST', `${ch} must be a boolean`);
        target[ch as NotificationChannel] = on;
      }
    }
  }
  if (input.quietHours !== undefined) {
    const q = input.quietHours;
    if (!isObject(q)) throw new NotificationError('INVALID_REQUEST', 'quietHours must be an object');
    if (q.enabled !== undefined) {
      if (typeof q.enabled !== 'boolean') throw new NotificationError('INVALID_REQUEST', 'quietHours.enabled must be a boolean');
      next.quietHours.enabled = q.enabled;
    }
    for (const k of ['start', 'end'] as const) {
      if (q[k] === undefined) continue;
      if (typeof q[k] !== 'string' || !HHMM.test(q[k])) throw new NotificationError('INVALID_REQUEST', `quietHours.${k} must be HH:MM (24h)`);
      next.quietHours[k] = q[k];
    }
    if (next.quietHours.start === next.quietHours.end) throw new NotificationError('INVALID_REQUEST', 'quietHours.start and end must differ');
  }
  for (const c of MANDATORY_NOTIFICATION_CATEGORIES) {
    if (!NOTIFICATION_CHANNELS.some((ch) => next.categories[c][ch])) {
      throw new NotificationError('MANDATORY_CATEGORY', `${c} notifications are required: keep at least one channel on`);
    }
  }
  return next;
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * When quiet hours are on and `now` (Bahrain time) is inside them, the instant they end; otherwise undefined.
 * Windows may cross midnight (22:00–07:00).
 */
export function quietHoursEnd(q: QuietHours, now: Date): string | undefined {
  if (!q.enabled) return undefined;
  const local = new Date(now.getTime() + BAHRAIN_OFFSET_MIN * 60_000);
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  const start = minutesOf(q.start);
  const end = minutesOf(q.end);
  const inside = start < end ? m >= start && m < end : m >= start || m < end;
  if (!inside) return undefined;
  const today = bahrainToday(now);
  const endDay = m < end ? today : addDaysIso(today, 1);
  return new Date(`${endDay}T${q.end}:00${BAHRAIN_OFFSET}`).toISOString();
}

// ---- Inbox

const PRIORITY_RANK: Record<NotificationPriority, number> = { high: 0, normal: 1, low: 2 };
const GROUP_RANK: Record<NotificationGroup, number> = { today: 0, week: 1, earlier: 2 };

export function notificationGroup(occurredAt: string, now: Date): NotificationGroup {
  const days = daysBetweenIso(bahrainToday(new Date(occurredAt)), bahrainToday(now));
  return days <= 0 ? 'today' : days <= 6 ? 'week' : 'earlier';
}

/**
 * The customer's inbox: derived notifications minus the dismissed ones, with read state, localized text, group
 * (today / this week / earlier, Bahrain days) and the channels each would go out on. Sorted by group, then priority,
 * then newest first.
 */
export function notificationInbox(
  drafts: readonly NotificationDraft[],
  state: { isRead(id: string): boolean; isDismissed(id: string): boolean },
  prefs: NotificationPreferences,
  text: NotificationText,
  now: Date = new Date(),
): NotificationInbox {
  const deferredUntil = quietHoursEnd(prefs.quietHours, now);
  const items: AppNotification[] = drafts
    .filter((d) => !state.isDismissed(d.id))
    .map((d) => ({
      id: d.id,
      type: d.type,
      category: d.category,
      priority: d.priority,
      mandatory: MANDATORY_NOTIFICATION_CATEGORIES.includes(d.category),
      link: d.link,
      occurredAt: d.occurredAt,
      group: notificationGroup(d.occurredAt, now),
      read: state.isRead(d.id),
      ...localizeNotification(d, text),
      delivery: {
        channels: NOTIFICATION_CHANNELS.filter((ch) => prefs.categories[d.category][ch]),
        ...(deferredUntil ? { deferredUntil } : {}),
        sandbox: true as const,
      },
    }))
    .sort(
      (a, b) =>
        GROUP_RANK[a.group] - GROUP_RANK[b.group] ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
        a.id.localeCompare(b.id),
    );
  return { items, unreadCount: items.filter((i) => !i.read).length, total: items.length, timeZone: NOTIFICATION_TIME_ZONE };
}

/** Well-formed notification id (what deriveNotifications produces), so junk never reaches the store. */
export function isNotificationId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 200 && /^[a-z_]+(\.[A-Za-z0-9_-]+)+$/.test(id);
}

/**
 * ⚠️ Sandbox per-customer notification state, in memory: read and dismissed ids, and preferences. Nothing about the
 * notifications themselves is stored (they are re-derived on every read). Production: a notification-state table
 * keyed by customer, plus the messaging service's delivery log.
 */
export class SandboxNotificationStore {
  private readonly readIds = new Map<string, Set<string>>();
  private readonly dismissedIds = new Map<string, Set<string>>();
  private readonly prefs = new Map<string, NotificationPreferences>();

  /** This customer's read / dismissed view (for notificationInbox). */
  state(customerId: string): { isRead(id: string): boolean; isDismissed(id: string): boolean } {
    const read = this.readIds.get(customerId);
    const dismissed = this.dismissedIds.get(customerId);
    return { isRead: (id) => read?.has(id) ?? false, isDismissed: (id) => dismissed?.has(id) ?? false };
  }

  markRead(customerId: string, ids: readonly string[]): void {
    this.add(this.readIds, customerId, ids);
  }

  /** Dismissed notifications leave the inbox (and count as read). */
  dismiss(customerId: string, id: string): void {
    this.add(this.readIds, customerId, [id]);
    this.add(this.dismissedIds, customerId, [id]);
  }

  preferences(customerId: string): NotificationPreferences {
    return this.prefs.get(customerId) ?? defaultNotificationPreferences();
  }

  /** Validates and stores a PUT body (see updateNotificationPreferences). */
  updatePreferences(customerId: string, input: unknown): NotificationPreferences {
    const next = updateNotificationPreferences(this.preferences(customerId), input);
    this.prefs.set(customerId, next);
    return next;
  }

  private add(map: Map<string, Set<string>>, customerId: string, ids: readonly string[]): void {
    let set = map.get(customerId);
    if (!set) map.set(customerId, (set = new Set()));
    for (const id of ids) {
      set.delete(id);
      set.add(id);
    }
    // Insertion order: the oldest entries go first.
    for (const id of set) {
      if (set.size <= NOTIFICATION_RULES.maxStoredIdsPerCustomer) break;
      set.delete(id);
    }
  }
}
