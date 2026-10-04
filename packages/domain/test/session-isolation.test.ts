import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildLifeEventBundle,
  customerFinancials,
  customerOverview,
  demoPolicyHistory,
  findContract,
  newCustomerProfile,
  PolicyError,
  SandboxContractSettings,
  SandboxPaymentGateway,
  SandboxPolicyStore,
  settlementQuote,
  withOnboarding,
  type OnboardingPreApproval,
  type PolicyQuoteRequest,
} from '../src';

/**
 * Sandbox customer sessions (apps/web/lib/session.ts) give every session its own customer id. The stores the
 * insurance, settlement and life-event features use must keep those customers apart.
 */
const A = 'cus_sbx_alice';
const B = 'cus_sbx_bob';
const NOW = new Date(Date.UTC(2026, 9, 3, 9, 0));
const travel: PolicyQuoteRequest = {
  line: 'travel',
  insurerId: 'pearl-takaful',
  input: { region: 'gcc', tier: 'basic', startDate: '2026-10-10', endDate: '2026-10-16', adults: 1, children: 0 },
};

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as PolicyError).code;
  }
  return undefined;
}

describe('policies are per session customer', () => {
  // The sandbox payment gateway stamps payments with the real clock; pin it to NOW so the held quotes (24 h) are
  // still valid however long after NOW the suite runs.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterAll(() => vi.useRealTimers());
  function setup() {
    let t = NOW.getTime();
    const store = new SandboxPolicyStore(() => new Date((t += 1000)), (customerId) => [demoPolicyHistory(customerId)]);
    return { store, gateway: new SandboxPaymentGateway() };
  }

  async function buy(store: SandboxPolicyStore, gateway: SandboxPaymentGateway, customerId: string) {
    const q = store.createQuote(customerId, travel);
    const created = await gateway.createCharge(
      { amountFils: q.premiumFils, method: 'benefitpay', purpose: 'insurance_premium', reference: q.id, idempotencyKey: 'same-key' },
      customerId,
    );
    const paid = await gateway.confirm(created.id, customerId);
    return { q, paid };
  }

  it('each customer gets their own demo history and only sees their own policies', async () => {
    const { store, gateway } = setup();
    const { q, paid } = await buy(store, gateway, A);
    const policy = store.confirm(A, gateway.get(paid.id, A), q.id);
    expect(store.list(A).map((p) => p.id)).toEqual([policy.id, 'pol_demo_history_1']);
    expect(store.list(B).map((p) => p.id)).toEqual(['pol_demo_history_1']);
    expect(store.list(B).every((p) => p.customerId === B)).toBe(true);
    // A's history is still there after B's copy was added (seeded ids repeat across customers).
    expect(store.list(A).find((p) => p.id === 'pol_demo_history_1')!.customerId).toBe(A);
  });

  it("another customer cannot read a quote, nor bind or re-read a policy with someone else's payment", async () => {
    const { store, gateway } = setup();
    const { q, paid } = await buy(store, gateway, A);
    expect(store.getQuote(q.id, B)).toBeUndefined();
    expect(store.getQuote(q.id, A)?.id).toBe(q.id);
    // The session-scoped gateway hides A's payment from B, so B gets "unknown payment".
    expect(gateway.get(paid.id, B)).toBeUndefined();
    expect(code(() => store.confirm(B, gateway.get(paid.id, B), q.id))).toBe('PAYMENT_NOT_FOUND');
    // Even with the payment object, the quote belongs to A.
    expect(code(() => store.confirm(B, paid, q.id))).toBe('QUOTE_NOT_FOUND');
    store.confirm(A, gateway.get(paid.id, A), q.id);
    // Once bound, a replay by another customer does not return A's policy.
    expect(code(() => store.confirm(B, paid, q.id))).toBe('PAYMENT_NOT_FOUND');
    expect(store.list(B)).toHaveLength(1);
  });

  it('idempotency keys are per customer: the same key from two customers makes two payments', async () => {
    const { store, gateway } = setup();
    const a = await buy(store, gateway, A);
    const b = await buy(store, gateway, B);
    expect(a.paid.id).not.toBe(b.paid.id);
    expect(store.confirm(B, gateway.get(b.paid.id, B), b.q.id).customerId).toBe(B);
  });
});

describe('contracts (autopay, settlement) are per session customer', () => {
  it("one customer's autopay change does not touch another's", () => {
    const settings = new SandboxContractSettings();
    const a = customerOverview(newCustomerProfile(A), NOW);
    const b = customerOverview(newCustomerProfile(B), NOW);
    const contract = a.contracts[0]!;
    settings.setAutopay(a, contract.id, !contract.autopay);
    expect(findContract(settings.apply(a), contract.id).autopay).toBe(!contract.autopay);
    expect(findContract(settings.apply(b), contract.id).autopay).toBe(contract.autopay);
    // The settlement quote reads the same customer view.
    expect(settlementQuote(findContract(settings.apply(b), contract.id), NOW).contractId).toBe(contract.id);
  });
});

describe('life-event bundles use the session customer financials', () => {
  it('an onboarded customer is checked against their own DBR headroom', () => {
    const demo = newCustomerProfile(A);
    const result = { preApproval: customerOverview(demo, NOW).preApproval } as unknown as OnboardingPreApproval;
    const low = withOnboarding(newCustomerProfile(B), { monthlySalaryFils: 400_000, existingObligationsFils: 150_000 }, result, NOW);
    const demoBundle = buildLifeEventBundle('married', 'islamic', customerFinancials(demo, NOW), NOW);
    const lowBundle = buildLifeEventBundle('married', 'islamic', customerFinancials(low, NOW), NOW);
    expect(lowBundle.maxMonthlyFils).toBeLessThan(demoBundle.maxMonthlyFils);
    expect(lowBundle.verdict).toBe('over-budget');
  });
});
