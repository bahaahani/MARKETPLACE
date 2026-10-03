import { ASSISTANT_ERROR_STATUS, AssistantError, AssistantService, customerCardOffers, type AssistantContext } from '@sahel/domain';
import { cardIssuer, handleError, problem } from '@/lib/api';
import { policyStore } from '@/lib/policy-store';
import type { RequestSession } from '@/lib/session';

const g = globalThis as unknown as { __sahelAssistant?: AssistantService };

/**
 * ⚠️ Sandbox Suhail & Suhaila service: the rules-based brain, the per-session rate limit and the conversation memory,
 * all in this server's memory (lost on restart).
 * To plug in a language model, pass `brain: new <YourBrain>()` here (see AssistantBrain in packages/domain).
 */
export const assistant = (g.__sahelAssistant ??= new AssistantService());

/** What the assistant may read: only the session customer's own data. */
export function assistantContext(s: RequestSession): AssistantContext {
  return {
    customer: s.customer,
    policies: policyStore.list(s.customerId),
    cards: cardIssuer.list(s.customerId),
    cardOffers: customerCardOffers(s.profile),
  };
}

/** handleError plus the assistant errors (429 carries Retry-After). */
export function handleAssistantError(e: unknown) {
  if (e instanceof AssistantError || (e instanceof Error && e.name === 'AssistantError')) {
    const err = e as AssistantError;
    const res = problem(ASSISTANT_ERROR_STATUS[err.code] ?? 422, err.code, err.message);
    if (err.retryAfterSec) res.headers.set('Retry-After', String(err.retryAfterSec));
    return res;
  }
  return handleError(e);
}
