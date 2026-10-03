import { demoPolicyHistory, InsuranceQuoteError, POLICY_ERROR_STATUS, PolicyError, SandboxPolicyStore } from '@sahel/domain';
import { handleError, problem } from '@/lib/api';

const g = globalThis as unknown as { __sahelPolicies?: SandboxPolicyStore };

/**
 * ⚠️ Sandbox insurance policies (in memory, lost on restart), standing in for the broker platform and insurer APIs.
 * Quotes and policies belong to the session customer (lib/session.ts); every customer starts with the demo history.
 */
export const policyStore = (g.__sahelPolicies ??= new SandboxPolicyStore(undefined, (customerId) => [demoPolicyHistory(customerId)]));

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
