import { demoCustomer, demoPolicyHistory, InsuranceQuoteError, POLICY_ERROR_STATUS, PolicyError, SandboxPolicyStore } from '@sahel/domain';
import { handleError, problem } from '@/lib/api';

const g = globalThis as unknown as { __sahelPolicies?: SandboxPolicyStore };

/** The signed-in customer (sandbox: the demo customer until eKey login exists). */
export const policyCustomerId = () => demoCustomer().customerId;

/** ⚠️ Sandbox insurance policies (in memory, lost on restart), standing in for the broker platform and insurer APIs. */
export const policyStore = (g.__sahelPolicies ??= (() => {
  const store = new SandboxPolicyStore();
  store.seed(demoPolicyHistory(policyCustomerId()));
  return store;
})());

/**
 * handleError plus the insurance errors. Matched by name too: the store lives on globalThis and may have been
 * created by another route's bundle, whose copy of the domain error classes is a different constructor.
 */
export function handleInsuranceError(e: unknown) {
  if (e instanceof InsuranceQuoteError || (e instanceof Error && e.name === 'InsuranceQuoteError')) {
    return problem(422, (e as InsuranceQuoteError).code, e.message);
  }
  if (e instanceof PolicyError || (e instanceof Error && e.name === 'PolicyError')) {
    const code = (e as PolicyError).code;
    return problem(POLICY_ERROR_STATUS[code] ?? 422, code, e.message);
  }
  return handleError(e);
}
