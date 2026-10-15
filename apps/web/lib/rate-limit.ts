import { RateLimiter } from '@sahel/domain';

/**
 * ⚠️ SANDBOX rate limiting: sliding-window counters in this server's memory (lost on restart, not shared between
 * instances). Pure: no Next.js imports, an injectable clock and config, so it is unit-tested (rate-limit.test.ts).
 * Production: the WAF / API gateway rate limits and bot control in front of the API (docs/12, docs/13).
 *
 * A limit is named `<what>:<scope>`, where the scope is `ip` (the client address, see clientIp) or `session` (the
 * customer session). A request over the limit is answered 429 RATE_LIMITED with a Retry-After header (lib/api.ts).
 */
export interface RateRule {
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;

/** Defaults: generous for a person using the app, tight for a script. ⚠️ VERIFY with Security before launch. */
export const RATE_LIMIT_DEFAULTS = {
  /** New customer sessions started by one client address */
  'session-create:ip': { limit: 30, windowMs: MINUTE },
  /** Assistant messages per client address (the per-session limit is ASSISTANT_RATE_LIMIT in packages/domain) */
  'assistant:ip': { limit: 60, windowMs: MINUTE },
  'payments:session': { limit: 30, windowMs: MINUTE },
  'payments:ip': { limit: 120, windowMs: MINUTE },
  'ekey:session': { limit: 10, windowMs: MINUTE },
  'ekey:ip': { limit: 30, windowMs: MINUTE },
  /** Back-office role selection */
  'staff-role:ip': { limit: 20, windowMs: MINUTE },
  /** Every dealer endpoint (the dealership is picked by URL in the sandbox) */
  'dealer:ip': { limit: 300, windowMs: MINUTE },
  /** Pre-approval share code redemption (an 8-character code: guessing must be slow) */
  'share-redeem:ip': { limit: 30, windowMs: MINUTE },
  /** Polling endpoints: GET /me, GET /requests/{id}, GET /me/notifications/unread-count */
  'poll:session': { limit: 120, windowMs: MINUTE },
  'poll:ip': { limit: 600, windowMs: MINUTE },
  /** Rewards redemptions */
  'redeem:session': { limit: 10, windowMs: MINUTE },
  'redeem:ip': { limit: 30, windowMs: MINUTE },
} as const satisfies Record<string, RateRule>;

export type RateLimitName = keyof typeof RATE_LIMIT_DEFAULTS;

export const RATE_LIMIT_NAMES = Object.keys(RATE_LIMIT_DEFAULTS) as RateLimitName[];

export type RateLimitConfig = Record<RateLimitName, RateRule>;

/**
 * The limits with the `SAHEL_RATE_LIMITS` override applied. The override is optional JSON:
 *   { "scale": 10, "session-create:ip": { "limit": 5, "windowSec": 60 }, "poll:ip": 1000 }
 * `scale` multiplies every default limit first; a name then replaces its rule: an object with `limit` (and optionally
 * `windowSec`) or just a number (the limit, default window). Unknown names and invalid values are ignored, so a
 * typo never turns a limit off.
 */
export function parseRateLimits(raw: string | undefined): RateLimitConfig {
  const config = Object.fromEntries(RATE_LIMIT_NAMES.map((n) => [n, { ...RATE_LIMIT_DEFAULTS[n] }])) as RateLimitConfig;
  if (!raw?.trim()) return config;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return config;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return config;
  const o = parsed as Record<string, unknown>;
  if (typeof o.scale === 'number' && Number.isFinite(o.scale) && o.scale > 0) {
    for (const n of RATE_LIMIT_NAMES) config[n].limit = Math.max(1, Math.floor(config[n].limit * (o.scale as number)));
  }
  for (const n of RATE_LIMIT_NAMES) {
    const v = o[n];
    if (typeof v === 'number') {
      if (Number.isInteger(v) && v > 0) config[n].limit = v;
    } else if (typeof v === 'object' && v !== null) {
      const { limit, windowSec } = v as { limit?: unknown; windowSec?: unknown };
      if (typeof limit === 'number' && Number.isInteger(limit) && limit > 0) config[n].limit = limit;
      if (typeof windowSec === 'number' && Number.isFinite(windowSec) && windowSec > 0) config[n].windowMs = Math.round(windowSec * 1000);
    }
  }
  return config;
}

export interface RateLimitOptions {
  config?: RateLimitConfig;
  clock?: () => number;
  /** Keys remembered per limit before the oldest are forgotten (memory cap) */
  maxKeys?: number;
}

/** The named limits, each a sliding window per key. */
export class RateLimits {
  private readonly limiters = new Map<RateLimitName, RateLimiter>();

  constructor(private readonly opts: RateLimitOptions = {}) {}

  /** Counts one attempt for `key` against limit `name`. `retryAfterSec` is 0 when allowed, else the seconds to wait. */
  hit(name: RateLimitName, key: string): { allowed: boolean; retryAfterSec: number } {
    let limiter = this.limiters.get(name);
    if (!limiter) {
      const rule = (this.opts.config ?? RATE_LIMIT_DEFAULTS)[name];
      limiter = new RateLimiter(rule.limit, rule.windowMs, this.opts.clock ?? Date.now, this.opts.maxKeys ?? 10_000);
      this.limiters.set(name, limiter);
    }
    const retryAfterSec = limiter.hit(key);
    return { allowed: retryAfterSec === 0, retryAfterSec };
  }

  /** Forgets a key everywhere (e.g. a session that expired). */
  forget(key: string): void {
    for (const l of this.limiters.values()) l.forget(key);
  }
}

/** The process-wide limits, rebuilt when SAHEL_RATE_LIMITS changes (read at request time, like SAHEL_ALLOWED_ORIGINS). */
const g = globalThis as unknown as { __sahelRateLimits?: { raw: string | undefined; limits: RateLimits } };

export function processRateLimits(raw: string | undefined = process.env.SAHEL_RATE_LIMITS): RateLimits {
  if (!g.__sahelRateLimits || g.__sahelRateLimits.raw !== raw) {
    g.__sahelRateLimits = { raw, limits: new RateLimits({ config: parseRateLimits(raw) }) };
  }
  return g.__sahelRateLimits.limits;
}

// --- Client address ---

/** The bucket every client shares when no address can be told (no trusted proxy header, no socket address). */
export const UNKNOWN_CLIENT = 'unknown';

const IP_CHARS = /^[0-9a-f:.]{2,45}$/i;

/** IPv6 addresses are limited per /64 (a client owns a whole /64), written as its four groups; IPv4 is kept as is. */
function normalizeIp(raw: string): string | undefined {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7);
  if (!IP_CHARS.test(ip)) return undefined;
  if (!ip.includes(':')) return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : undefined;
  const [head, tail, ...rest] = ip.split('::');
  if (rest.length) return undefined;
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  if (tail === undefined && a.length !== 8) return undefined;
  const groups = tail === undefined ? a : [...a, ...Array<string>(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  if (groups.length !== 8 || groups.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return undefined;
  return `${groups.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/**
 * The client address a request is limited by. Only with `trustProxy` (SAHEL_TRUST_PROXY=1, i.e. the API runs behind a
 * proxy that sets X-Forwarded-For) is the header believed, and then its FIRST hop. Otherwise the header is ignored
 * (a client could write anything in it), and the socket address is used when the runtime offers it; Next.js route
 * handlers do not, so every client then shares the UNKNOWN_CLIENT bucket: the per-address limits become global ones.
 */
export function clientIp(headers: Pick<Headers, 'get'>, opts: { trustProxy?: boolean; socketIp?: string } = {}): string {
  if (opts.trustProxy) {
    const first = headers.get('x-forwarded-for')?.split(',')[0];
    const ip = first ? normalizeIp(first) : undefined;
    if (ip) return ip;
  }
  return (opts.socketIp && normalizeIp(opts.socketIp)) || UNKNOWN_CLIENT;
}
