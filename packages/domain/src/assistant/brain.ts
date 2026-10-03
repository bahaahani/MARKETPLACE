import { detectIntent, type DetectedIntent } from './intents';
import { detectLanguage } from './normalize';
import { presentConfirm, presentSmallTalk, presentToolResult, type Presentation } from './present';
import { runAssistantTool, type AssistantToolArgs, type AssistantToolName, type AssistantToolResult } from './tools';
import { PERSONA_NAME, type AssistantContext, type AssistantReply, type AssistantRequest } from './types';

/**
 * The assistant's "brain": turns one customer message (plus the remembered conversation) into a reply.
 *
 * Today: RulesBrain, deterministic and fully offline (no network, no API keys, nothing leaves the server).
 *
 * ⚠️ WHERE AN LLM PLUGS IN. A production brain (for example a model hosted in-region, in BCFC's own cloud account,
 * as 07-security-compliance §4 requires; never a service that trains on customer data) implements this same
 * interface, e.g. `class HostedModelBrain implements AssistantBrain`:
 * 1. Send the system prompt, the conversation (AssistantRequest.history, already PII-redacted) and ASSISTANT_TOOLS
 *    as tool definitions (name, description, JSON-Schema parameters). Never send the CPR, salary or card numbers.
 * 2. Execute each tool call the model makes with runAssistantTool(ctx, name, args): read-only, session-scoped,
 *    arguments validated there.
 * 3. Build cards and actions with presentToolResult(): the model writes only `text`, so it cannot invent an amount
 *    or a link, and there is no tool that pays, signs or applies.
 * 4. AssistantService still redacts the text and enforces the rate limit and input cap; on a model timeout or
 *    error, fall back to RulesBrain.
 * Wire it in apps/web/app/api/v1/assistant/messages/route.ts (the `brain` passed to AssistantService).
 */
export interface AssistantBrain {
  respond(req: AssistantRequest, ctx: AssistantContext): Promise<AssistantReply>;
}

/** Which tool (and arguments) answers a detected intent, resolving "the car" and follow-ups to a contract. */
export function planToolCall(
  d: DetectedIntent,
  req: Pick<AssistantRequest, 'history'>,
  ctx: AssistantContext,
): { name: AssistantToolName; args: AssistantToolArgs } | undefined {
  const contractId = (): string | undefined => {
    if (d.slots.contract) return ctx.customer.contracts.find((c) => c.quote.productLine === d.slots.contract)?.id;
    // Follow-up ("and if I pay it all off now?"): the one contract the last answer was about.
    const last = [...req.history].reverse().find((t) => t.role === 'assistant' && t.contractIds?.length);
    return last?.contractIds?.length === 1 ? last.contractIds[0] : undefined;
  };
  switch (d.intent) {
    case 'outstanding_balance':
      return { name: 'get_outstanding_balance', args: { contractId: contractId() } };
    case 'next_installment':
      return { name: 'get_next_installment', args: { contractId: d.slots.contract ? contractId() : undefined } };
    case 'settlement_quote': {
      const id = contractId();
      if (id) return { name: 'get_settlement_quote', args: { contractId: id } };
      // Without a hint, quote every open contract (a settled one has nothing to quote).
      return { name: 'get_settlement_quote', args: {} };
    }
    case 'find_cars': {
      const { maxMonthlyFils, maxPriceFils, bodyType, fuel, condition, make } = d.slots;
      return { name: 'search_vehicles', args: { maxMonthlyFils, maxPriceFils, bodyType, fuel, condition, make } };
    }
    case 'pre_approval':
      return { name: 'get_pre_approval', args: {} };
    case 'policies':
      return { name: 'list_policies', args: {} };
    case 'card_status':
      return { name: 'get_card_status', args: {} };
    case 'handoff':
      return { name: 'request_human_handoff', args: {} };
    default:
      return undefined;
  }
}

function contractIdsOf(r: AssistantToolResult): string[] | undefined {
  switch (r.tool) {
    case 'get_outstanding_balance':
      return r.contracts.filter((c) => !c.settledOn).map((c) => c.id);
    case 'get_next_installment':
      return r.items.map((i) => i.contractId);
    case 'get_settlement_quote':
      return r.items.map((i) => i.contractId);
    default:
      return undefined;
  }
}

let replySeq = 0;

/** Deterministic, rules-based brain (sandbox). */
export class RulesBrain implements AssistantBrain {
  async respond(req: AssistantRequest, ctx: AssistantContext): Promise<AssistantReply> {
    const locale = detectLanguage(req.text, req.locale);
    const d = detectIntent(req.text);
    let p: Presentation;
    let contractIds: string[] | undefined;
    let handoff: AssistantReply['handoff'];
    if (d.intent === 'confirm') {
      const last = [...req.history].reverse().find((t) => t.role === 'assistant');
      p = presentConfirm(last?.actions, locale);
    } else {
      const call = planToolCall(d, req, ctx);
      if (call) {
        const result = runAssistantTool(ctx, call.name, call.args);
        p = presentToolResult(result, locale);
        contractIds = contractIdsOf(result);
        if (result.tool === 'request_human_handoff') handoff = { reference: result.reference, sandbox: true };
      } else {
        p = presentSmallTalk(d.intent as 'greeting' | 'help' | 'thanks' | 'unknown', req.persona, locale);
      }
    }
    return {
      id: `msg_${Date.now().toString(36)}_${(++replySeq).toString(36)}`,
      persona: req.persona,
      personaName: PERSONA_NAME[req.persona][locale],
      locale,
      intent: d.intent,
      ...p,
      ...(handoff ? { handoff } : {}),
      ...(contractIds ? { contractIds } : {}),
      sandbox: true,
    };
  }
}
