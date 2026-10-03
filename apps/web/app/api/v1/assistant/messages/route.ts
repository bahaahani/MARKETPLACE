import { jsonBody, ok } from '@/lib/api';
import { assistant, assistantContext, handleAssistantError } from '@/lib/assistant-store';
import { withCustomer } from '@/lib/session';

// Per customer session, in-memory conversation, so never cache.
export const dynamic = 'force-dynamic';

interface Body {
  text?: unknown;
  persona?: unknown;
  locale?: unknown;
}

/**
 * POST /api/v1/assistant/messages: one message to Suhail / Suhaila. Replies with text in the customer's language,
 * cards and suggested actions (links the customer confirms in the normal UI; the assistant never pays or applies).
 * ⚠️ Sandbox: rules-based, no language model; 20 messages a minute per session (429 + Retry-After); at most 500
 * characters; the last turns are kept in memory per session.
 */
export function POST(req: Request) {
  return withCustomer(
    req,
    async (s) => {
      const body = await jsonBody<Body>(req);
      return ok(await assistant.handle(s.customerId, body, assistantContext(s)));
    },
    handleAssistantError,
  );
}
