import { describe, expect, it } from 'vitest';
import {
  bhd,
  buildSchedule,
  demoCustomer,
  maskVoucherCode,
  pointsForAmount,
  REWARDS_AUTOPAY_BONUS,
  REWARDS_CATALOGUE,
  REWARDS_EARN_RATES,
  REWARDS_LATE_INSTALLMENT_RATE,
  REWARDS_STREAK_BONUS,
  REWARDS_TIERS,
  REWARDS_WELCOME_CARD_BONUS,
  RewardsError,
  rewardsLedger,
  rewardsSummary,
  rewardsTier,
  SandboxRewardsStore,
  tierFor,
  type Contract,
  type Payment,
  type RewardsEntry,
  type RewardsState,
} from '../src';

const NOW = new Date(Date.UTC(2026, 9, 3, 9, 0));
const demo = demoCustomer(NOW);
const crv = demo.contracts.find((c) => c.id === 'c-1001')!;
const personal = demo.contracts.find((c) => c.id === 'c-1002')!;
const next = crv.nextInstallment!;

let seq = 0;
function payment(over: Partial<Payment> = {}): Payment {
  seq++;
  return {
    id: `pay_${seq}`,
    amountFils: next.amountFils,
    method: 'card',
    purpose: 'installment',
    reference: `c-1001-${next.number}`,
    idempotencyKey: `key-${seq}-xxxxxxxx`,
    status: 'CAPTURED',
    currency: 'BHD',
    createdAt: NOW.toISOString(),
    nextAction: 'none',
    ...over,
  };
}

const base: RewardsState = { openingPoints: demo.rewardsPoints, contracts: demo.contracts, payments: [], cards: [], policies: [] };
const state = (over: Partial<RewardsState> = {}): RewardsState => ({ ...base, ...over });
const ledger = (over: Partial<RewardsState> = {}) => rewardsLedger(state(over), NOW);
const byId = (entries: RewardsEntry[], id: string) => entries.find((e) => e.id === id);

describe('rewards earn rules (⚠️ placeholder rates)', () => {
  it('rounds points down per whole BHD and stays a safe integer', () => {
    expect(pointsForAmount(bhd(10), 10)).toBe(100);
    expect(pointsForAmount(1_999, 10)).toBe(19);
    expect(pointsForAmount(99, 10)).toBe(0);
    expect(pointsForAmount(0, 10)).toBe(0);
    expect(pointsForAmount(-5_000, 10)).toBe(0);
    const big = pointsForAmount(Number.MAX_SAFE_INTEGER, 10);
    expect(Number.isSafeInteger(big)).toBe(true);
  });

  it('opens with the demo balance, the good-payer history and autopay', () => {
    const s = rewardsSummary(state(), NOW);
    expect(s.openingBalance).toBe(12_480);
    const streaks = s.entries.filter((e) => e.source === 'good_payer_streak').map((e) => e.id).sort();
    // c-1001 has 14 installments paid (bonus at 6 and 12), c-1002 has 7 (bonus at 6)
    expect(streaks).toEqual(['streak:c-1001:12', 'streak:c-1001:6', 'streak:c-1002:6']);
    expect(byId(s.entries, 'autopay:c-1001')?.points).toBe(REWARDS_AUTOPAY_BONUS);
    expect(byId(s.entries, 'autopay:c-1002')).toBeUndefined();
    expect(s.balance).toBe(12_480 + 3 * REWARDS_STREAK_BONUS + REWARDS_AUTOPAY_BONUS);
    // The opening balance never counts towards the tier
    expect(s.tierPoints).toBe(3 * REWARDS_STREAK_BONUS + REWARDS_AUTOPAY_BONUS);
    expect(s.tier.id).toBe('silver');
    expect(s.entries[0]!.at >= s.entries.at(-1)!.at).toBe(true);
    for (const e of s.entries) expect(Number.isSafeInteger(e.points)).toBe(true);
  });

  it('earns the on-time rate for an installment paid by its due date, and the late rate after', () => {
    const onTime = byId(ledger({ payments: [payment({ id: 'p1' })] }), 'pay:p1')!;
    expect(onTime.onTime).toBe(true);
    expect(onTime.points).toBe(pointsForAmount(next.amountFils, REWARDS_EARN_RATES.installment));
    const lateAt = new Date(Date.parse(`${next.dueDate}T00:00:00Z`) + 2 * 86_400_000).toISOString();
    const late = byId(ledger({ payments: [payment({ id: 'p2', createdAt: lateAt })] }), 'pay:p2')!;
    expect(late.onTime).toBe(false);
    expect(late.points).toBe(pointsForAmount(next.amountFils, REWARDS_LATE_INSTALLMENT_RATE));
    expect(REWARDS_EARN_RATES.installment).toBeGreaterThan(Math.max(REWARDS_EARN_RATES.insurance_premium, REWARDS_EARN_RATES.valuation_fee, REWARDS_EARN_RATES.reservation_deposit));
  });

  it('earns once per installment, on at most the scheduled amount, and nothing for paid or unknown installments', () => {
    const entries = ledger({
      payments: [
        payment({ id: 'big', amountFils: next.amountFils * 100 }),
        payment({ id: 'again', createdAt: new Date(NOW.getTime() + 60_000).toISOString() }),
        payment({ id: 'old', reference: 'c-1001-3' }),
        payment({ id: 'unknown', reference: 'c-9999-1' }),
        payment({ id: 'beyond', reference: `c-1001-${crv.quote.tenureMonths + 1}` }),
      ],
    });
    expect(byId(entries, 'pay:big')!.points).toBe(pointsForAmount(next.amountFils, REWARDS_EARN_RATES.installment));
    for (const id of ['again', 'old', 'unknown', 'beyond']) expect(byId(entries, `pay:${id}`)).toBeUndefined();
  });

  it('turns a refunded payment into a reversal (net zero) that does not extend the streak', () => {
    const entries = ledger({ payments: [payment({ id: 'r1', status: 'REFUNDED' })] });
    const earn = byId(entries, 'pay:r1')!;
    const rev = byId(entries, 'rev:r1')!;
    expect(rev.kind).toBe('reversal');
    expect(rev.points).toBe(-earn.points);
    const s = rewardsSummary(state({ payments: [payment({ id: 'r1', status: 'REFUNDED' })] }), NOW);
    expect(s.balance).toBe(rewardsSummary(state(), NOW).balance);
    expect(s.totals.reversed).toBe(earn.points);
  });

  it('ignores payments that were not captured, and early settlements', () => {
    const entries = ledger({
      payments: [
        payment({ id: 'i', status: 'INITIATED' }),
        payment({ id: 'f', status: 'FAILED' }),
        payment({ id: 's', purpose: 'early_settlement', reference: 'c-1001-settle', amountFils: bhd(9_000) }),
      ],
    });
    expect(entries.filter((e) => e.source === 'payment')).toEqual([]);
  });

  it('earns on a premium only when it issued a policy, and once per deposit or valuation reference', () => {
    const premium = payment({ id: 'prem', purpose: 'insurance_premium', reference: 'pq_1', amountFils: bhd(200) });
    const orphan = payment({ id: 'orphan', purpose: 'insurance_premium', reference: 'pq_2', amountFils: bhd(200) });
    const dep1 = payment({ id: 'd1', purpose: 'reservation_deposit', reference: 'v-honda-crv-2026', amountFils: bhd(100) });
    const dep2 = payment({ id: 'd2', purpose: 'reservation_deposit', reference: 'v-honda-crv-2026', amountFils: bhd(100) });
    const val = payment({ id: 'v1', purpose: 'valuation_fee', reference: 'p-amwaj-apt-2br', amountFils: bhd(150) });
    const entries = ledger({ payments: [premium, orphan, dep1, dep2, val], policies: [{ paymentId: 'prem' }] });
    expect(byId(entries, 'pay:prem')!.points).toBe(200 * REWARDS_EARN_RATES.insurance_premium);
    expect(byId(entries, 'pay:orphan')).toBeUndefined();
    expect(byId(entries, 'pay:d1')!.points).toBe(100 * REWARDS_EARN_RATES.reservation_deposit);
    expect(byId(entries, 'pay:d2')).toBeUndefined();
    expect(byId(entries, 'pay:v1')!.points).toBe(150 * REWARDS_EARN_RATES.valuation_fee);
  });

  it('gives the welcome bonus once, on the first card', () => {
    const entries = ledger({ cards: [{ issuedAt: '2026-10-02T10:00:00.000Z' }, { issuedAt: '2026-09-01T10:00:00.000Z' }] });
    const welcome = entries.filter((e) => e.source === 'card_welcome');
    expect(welcome).toHaveLength(1);
    expect(welcome[0]!.points).toBe(REWARDS_WELCOME_CARD_BONUS);
    expect(welcome[0]!.at).toBe('2026-09-01T10:00:00.000Z');
  });

  it('pays the good-payer bonus at every 6th consecutive on-time installment; a late one resets the streak', () => {
    const fivePaid: Contract = { ...personal, installmentsPaid: 5 };
    const six = (createdAt: string) => payment({ id: `six-${createdAt}`, reference: 'c-1002-6', createdAt, amountFils: personal.quote.monthlyFils });
    const contracts = [crv, fivePaid];
    const due6 = buildSchedule(personal.quote, new Date(`${personal.startDate}T00:00:00Z`))[5]!.dueDate;
    const onTime = ledger({ contracts, payments: [six(`${due6}T06:00:00.000Z`)] });
    expect(byId(onTime, 'streak:c-1002:6')?.points).toBe(REWARDS_STREAK_BONUS);
    // Paid now, months after its due date: late, so no bonus
    expect(due6 < NOW.toISOString().slice(0, 10)).toBe(true);
    const late = ledger({ contracts, payments: [six(NOW.toISOString())] });
    expect(late.filter((e) => e.contractId === 'c-1002' && e.source === 'good_payer_streak')).toEqual([]);
  });

  it('keeps the autopay bonus once observed, even after autopay is turned off', () => {
    const off = demo.contracts.map((c) => ({ ...c, autopay: false }));
    expect(ledger({ contracts: off }).some((e) => e.source === 'autopay')).toBe(false);
    const kept = rewardsLedger({ ...state({ contracts: off }), observed: { 'autopay:c-1001': '2026-10-01T08:00:00.000Z' } }, NOW);
    expect(byId(kept, 'autopay:c-1001')?.at).toBe('2026-10-01T08:00:00.000Z');
  });
});

describe('rewards tiers (⚠️ placeholder thresholds)', () => {
  it('reaches a tier exactly at its threshold', () => {
    const [silver, gold, platinum] = REWARDS_TIERS;
    expect(tierFor(0).tier.id).toBe('silver');
    expect(tierFor(gold!.minPoints - 1).tier.id).toBe('silver');
    expect(tierFor(gold!.minPoints).tier.id).toBe('gold');
    expect(tierFor(platinum!.minPoints - 1).tier.id).toBe('gold');
    expect(tierFor(platinum!.minPoints).tier.id).toBe('platinum');
    expect(tierFor(platinum!.minPoints * 10)).toMatchObject({ nextTier: null, pointsToNextTier: 0, progressPct: 100 });
    expect(tierFor(gold!.minPoints / 2)).toMatchObject({ tier: silver, nextTier: gold, pointsToNextTier: gold!.minPoints / 2, progressPct: 50 });
  });

  it('counts the last 12 months only (Bahrain dates), without the opening balance or redemptions', () => {
    const e = (id: string, at: string, points: number, kind: RewardsEntry['kind'] = 'earn'): RewardsEntry => ({
      id,
      kind,
      source: 'payment',
      points,
      at,
      title: { en: id, ar: id },
    });
    const t = rewardsTier(
      [
        e('in', '2025-10-04T00:00:00.000Z', 100), // first day of the window (Bahrain 2025-10-04)
        e('out', '2025-10-03T20:00:00.000Z', 1_000), // Bahrain 2025-10-03 23:00: outside
        e('opening', '2026-10-01T00:00:00.000Z', 50_000, 'opening'),
        e('burn', '2026-10-01T00:00:00.000Z', -2_000, 'burn'),
        e('rev', '2026-10-01T00:00:00.000Z', -40, 'reversal'),
      ],
      NOW,
    );
    expect(t.windowFrom).toBe('2025-10-04');
    expect(t.tierPoints).toBe(60);
  });

  it('moves the demo customer to Gold after an on-time installment', () => {
    const before = rewardsSummary(state(), NOW);
    const after = rewardsSummary(state({ payments: [payment()] }), NOW);
    expect(before.tier.id).toBe('silver');
    expect(after.tier.id).toBe('gold');
    expect(after.balance - before.balance).toBe(pointsForAmount(next.amountFils, REWARDS_EARN_RATES.installment));
  });
});

describe('SandboxRewardsStore (redemptions)', () => {
  const codes = ['IMZ-AAAA-BBBB-CC01', 'IMZ-AAAA-BBBB-CC02', 'IMZ-AAAA-BBBB-CC03', 'IMZ-AAAA-BBBB-CC04'];
  const store = () => {
    let i = 0;
    return new SandboxRewardsStore(() => NOW, () => codes[i++ % codes.length]!);
  };
  const fuel = REWARDS_CATALOGUE.find((i) => i.id === 'fuel-5')!;
  const err = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e as RewardsError;
    }
    throw new Error('expected an error');
  };

  it('issues a voucher, takes the cost off the balance and lists it masked', () => {
    const s = store();
    const start = s.summary('a', state()).balance;
    const r = s.redeem('a', state(), { itemId: fuel.id, idempotencyKey: 'redeem-0001' });
    expect(r.replayed).toBe(false);
    expect(r.balance).toBe(start - fuel.pointsCost);
    expect(r.redemption.code).toBe(codes[0]);
    expect(r.redemption.codeMasked).toBe('IMZ-••••-••••-CC01');
    expect(r.redemption.expiresOn).toBe('2026-11-02');
    const [listed] = s.list('a');
    expect(listed).not.toHaveProperty('code');
    expect(listed!.codeMasked.endsWith('CC01')).toBe(true);
    expect(JSON.stringify(s.list('a'))).not.toContain(codes[0]);
    const burn = s.summary('a', state()).entries.find((e) => e.kind === 'burn')!;
    expect(burn.points).toBe(-fuel.pointsCost);
  });

  it('is idempotent per Idempotency-Key, and refuses the key for another item', () => {
    const s = store();
    const a = s.redeem('a', state(), { itemId: fuel.id, idempotencyKey: 'redeem-0001' });
    const b = s.redeem('a', state(), { itemId: fuel.id, idempotencyKey: 'redeem-0001' });
    expect(b.replayed).toBe(true);
    expect(b.redemption).toEqual(a.redemption);
    expect(b.balance).toBe(a.balance);
    expect(s.list('a')).toHaveLength(1);
    expect(err(() => s.redeem('a', state(), { itemId: 'partner-coffee', idempotencyKey: 'redeem-0001' })).code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('refuses an insufficient balance (422), an unknown item (404) and a missing key (400)', () => {
    const s = store();
    const poor = state({ openingPoints: 100, contracts: [] });
    const e = err(() => s.redeem('a', poor, { itemId: fuel.id, idempotencyKey: 'redeem-0002' }));
    expect(e.code).toBe('INSUFFICIENT_POINTS');
    expect(s.list('a')).toEqual([]);
    expect(err(() => s.redeem('a', state(), { itemId: 'nope', idempotencyKey: 'redeem-0003' })).code).toBe('ITEM_NOT_FOUND');
    expect(err(() => s.redeem('a', state(), { itemId: fuel.id })).code).toBe('INVALID_REQUEST');
    expect(err(() => s.redeem('a', state(), { itemId: fuel.id, idempotencyKey: 'short' })).code).toBe('INVALID_REQUEST');
  });

  it('never spends below zero', () => {
    const s = store();
    const exact = state({ openingPoints: fuel.pointsCost, contracts: [] });
    expect(s.redeem('a', exact, { itemId: fuel.id, idempotencyKey: 'redeem-0004' }).balance).toBe(0);
    expect(err(() => s.redeem('a', exact, { itemId: fuel.id, idempotencyKey: 'redeem-0005' })).code).toBe('INSUFFICIENT_POINTS');
  });

  it('keeps every customer separate (redemptions, keys and balances)', () => {
    const s = store();
    s.redeem('a', state(), { itemId: fuel.id, idempotencyKey: 'shared-key-1' });
    expect(s.list('b')).toEqual([]);
    expect(s.summary('b', state()).balance).toBe(rewardsSummary(state(), NOW).balance);
    const b = s.redeem('b', state(), { itemId: 'partner-coffee', idempotencyKey: 'shared-key-1' });
    expect(b.replayed).toBe(false);
    expect(s.list('a').map((r) => r.itemId)).toEqual([fuel.id]);
    expect(s.list('b').map((r) => r.itemId)).toEqual(['partner-coffee']);
  });

  it('marks affordable catalogue items and remembers the autopay bonus', () => {
    const s = store();
    const cat = s.catalogue('a', state({ openingPoints: 1_000, contracts: [] }));
    expect(cat.items.find((i) => i.id === 'partner-coffee')!.affordable).toBe(true);
    expect(cat.items.find((i) => i.id === 'fuel-5')!.affordable).toBe(false);
    expect(REWARDS_CATALOGUE.filter((i) => i.demoPartner).length).toBeGreaterThan(0);
    s.summary('a', state());
    const off = demo.contracts.map((c) => ({ ...c, autopay: false }));
    expect(s.summary('a', state({ contracts: off })).entries.some((e) => e.id === 'autopay:c-1001')).toBe(true);
    expect(s.summary('b', state({ contracts: off })).entries.some((e) => e.id === 'autopay:c-1001')).toBe(false);
  });

  it('masks all but the last 4 characters', () => {
    expect(maskVoucherCode('IMZ-7KQ2-ABCD-9XYZ')).toBe('IMZ-••••-••••-9XYZ');
  });
});
