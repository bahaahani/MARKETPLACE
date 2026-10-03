import { RulesBrain, type AssistantBrain } from './brain';
import { redactPii } from './pii';
import {
  ASSISTANT_PERSONAS,
  DEFAULT_PERSONA,
  type AssistantContext,
  type AssistantPersona,
  type AssistantReply,
  type AssistantTurn,
} from './types';
import type { Locale } from '../money';

/**
 * Suhail & Suhaila 2.0 service (POST /api/v1/assistant/messages): validates the message, applies the per-session rate
 * limit, keeps the last turns of the conversation in memory and asks the brain for a reply.
 *
 * ⚠️ SANDBOX: conversations live in the web server's memory (lost on restart). Production keeps them in an
 * in-region store with a retention policy, and the rate limit at the API gateway.
 */

/** Longest message accepted, in characters. */
export const ASSISTANT_MAX_INPUT_CHARS = 500;
/** Turns remembered per conversation (a customer message and a reply are two turns). */
export const ASSISTANT_HISTORY_TURNS = 10;
/** ⚠️ VERIFY: messages per session per window. */
export const ASSISTANT_RATE_LIMIT = { messages: 20, windowMs: 60_000 };

export type AssistantErrorCode = 'INVALID_REQUEST' | 'TEXT_REQUIRED' | 'TEXT_TOO_LONG' | 'RATE_LIMITED';

export const ASSISTANT_ERROR_STATUS: Record<AssistantErrorCode, number> = {
  INVALID_REQUEST: 422,
  TEXT_REQUIRED: 422,
  TEXT_TOO_LONG: 422,
  RATE_LIMITED: 429,
};

export class AssistantError extends Error {
  constructor(
    public readonly code: AssistantErrorCode,
    message: string,
    /** RATE_LIMITED: seconds until a message is accepted again */
    public readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

export interface AssistantMessageInput {
  text: string;
  locale: Locale;
  persona: AssistantPersona;
}

/** Validates the request body of POST /assistant/messages. */
export function parseAssistantMessage(body: { text?: unknown; locale?: unknown; persona?: unknown }): AssistantMessageInput {
  if (body.locale !== 'en' && body.locale !== 'ar') throw new AssistantError('INVALID_REQUEST', 'locale must be en or ar');
  if (body.persona !== undefined && !ASSISTANT_PERSONAS.includes(body.persona as AssistantPersona)) {
    throw new AssistantError('INVALID_REQUEST', `persona must be one of ${ASSISTANT_PERSONAS.join(', ')}`);
  }
  if (typeof body.text !== 'string' || !body.text.trim()) throw new AssistantError('TEXT_REQUIRED', 'text is required');
  const text = body.text.trim();
  if ([...text].length > ASSISTANT_MAX_INPUT_CHARS) {
    throw new AssistantError('TEXT_TOO_LONG', `text must be at most ${ASSISTANT_MAX_INPUT_CHARS} characters`);
  }
  return { text, locale: body.locale, persona: (body.persona as AssistantPersona | undefined) ?? DEFAULT_PERSONA };
}

/** Sliding-window rate limit per key (the session customer). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit = ASSISTANT_RATE_LIMIT.messages,
    private readonly windowMs = ASSISTANT_RATE_LIMIT.windowMs,
    private readonly clock: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts one attempt. Returns 0 when allowed, else the seconds to wait. */
  hit(key: string): number {
    const now = this.clock();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil((recent[0]! + this.windowMs - now) / 1000));
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value!);
    return 0;
  }
}

/** The last turns of each conversation, in memory. Customer text is stored PII-redacted. */
export class ConversationStore {
  private readonly conversations = new Map<string, AssistantTurn[]>();
  constructor(
    private readonly maxTurns = ASSISTANT_HISTORY_TURNS,
    private readonly maxConversations = 10_000,
  ) {}

  history(key: string): AssistantTurn[] {
    return [...(this.conversations.get(key) ?? [])];
  }

  append(key: string, ...turns: AssistantTurn[]): void {
    const all = [...(this.conversations.get(key) ?? []), ...turns].slice(-this.maxTurns);
    this.conversations.delete(key);
    this.conversations.set(key, all);
    if (this.conversations.size > this.maxConversations) this.conversations.delete(this.conversations.keys().next().value!);
  }

  clear(key: string): void {
    this.conversations.delete(key);
  }
}

export interface AssistantServiceOptions {
  brain?: AssistantBrain;
  limiter?: RateLimiter;
  conversations?: ConversationStore;
  clock?: () => Date;
}

export class AssistantService {
  readonly brain: AssistantBrain;
  readonly limiter: RateLimiter;
  readonly conversations: ConversationStore;
  private readonly clock: () => Date;

  constructor(opts: AssistantServiceOptions = {}) {
    this.brain = opts.brain ?? new RulesBrain();
    this.limiter = opts.limiter ?? new RateLimiter();
    this.conversations = opts.conversations ?? new ConversationStore();
    this.clock = opts.clock ?? (() => new Date());
  }

  /**
   * Answers one message of the conversation `key` (the session customer id). Every attempt counts toward the rate
   * limit, including invalid ones. Throws AssistantError.
   */
  async handle(key: string, body: { text?: unknown; locale?: unknown; persona?: unknown }, ctx: AssistantContext): Promise<AssistantReply> {
    const wait = this.limiter.hit(key);
    if (wait > 0) throw new AssistantError('RATE_LIMITED', `too many messages; try again in ${wait}s`, wait);
    const input = parseAssistantMessage(body);
    const now = this.clock();
    const reply = await this.brain.respond({ ...input, history: this.conversations.history(key) }, { ...ctx, now: ctx.now ?? now });
    const safe: AssistantReply = {
      ...reply,
      text: redactPii(reply.text),
      cards: reply.cards.map((c) =>
        c.kind === 'list' ? { ...c, items: c.items.map((i) => ({ title: redactPii(i.title), detail: redactPii(i.detail) })) } : c,
      ),
    };
    const at = now.toISOString();
    this.conversations.append(
      key,
      { role: 'user', text: redactPii(input.text), at },
      {
        role: 'assistant',
        text: safe.text,
        at,
        intent: safe.intent,
        ...(safe.contractIds ? { contractIds: safe.contractIds } : {}),
        ...(safe.actions.length ? { actions: safe.actions } : {}),
      },
    );
    return safe;
  }
}
