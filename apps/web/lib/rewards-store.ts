import { REWARDS_ERROR_STATUS, RewardsError, SandboxRewardsStore, type CustomerView, type RewardsState } from '@sahel/domain';
import { cardIssuer, handleError, payments, problem } from '@/lib/api';
import { policyStore } from '@/lib/policy-store';

const g = globalThis as unknown as { __sahelRewards?: SandboxRewardsStore };

/**
 * ⚠️ Sandbox IMTIAZ points (in memory, lost on restart), per session customer: redemptions and voucher codes. Balances
 * are never stored: they are recomputed from what the customer already has (packages/domain/src/rewards.ts).
 */
export const rewardsStore = (g.__sahelRewards ??= new SandboxRewardsStore());

/**
 * What the points are derived from: the customer's opening balance and contracts (with autopay), payments, issued
 * cards and policies. Read-only: nothing here hooks into payment confirmation.
 */
export function rewardsState(customer: CustomerView): RewardsState {
  return {
    openingPoints: customer.rewardsPoints,
    contracts: customer.contracts,
    payments: payments.list(customer.customerId),
    cards: cardIssuer.list(customer.customerId),
    policies: policyStore.list(customer.customerId),
  };
}

/** handleError plus RewardsError (matched by name too: the store may come from another route's bundle). */
export function handleRewardsError(e: unknown) {
  if (e instanceof RewardsError || (e instanceof Error && e.name === 'RewardsError')) {
    const code = (e as RewardsError).code;
    return problem(REWARDS_ERROR_STATUS[code] ?? 422, code, e.message);
  }
  return handleError(e);
}
