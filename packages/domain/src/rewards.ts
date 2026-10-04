import type { Fils } from './money';
import { bhd } from './money';
import { buildSchedule, type Contract } from './account';
import { addDaysIso, bahrainToday } from './insurance-common';
import type { Payment, PaymentPurpose } from './payments';
import type { Localized } from './types';

/**
 * IMTIAZ Points Everywhere (crazy ideas #13 unified rewards and #21 good-payer rewards).
 *
 * ⚠️ SANDBOX. Every earn and burn rate, bonus, tier threshold and catalogue item below is a PLACEHOLDER pending BCFC
 * Cards / Marketing and Finance sign-off; partners marked `demoPartner` are fictional or have no agreement.
 *
 * Points are DERIVED, never written by the payment flow: `rewardsLedger()` is a pure function of what the customer
 * already has (captured payments, issued cards, policies, contract history with autopay) plus their redemptions.
 * Recomputing it gives the same ledger, so nothing can be earned twice and a refund simply turns into a reversal.
 * Points are integers (safe ints); money is integer fils.
 *
 * Earn rules, in order:
 * 1. Opening balance: the points the customer already had (the demo account's `rewardsPoints`), dated at the start
 *    of their oldest contract. It never counts towards the tier.
 * 2. Captured payments, points per whole BHD (`REWARDS_EARN_RATES`, rounded down to the point):
 *    - installment `{contractId}-{n}` of one of the customer's contracts, not already paid in the contract history:
 *      on time (paid on or before its due date, Bahrain dates) earns the on-time rate, late the late rate. Only the
 *      first payment per installment earns, and on at most the scheduled installment amount;
 *    - insurance premium: only when the payment issued a policy (a payment that never became a policy earns nothing);
 *    - valuation fee and reservation deposit: once per reference (paying again for the same listing earns nothing);
 *    - early settlement earns nothing.
 * 3. Refunded payments: the earn stays in the history and a reversal of the same points is added (net zero).
 * 4. Welcome bonus: once, when the customer's first IMTIAZ card is issued.
 * 5. Autopay bonus: once per contract, the first time autopay is seen on (it stays when autopay is turned off later,
 *    so toggling cannot earn it twice). Its date is when the store first saw it.
 * 6. Good payer: a bonus at every `REWARDS_STREAK_LENGTH` consecutive on-time installments of a contract. The demo
 *    contract history counts as paid on the due dates; a late installment resets the streak.
 * Burn: each redemption takes its catalogue cost off the balance, never below zero (422 INSUFFICIENT_POINTS).
 * Tier: points earned in the last 12 months (Bahrain dates; earns and bonuses minus reversals, not the opening
 * balance or redemptions) against `REWARDS_TIERS`.
 */

/** ⚠️ Placeholder points per whole BHD, by payment purpose. Installments: the on-time rate. */
export const REWARDS_EARN_RATES: Record<PaymentPurpose, number> = {
  installment: 10,
  insurance_premium: 5,
  valuation_fee: 3,
  reservation_deposit: 2,
  early_settlement: 0,
};
/** ⚠️ Placeholder points per BHD for an installment paid after its due date. */
export const REWARDS_LATE_INSTALLMENT_RATE = 2;
/** ⚠️ Placeholder bonuses. */
export const REWARDS_WELCOME_CARD_BONUS = 2_000;
export const REWARDS_AUTOPAY_BONUS = 500;
export const REWARDS_STREAK_LENGTH = 6;
export const REWARDS_STREAK_BONUS = 1_000;
/** The tier counts points earned in this many Bahrain days, today included (12 months). */
export const REWARDS_TIER_WINDOW_DAYS = 365;
/** Sandbox cap on stored redemptions per customer (memory). */
export const REWARDS_MAX_REDEMPTIONS = 100;

export type RewardsTierId = 'silver' | 'gold' | 'platinum';

export interface RewardsTier {
  id: RewardsTierId;
  name: Localized;
  /** Points earned in the last 12 months needed for this tier */
  minPoints: number;
}

/** ⚠️ Placeholder thresholds, lowest first. */
export const REWARDS_TIERS: readonly RewardsTier[] = [
  { id: 'silver', name: { en: 'Silver', ar: 'فضي' }, minPoints: 0 },
  { id: 'gold', name: { en: 'Gold', ar: 'ذهبي' }, minPoints: 5_000 },
  { id: 'platinum', name: { en: 'Platinum', ar: 'بلاتيني' }, minPoints: 15_000 },
];

export type RewardItemCategory = 'service' | 'fuel' | 'installment' | 'insurance' | 'partner';

export interface RewardItem {
  id: string;
  category: RewardItemCategory;
  name: Localized;
  partner: Localized;
  description: Localized;
  pointsCost: number;
  /** Face value, when the voucher is worth a fixed amount */
  valueFils?: Fils;
  /** The voucher is valid this many Bahrain calendar days after the day it is issued */
  validityDays: number;
  /** ⚠️ true: fictional partner, or no partner agreement yet */
  demoPartner: boolean;
}

/** ⚠️ Placeholder redemption catalogue (IMTIAZ Offers style). */
export const REWARDS_CATALOGUE: readonly RewardItem[] = [
  {
    id: 'installment-credit-10',
    category: 'installment',
    name: { en: 'BHD 10 off your next installment', ar: 'خصم 10 د.ب من قسطك القادم' },
    partner: { en: 'BCFC', ar: 'البحرين للتسهيلات التجارية' },
    description: {
      en: 'A credit voucher applied to your next installment.',
      ar: 'قسيمة رصيد تُطبَّق على قسطك القادم.',
    },
    pointsCost: 2_200,
    valueFils: bhd(10),
    validityDays: 60,
    demoPartner: false,
  },
  {
    id: 'nmc-service-10',
    category: 'service',
    name: { en: 'BHD 10 service voucher', ar: 'قسيمة صيانة بقيمة 10 د.ب' },
    partner: { en: 'NMC service centre', ar: 'مركز خدمة NMC' },
    description: { en: 'Towards a scheduled service of your car.', ar: 'لصيانة سيارتك الدورية.' },
    pointsCost: 2_500,
    valueFils: bhd(10),
    validityDays: 90,
    demoPartner: true,
  },
  {
    id: 'fuel-5',
    category: 'fuel',
    name: { en: 'BHD 5 fuel voucher', ar: 'قسيمة وقود بقيمة 5 د.ب' },
    partner: { en: 'Demo fuel stations', ar: 'محطات وقود تجريبية' },
    description: { en: 'Fill up at any participating station.', ar: 'للتزود بالوقود في أي محطة مشاركة.' },
    pointsCost: 1_500,
    valueFils: bhd(5),
    validityDays: 30,
    demoPartner: true,
  },
  {
    id: 'takaful-15',
    category: 'insurance',
    name: { en: 'BHD 15 off a Takaful premium', ar: 'خصم 15 د.ب من قسط تكافل' },
    partner: { en: 'Tasheelat Insurance', ar: 'تسهيلات للتأمين' },
    description: { en: 'On your next motor, travel or home Takaful policy.', ar: 'على وثيقة التكافل القادمة للسيارة أو السفر أو المنزل.' },
    pointsCost: 3_000,
    valueFils: bhd(15),
    validityDays: 90,
    demoPartner: false,
  },
  {
    id: 'partner-coffee',
    category: 'partner',
    name: { en: 'Two coffees', ar: 'كوبان من القهوة' },
    partner: { en: 'Qahwat Al Fareej (demo)', ar: 'قهوة الفريج (تجريبي)' },
    description: { en: 'Any two hot or iced coffees.', ar: 'أي كوبين من القهوة الساخنة أو الباردة.' },
    pointsCost: 800,
    validityDays: 30,
    demoPartner: true,
  },
  {
    id: 'partner-dining-20',
    category: 'partner',
    name: { en: '20% off dinner', ar: 'خصم 20% على العشاء' },
    partner: { en: 'Dar Al Saffron (demo)', ar: 'دار الزعفران (تجريبي)' },
    description: { en: 'On the total bill, up to 4 guests.', ar: 'على إجمالي الفاتورة، حتى 4 أشخاص.' },
    pointsCost: 1_000,
    validityDays: 60,
    demoPartner: true,
  },
  {
    id: 'partner-cinema',
    category: 'partner',
    name: { en: 'Two cinema tickets', ar: 'تذكرتا سينما' },
    partner: { en: 'Muharraq Moon Cinema (demo)', ar: 'سينما قمر المحرق (تجريبي)' },
    description: { en: 'Standard seats, any show.', ar: 'مقاعد عادية، أي عرض.' },
    pointsCost: 1_800,
    validityDays: 60,
    demoPartner: true,
  },
];

export function findRewardItem(id: string): RewardItem | undefined {
  return REWARDS_CATALOGUE.find((i) => i.id === id);
}

export type RewardsEntryKind = 'opening' | 'earn' | 'bonus' | 'reversal' | 'burn';
export type RewardsEntrySource = 'opening_balance' | 'payment' | 'card_welcome' | 'autopay' | 'good_payer_streak' | 'refund' | 'redemption';

export interface RewardsEntry {
  /** Stable: recomputing the ledger gives the same ids */
  id: string;
  kind: RewardsEntryKind;
  source: RewardsEntrySource;
  /** Signed: burns and reversals are negative */
  points: number;
  /** ISO date-time */
  at: string;
  title: Localized;
  purpose?: PaymentPurpose;
  paymentId?: string;
  reference?: string;
  contractId?: string;
  redemptionId?: string;
  /** Installments: paid on or before the due date */
  onTime?: boolean;
}

/** A redemption as the ledger needs it. */
export interface RewardsBurn {
  id: string;
  itemId: string;
  itemName: Localized;
  pointsCost: number;
  createdAt: string;
}

/** Everything the ledger is derived from. */
export interface RewardsInput {
  /** Points carried over (the demo account's rewardsPoints) */
  openingPoints: number;
  contracts: readonly Contract[];
  /** This customer's payments (any status; only CAPTURED and REFUNDED count) */
  payments: readonly Payment[];
  /** Issued IMTIAZ cards */
  cards: readonly { issuedAt: string }[];
  /** Issued policies (the payment that bought each) */
  policies: readonly { paymentId: string }[];
  redemptions?: readonly RewardsBurn[];
  /** Entry id → when it was first seen, for entries with no date of their own (autopay); also keeps them earned */
  observed?: Readonly<Record<string, string>>;
}

/** Points for `amountFils` at `perBhd` points per whole BHD, rounded down (safe for any safe-integer amount). */
export function pointsForAmount(amountFils: Fils, perBhd: number): number {
  if (!Number.isSafeInteger(amountFils) || amountFils <= 0 || perBhd <= 0) return 0;
  return Math.floor(amountFils / 1_000) * perBhd + Math.floor(((amountFils % 1_000) * perBhd) / 1_000);
}

const PURPOSE_TITLE: Record<PaymentPurpose, Localized> = {
  installment: { en: 'Installment paid', ar: 'دفع قسط' },
  insurance_premium: { en: 'Insurance premium', ar: 'قسط تأمين' },
  valuation_fee: { en: 'Property valuation fee', ar: 'رسوم تقييم عقار' },
  reservation_deposit: { en: 'Car reservation deposit', ar: 'عربون حجز سيارة' },
  early_settlement: { en: 'Early settlement', ar: 'سداد مبكر' },
};

function startOfDayIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/** Bahrain calendar date of an ISO timestamp. */
function bahrainDate(at: string): string {
  return bahrainToday(new Date(at));
}

interface StreakStep {
  n: number;
  onTime: boolean;
  at: string;
}

/** The pure ledger: every entry derived from the input, oldest first (ties by id). */
export function rewardsLedger(input: RewardsInput, now: Date = new Date()): RewardsEntry[] {
  const out: RewardsEntry[] = [];
  const nowIso = now.toISOString();
  const observed = input.observed ?? {};

  // 1. Opening balance
  if (input.openingPoints > 0) {
    const oldest = [...input.contracts].map((c) => c.startDate).sort()[0];
    out.push({
      id: 'opening',
      kind: 'opening',
      source: 'opening_balance',
      points: Math.floor(input.openingPoints),
      at: oldest ? startOfDayIso(oldest) : nowIso,
      title: { en: 'Opening balance', ar: 'الرصيد الافتتاحي' },
    });
  }

  // 2 + 3. Captured (and refunded) payments, oldest first
  const policyPayments = new Set(input.policies.map((p) => p.paymentId));
  const earnedRefs = new Set<string>();
  const streakSteps = new Map<string, StreakStep[]>();
  const counted = [...input.payments]
    .filter((p) => p.status === 'CAPTURED' || p.status === 'REFUNDED')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const p of counted) {
    let points = 0;
    let onTime: boolean | undefined;
    let contractId: string | undefined;
    let title = PURPOSE_TITLE[p.purpose];
    if (p.purpose === 'installment') {
      const inst = installmentOf(p.reference, input.contracts);
      const key = `installment:${p.reference}`;
      if (!inst || earnedRefs.has(key)) continue;
      earnedRefs.add(key);
      onTime = bahrainDate(p.createdAt) <= inst.dueDate;
      contractId = inst.contract.id;
      points = pointsForAmount(Math.min(p.amountFils, inst.amountFils), onTime ? REWARDS_EARN_RATES.installment : REWARDS_LATE_INSTALLMENT_RATE);
      title = onTime
        ? { en: `Installment ${inst.n} paid on time: ${inst.contract.title.en}`, ar: `قسط ${inst.n} مدفوع في موعده: ${inst.contract.title.ar}` }
        : { en: `Installment ${inst.n} paid late: ${inst.contract.title.en}`, ar: `قسط ${inst.n} مدفوع متأخرًا: ${inst.contract.title.ar}` };
      if (p.status === 'CAPTURED') {
        const steps = streakSteps.get(inst.contract.id) ?? [];
        steps.push({ n: inst.n, onTime, at: p.createdAt });
        streakSteps.set(inst.contract.id, steps);
      }
    } else if (p.purpose === 'insurance_premium') {
      if (!policyPayments.has(p.id)) continue;
      points = pointsForAmount(p.amountFils, REWARDS_EARN_RATES.insurance_premium);
    } else {
      const key = `${p.purpose}:${p.reference}`;
      if (earnedRefs.has(key)) continue;
      earnedRefs.add(key);
      points = pointsForAmount(p.amountFils, REWARDS_EARN_RATES[p.purpose]);
    }
    if (points <= 0) continue;
    const common = { purpose: p.purpose, paymentId: p.id, reference: p.reference, ...(contractId ? { contractId } : {}) };
    out.push({ id: `pay:${p.id}`, kind: 'earn', source: 'payment', points, at: p.createdAt, title, ...common, ...(onTime !== undefined ? { onTime } : {}) });
    if (p.status === 'REFUNDED') {
      out.push({
        id: `rev:${p.id}`,
        kind: 'reversal',
        source: 'refund',
        points: -points,
        at: p.createdAt,
        title: { en: `Reversed (refunded): ${title.en}`, ar: `عكس (مبلغ مسترد): ${title.ar}` },
        ...common,
      });
    }
  }

  // 4. Welcome bonus on the first card
  const firstCard = [...input.cards].map((c) => c.issuedAt).sort()[0];
  if (firstCard) {
    out.push({
      id: 'card:welcome',
      kind: 'bonus',
      source: 'card_welcome',
      points: REWARDS_WELCOME_CARD_BONUS,
      at: firstCard,
      title: { en: 'Welcome bonus: your first IMTIAZ card', ar: 'مكافأة ترحيبية: أول بطاقة امتياز' },
    });
  }

  for (const c of input.contracts) {
    // 5. Autopay, once per contract (sticky once observed)
    const autopayId = `autopay:${c.id}`;
    if (c.autopay || observed[autopayId]) {
      out.push({
        id: autopayId,
        kind: 'bonus',
        source: 'autopay',
        points: REWARDS_AUTOPAY_BONUS,
        at: observed[autopayId] ?? nowIso,
        title: { en: `Autopay bonus: ${c.title.en}`, ar: `مكافأة الدفع التلقائي: ${c.title.ar}` },
        contractId: c.id,
      });
    }
    // 6. Good payer streaks: contract history (paid on the due dates), then this customer's installment payments
    const schedule = scheduleOf(c);
    const steps: StreakStep[] = [];
    for (let n = 1; n <= c.installmentsPaid && n <= schedule.length; n++) {
      steps.push({ n, onTime: true, at: startOfDayIso(schedule[n - 1]!.dueDate) });
    }
    steps.push(...(streakSteps.get(c.id) ?? []).sort((a, b) => a.n - b.n));
    let streak = 0;
    for (const s of steps) {
      streak = s.onTime ? streak + 1 : 0;
      if (streak > 0 && streak % REWARDS_STREAK_LENGTH === 0) {
        out.push({
          id: `streak:${c.id}:${s.n}`,
          kind: 'bonus',
          source: 'good_payer_streak',
          points: REWARDS_STREAK_BONUS,
          at: s.at,
          title: {
            en: `Good payer: ${streak} on-time installments in a row (${c.title.en})`,
            ar: `دافع ملتزم: ${streak} أقساط متتالية في موعدها (${c.title.ar})`,
          },
          contractId: c.id,
        });
      }
    }
  }

  // Burns
  for (const r of input.redemptions ?? []) {
    out.push({
      id: `burn:${r.id}`,
      kind: 'burn',
      source: 'redemption',
      points: -r.pointsCost,
      at: r.createdAt,
      title: { en: `Redeemed: ${r.itemName.en}`, ar: `استبدال: ${r.itemName.ar}` },
      redemptionId: r.id,
    });
  }

  return out.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

function scheduleOf(c: Contract) {
  return buildSchedule(c.quote, new Date(startOfDayIso(c.startDate)), 0, new Date(0));
}

/** The installment a payment reference `{contractId}-{n}` names, if it is not already paid in the contract history. */
function installmentOf(reference: string, contracts: readonly Contract[]) {
  const m = /^(.+)-(\d+)$/.exec(reference);
  if (!m) return undefined;
  const contract = contracts.find((c) => c.id === m[1]);
  const n = Number(m[2]);
  if (!contract || !Number.isSafeInteger(n) || n <= contract.installmentsPaid) return undefined;
  const inst = scheduleOf(contract)[n - 1];
  return inst ? { contract, n, dueDate: inst.dueDate, amountFils: inst.amountFils } : undefined;
}

export interface RewardsEarnRule {
  id: string;
  title: Localized;
  /** Points per whole BHD (payments) */
  pointsPerBhd?: number;
  /** Fixed points (bonuses) */
  points?: number;
}

/** The earn rules as the apps show them ("How you earn"); the values are the constants above. */
export function rewardsEarnRules(): RewardsEarnRule[] {
  return [
    { id: 'installment_on_time', title: { en: 'Installment paid on time', ar: 'قسط مدفوع في موعده' }, pointsPerBhd: REWARDS_EARN_RATES.installment },
    { id: 'installment_late', title: { en: 'Installment paid late', ar: 'قسط مدفوع متأخرًا' }, pointsPerBhd: REWARDS_LATE_INSTALLMENT_RATE },
    { id: 'insurance_premium', title: { en: 'Insurance premium (policy issued)', ar: 'قسط تأمين (بعد إصدار الوثيقة)' }, pointsPerBhd: REWARDS_EARN_RATES.insurance_premium },
    { id: 'valuation_fee', title: PURPOSE_TITLE.valuation_fee, pointsPerBhd: REWARDS_EARN_RATES.valuation_fee },
    { id: 'reservation_deposit', title: PURPOSE_TITLE.reservation_deposit, pointsPerBhd: REWARDS_EARN_RATES.reservation_deposit },
    { id: 'card_welcome', title: { en: 'First IMTIAZ card', ar: 'أول بطاقة امتياز' }, points: REWARDS_WELCOME_CARD_BONUS },
    { id: 'autopay', title: { en: 'Autopay turned on (per contract)', ar: 'تفعيل الدفع التلقائي (لكل عقد)' }, points: REWARDS_AUTOPAY_BONUS },
    {
      id: 'good_payer_streak',
      title: { en: `Every ${REWARDS_STREAK_LENGTH} on-time installments in a row`, ar: `كل ${REWARDS_STREAK_LENGTH} أقساط متتالية في موعدها` },
      points: REWARDS_STREAK_BONUS,
    },
  ];
}

export interface RewardsTierStatus {
  tier: RewardsTier;
  nextTier: RewardsTier | null;
  /** Points earned in the 12-month window */
  tierPoints: number;
  /** First Bahrain date of the window */
  windowFrom: string;
  /** 0 at the top tier */
  pointsToNextTier: number;
  /** 0..100 towards the next tier (100 at the top tier) */
  progressPct: number;
}

/** Tier from the points earned in the last 12 months (earns, bonuses and reversals; not the opening balance or burns). */
export function rewardsTier(entries: readonly RewardsEntry[], now: Date = new Date()): RewardsTierStatus {
  const today = bahrainToday(now);
  const windowFrom = addDaysIso(today, -(REWARDS_TIER_WINDOW_DAYS - 1));
  const tierPoints = Math.max(
    0,
    entries
      .filter((e) => e.kind === 'earn' || e.kind === 'bonus' || e.kind === 'reversal')
      .filter((e) => {
        const d = bahrainDate(e.at);
        return d >= windowFrom && d <= today;
      })
      .reduce((s, e) => s + e.points, 0),
  );
  return tierFor(tierPoints, windowFrom);
}

/** The tier for a number of 12-month points (exactly the threshold reaches the tier). */
export function tierFor(tierPoints: number, windowFrom = ''): RewardsTierStatus {
  let i = 0;
  while (i + 1 < REWARDS_TIERS.length && tierPoints >= REWARDS_TIERS[i + 1]!.minPoints) i++;
  const tier = REWARDS_TIERS[i]!;
  const nextTier = REWARDS_TIERS[i + 1] ?? null;
  const pointsToNextTier = nextTier ? nextTier.minPoints - tierPoints : 0;
  const progressPct = nextTier ? Math.floor(((tierPoints - tier.minPoints) * 100) / (nextTier.minPoints - tier.minPoints)) : 100;
  return { tier, nextTier, tierPoints, windowFrom, pointsToNextTier, progressPct };
}

export interface RewardsSummary extends Omit<RewardsTierStatus, 'tier' | 'nextTier'> {
  balance: number;
  openingBalance: number;
  totals: { earned: number; reversed: number; burned: number };
  tier: RewardsTier;
  nextTier: RewardsTier | null;
  /** Newest first */
  entries: RewardsEntry[];
  earnRules: RewardsEarnRule[];
  sandbox: true;
}

/** Balance, tier and history (newest first) from the ledger. */
export function rewardsSummary(input: RewardsInput, now: Date = new Date()): RewardsSummary {
  const entries = rewardsLedger(input, now);
  const sum = (kinds: RewardsEntryKind[]) => entries.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.points, 0);
  return {
    balance: sum(['opening', 'earn', 'bonus', 'reversal', 'burn']),
    openingBalance: sum(['opening']),
    totals: { earned: sum(['earn', 'bonus']), reversed: -sum(['reversal']), burned: -sum(['burn']) },
    ...rewardsTier(entries, now),
    entries: [...entries].reverse(),
    earnRules: rewardsEarnRules(),
    sandbox: true,
  };
}

// --- Redemptions ---

export type RewardsErrorCode = 'INVALID_REQUEST' | 'ITEM_NOT_FOUND' | 'INSUFFICIENT_POINTS' | 'IDEMPOTENCY_KEY_REUSED' | 'TOO_MANY_REDEMPTIONS';

export const REWARDS_ERROR_STATUS: Record<RewardsErrorCode, number> = {
  INVALID_REQUEST: 400,
  ITEM_NOT_FOUND: 404,
  IDEMPOTENCY_KEY_REUSED: 409,
  INSUFFICIENT_POINTS: 422,
  TOO_MANY_REDEMPTIONS: 429,
};

export class RewardsError extends Error {
  constructor(
    public readonly code: RewardsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RewardsError';
  }
}

export interface RewardRedemption {
  id: string;
  itemId: string;
  category: RewardItemCategory;
  itemName: Localized;
  partner: Localized;
  pointsCost: number;
  valueFils?: Fils;
  /** Full voucher code: only in the POST response (lists carry `codeMasked` only) */
  code?: string;
  /** e.g. IMZ-••••-••••-7KQ2 */
  codeMasked: string;
  createdAt: string;
  /** Last valid Bahrain date */
  expiresOn: string;
  status: 'ISSUED';
  demoPartner: boolean;
}

/** Only the last 4 characters of a voucher code stay readable. */
export function maskVoucherCode(code: string): string {
  if (code.length <= 8) return code.slice(-4).padStart(code.length, '•');
  return code.slice(0, 4) + code.slice(4, -4).replace(/[A-Z0-9]/g, '•') + code.slice(-4);
}

const VOUCHER_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** IMZ-XXXX-XXXX-XXXX from the Web Crypto CSPRNG (32 symbols, so `% 32` has no bias). */
export function randomVoucherCode(): string {
  const bytes = new Uint8Array(12);
  (globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }).crypto.getRandomValues(bytes);
  const raw = [...bytes].map((b) => VOUCHER_ALPHABET[b % VOUCHER_ALPHABET.length]).join('');
  return `IMZ-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** What the store needs from the customer's current state (everything but redemptions and observations). */
export type RewardsState = Omit<RewardsInput, 'redemptions' | 'observed'>;

interface StoredRedemption extends RewardRedemption {
  code: string;
  idempotencyKey: string;
}

/**
 * ⚠️ Sandbox rewards store (in memory, lost on restart), per customer: redemptions (with their voucher codes) and when
 * undated bonuses (autopay) were first seen. Balances are always recomputed with rewardsLedger(). Production: the
 * loyalty platform's ledger, fed by core lending, cards and the payment webhooks.
 */
export class SandboxRewardsStore {
  private readonly redemptions = new Map<string, StoredRedemption[]>();
  private readonly byKey = new Map<string, StoredRedemption>();
  private readonly codes = new Set<string>();
  private readonly observed = new Map<string, Record<string, string>>();
  private seq = 0;

  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly generate: () => string = randomVoucherCode,
  ) {}

  private input(customerId: string, state: RewardsState): RewardsInput {
    return {
      ...state,
      redemptions: this.redemptions.get(customerId) ?? [],
      observed: this.observed.get(customerId) ?? {},
    };
  }

  /** Balance, tier and history. Remembers when undated bonuses were first seen (so their date and award stay). */
  summary(customerId: string, state: RewardsState): RewardsSummary {
    const s = rewardsSummary(this.input(customerId, state), this.clock());
    const seen = this.observed.get(customerId) ?? {};
    for (const e of s.entries) if (e.source === 'autopay' && !seen[e.id]) seen[e.id] = e.at;
    this.observed.set(customerId, seen);
    return s;
  }

  /** The catalogue with whether this customer's balance covers each item. */
  catalogue(customerId: string, state: RewardsState): { balance: number; items: (RewardItem & { affordable: boolean })[] } {
    const { balance } = this.summary(customerId, state);
    return { balance, items: REWARDS_CATALOGUE.map((i) => ({ ...i, affordable: balance >= i.pointsCost })) };
  }

  /**
   * Redeem an item: issues a voucher code and takes its cost off the balance. Idempotent per customer and key: the
   * same key returns the original redemption (`replayed`), with another item it is IDEMPOTENCY_KEY_REUSED.
   * ⚠️ "Pay part of the next installment" only issues a credit voucher; no payment or contract changes.
   */
  redeem(
    customerId: string,
    state: RewardsState,
    req: { itemId?: unknown; idempotencyKey?: unknown },
  ): { redemption: RewardRedemption; balance: number; replayed: boolean } {
    const { itemId, idempotencyKey } = req;
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new RewardsError('INVALID_REQUEST', 'Idempotency-Key is required (8 to 128 characters)');
    }
    if (typeof itemId !== 'string' || !itemId) throw new RewardsError('INVALID_REQUEST', 'itemId is required');
    const scoped = `${customerId}\u0000${idempotencyKey}`;
    const existing = this.byKey.get(scoped);
    if (existing) {
      if (existing.itemId !== itemId) throw new RewardsError('IDEMPOTENCY_KEY_REUSED', 'this Idempotency-Key was used for another item');
      return { redemption: publicRedemption(existing, true), balance: this.summary(customerId, state).balance, replayed: true };
    }
    const item = findRewardItem(itemId);
    if (!item) throw new RewardsError('ITEM_NOT_FOUND', `unknown reward ${itemId}`);
    const list = this.redemptions.get(customerId) ?? [];
    if (list.length >= REWARDS_MAX_REDEMPTIONS) throw new RewardsError('TOO_MANY_REDEMPTIONS', `sandbox limit of ${REWARDS_MAX_REDEMPTIONS} redemptions`);
    const { balance } = this.summary(customerId, state);
    if (balance < item.pointsCost) {
      throw new RewardsError('INSUFFICIENT_POINTS', `${item.pointsCost} points needed, balance is ${balance}`);
    }
    const now = this.clock();
    let code = this.generate();
    while (this.codes.has(code)) code = this.generate();
    this.codes.add(code);
    const r: StoredRedemption = {
      id: `rdm_sbx_${now.getTime().toString(36)}_${(++this.seq).toString(36)}`,
      itemId: item.id,
      category: item.category,
      itemName: item.name,
      partner: item.partner,
      pointsCost: item.pointsCost,
      ...(item.valueFils !== undefined ? { valueFils: item.valueFils } : {}),
      code,
      codeMasked: maskVoucherCode(code),
      createdAt: now.toISOString(),
      expiresOn: addDaysIso(bahrainToday(now), item.validityDays),
      status: 'ISSUED',
      demoPartner: item.demoPartner,
      idempotencyKey,
    };
    list.push(r);
    this.redemptions.set(customerId, list);
    this.byKey.set(scoped, r);
    return { redemption: publicRedemption(r, true), balance: this.summary(customerId, state).balance, replayed: false };
  }

  /** This customer's redemptions, newest first, codes masked. */
  list(customerId: string): RewardRedemption[] {
    return [...(this.redemptions.get(customerId) ?? [])].reverse().map((r) => publicRedemption(r, false));
  }
}

function publicRedemption(r: StoredRedemption, withCode: boolean): RewardRedemption {
  const { idempotencyKey: _key, code, ...rest } = r;
  return withCode ? { ...rest, code } : rest;
}
