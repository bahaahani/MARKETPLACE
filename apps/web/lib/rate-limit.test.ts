import { describe, expect, it } from 'vitest';
import { clientIp, parseRateLimits, RATE_LIMIT_DEFAULTS, RATE_LIMIT_NAMES, RateLimits, UNKNOWN_CLIENT, type RateLimitConfig } from './rate-limit';

function clockAt(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

const small = (over: Partial<RateLimitConfig> = {}): RateLimitConfig => ({
  ...parseRateLimits(undefined),
  'session-create:ip': { limit: 3, windowMs: 60_000 },
  ...over,
});

describe('RateLimits (sliding window, injectable clock)', () => {
  it('allows up to the limit, then answers with the seconds to wait', () => {
    const c = clockAt();
    const limits = new RateLimits({ config: small(), clock: c.now });
    for (let i = 0; i < 3; i++) expect(limits.hit('session-create:ip', 'a')).toEqual({ allowed: true, retryAfterSec: 0 });
    c.advance(10_000);
    const over = limits.hit('session-create:ip', 'a');
    expect(over.allowed).toBe(false);
    expect(over.retryAfterSec).toBe(50);
  });

  it('lets requests through again as the window slides', () => {
    const c = clockAt();
    const limits = new RateLimits({ config: small(), clock: c.now });
    for (let i = 0; i < 3; i++) limits.hit('session-create:ip', 'a');
    expect(limits.hit('session-create:ip', 'a').allowed).toBe(false);
    c.advance(60_000);
    expect(limits.hit('session-create:ip', 'a').allowed).toBe(true);
  });

  it('counts a refused request as nothing (hammering does not extend the wait)', () => {
    const c = clockAt();
    const limits = new RateLimits({ config: small(), clock: c.now });
    for (let i = 0; i < 3; i++) limits.hit('session-create:ip', 'a');
    for (let i = 0; i < 50; i++) limits.hit('session-create:ip', 'a');
    c.advance(60_000);
    expect(limits.hit('session-create:ip', 'a').allowed).toBe(true);
  });

  it('keeps keys and limits apart', () => {
    const c = clockAt();
    const limits = new RateLimits({ config: small(), clock: c.now });
    for (let i = 0; i < 3; i++) limits.hit('session-create:ip', 'a');
    expect(limits.hit('session-create:ip', 'a').allowed).toBe(false);
    expect(limits.hit('session-create:ip', 'b').allowed).toBe(true);
    expect(limits.hit('payments:ip', 'a').allowed).toBe(true);
  });

  it('forgets a key everywhere', () => {
    const c = clockAt();
    const limits = new RateLimits({ config: small(), clock: c.now });
    for (let i = 0; i < 3; i++) limits.hit('session-create:ip', 'a');
    limits.forget('a');
    expect(limits.hit('session-create:ip', 'a').allowed).toBe(true);
  });

  it('remembers a bounded number of keys', () => {
    const c = clockAt();
    const limits = new RateLimits({ config: small(), clock: c.now, maxKeys: 2 });
    for (let i = 0; i < 3; i++) limits.hit('session-create:ip', 'a');
    limits.hit('session-create:ip', 'b');
    limits.hit('session-create:ip', 'c'); // 'a' (the oldest) is dropped
    expect(limits.hit('session-create:ip', 'a').allowed).toBe(true);
  });
});

describe('parseRateLimits (SAHEL_RATE_LIMITS)', () => {
  it('uses the defaults without a value', () => {
    expect(parseRateLimits(undefined)).toEqual(RATE_LIMIT_DEFAULTS);
    expect(parseRateLimits('')).toEqual(RATE_LIMIT_DEFAULTS);
  });

  it('ignores broken or wrongly shaped JSON instead of turning limits off', () => {
    for (const raw of ['{', 'null', '[]', '"x"', '5']) expect(parseRateLimits(raw)).toEqual(RATE_LIMIT_DEFAULTS);
  });

  it('overrides one limit by object or by number, with an optional window in seconds', () => {
    const c = parseRateLimits(JSON.stringify({ 'session-create:ip': { limit: 5, windowSec: 10 }, 'poll:ip': 1000 }));
    expect(c['session-create:ip']).toEqual({ limit: 5, windowMs: 10_000 });
    expect(c['poll:ip']).toEqual({ limit: 1000, windowMs: RATE_LIMIT_DEFAULTS['poll:ip'].windowMs });
    expect(c['payments:ip']).toEqual(RATE_LIMIT_DEFAULTS['payments:ip']);
  });

  it('scale multiplies every default limit, and a name then overrides it', () => {
    const c = parseRateLimits(JSON.stringify({ scale: 10, 'ekey:ip': 2 }));
    expect(c['session-create:ip'].limit).toBe(RATE_LIMIT_DEFAULTS['session-create:ip'].limit * 10);
    expect(c['ekey:ip'].limit).toBe(2);
  });

  it('ignores unknown names and invalid values', () => {
    const c = parseRateLimits(JSON.stringify({ nope: 1, 'poll:ip': -5, 'payments:ip': { limit: 0.5, windowSec: -1 }, scale: 'x' }));
    expect(c).toEqual(RATE_LIMIT_DEFAULTS);
  });

  it('names every limit as <what>:ip or <what>:session', () => {
    for (const n of RATE_LIMIT_NAMES) expect(n).toMatch(/^[a-z-]+:(ip|session)$/);
  });
});

describe('clientIp', () => {
  const h = (xff?: string) => new Headers(xff === undefined ? {} : { 'x-forwarded-for': xff });

  it('ignores X-Forwarded-For unless the proxy is trusted (a client could write anything in it)', () => {
    expect(clientIp(h('203.0.113.9'))).toBe(UNKNOWN_CLIENT);
    expect(clientIp(h('203.0.113.9'), { trustProxy: false })).toBe(UNKNOWN_CLIENT);
  });

  it('uses the first hop when the proxy is trusted', () => {
    expect(clientIp(h('203.0.113.9, 10.0.0.1, 10.0.0.2'), { trustProxy: true })).toBe('203.0.113.9');
  });

  it('falls back to the socket address, then to one shared bucket', () => {
    expect(clientIp(h(), { trustProxy: true, socketIp: '198.51.100.7' })).toBe('198.51.100.7');
    expect(clientIp(h(), { socketIp: '198.51.100.7' })).toBe('198.51.100.7');
    expect(clientIp(h(), { trustProxy: true })).toBe(UNKNOWN_CLIENT);
    expect(clientIp(h('not an ip'), { trustProxy: true })).toBe(UNKNOWN_CLIENT);
    expect(clientIp(h("<script>alert(1)</script>"), { trustProxy: true })).toBe(UNKNOWN_CLIENT);
  });

  it('strips the IPv4-mapped prefix and limits IPv6 clients per /64', () => {
    expect(clientIp(h('::ffff:203.0.113.9'), { trustProxy: true })).toBe('203.0.113.9');
    const a = clientIp(h('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), { trustProxy: true });
    const b = clientIp(h('2001:db8:1:2::1'), { trustProxy: true });
    const other = clientIp(h('2001:db8:1:3::1'), { trustProxy: true });
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });

  it('refuses a malformed address', () => {
    for (const bad of ['999.1.1', '1.2.3.4.5', '1:2:3', ':::', 'g::1']) expect(clientIp(h(bad), { trustProxy: true })).toBe(UNKNOWN_CLIENT);
  });
});
