import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleError, jsonBody, logUnexpected, noBody, PayloadTooLargeError, RateLimitedError, rateLimit, requestIp, scrubForLog } from './api';

// The API helpers added for hardening: 413, 429 + Retry-After, the session-creation cap, safe logging and data purge.
const LIMITS = 'SAHEL_RATE_LIMITS';
const TRUST = 'SAHEL_TRUST_PROXY';

function setLimits(value: unknown): void {
  process.env[LIMITS] = JSON.stringify(value);
}

afterEach(() => {
  delete process.env[LIMITS];
  delete process.env[TRUST];
  vi.restoreAllMocks();
});

describe('413 and 429 answers', () => {
  it('maps PayloadTooLargeError to 413 PAYLOAD_TOO_LARGE', async () => {
    const res = handleError(new PayloadTooLargeError(4096));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps RateLimitedError to 429 RATE_LIMITED with Retry-After', async () => {
    const res = handleError(new RateLimitedError(17));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('17');
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
  });

  it('refuses a chunked body with no Content-Length once it passes the cap, without reading all of it', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
        if (pulled > 1000) controller.close();
      },
    });
    const req = new Request('http://localhost/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await expect(jsonBody(req, { maxBytes: 4096 })).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(pulled).toBeLessThan(20);
  });

  it('noBody refuses a declared body over 1 KiB and lets an empty or small one through', () => {
    const post = (len?: string) => new Request('http://localhost/x', { method: 'POST', headers: len ? { 'content-length': len } : {} });
    expect(() => noBody(post())).not.toThrow();
    expect(() => noBody(post('12'))).not.toThrow();
    expect(() => noBody(post('1025'))).toThrow(PayloadTooLargeError);
  });
});

describe('rateLimit()', () => {
  const req = (headers: Record<string, string> = {}) => new Request('http://localhost/x', { method: 'POST', headers });

  it('throws RateLimitedError with the seconds to wait once a limit is used up', () => {
    setLimits({ 'payments:ip': { limit: 2, windowSec: 30 } });
    rateLimit(req(), 'payments:ip');
    rateLimit(req(), 'payments:ip');
    try {
      rateLimit(req(), 'payments:ip');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitedError);
      expect((e as RateLimitedError).retryAfterSec).toBeGreaterThan(0);
      expect((e as RateLimitedError).retryAfterSec).toBeLessThanOrEqual(30);
    }
  });

  it('limits by the session key separately from the address', () => {
    setLimits({ 'payments:session': 1, scale: 1000 });
    rateLimit(req(), 'payments:session', 'cus_a');
    expect(() => rateLimit(req(), 'payments:session', 'cus_a')).toThrow(RateLimitedError);
    expect(() => rateLimit(req(), 'payments:session', 'cus_b')).not.toThrow();
  });

  it('keys the address bucket on X-Forwarded-For only with SAHEL_TRUST_PROXY=1', () => {
    setLimits({ 'ekey:ip': 1, scale: 1000 });
    // not trusted: the header is ignored, so both requests share a bucket
    rateLimit(req({ 'x-forwarded-for': '198.51.100.1' }), 'ekey:ip');
    expect(() => rateLimit(req({ 'x-forwarded-for': '198.51.100.2' }), 'ekey:ip')).toThrow(RateLimitedError);
    expect(requestIp(req({ 'x-forwarded-for': '198.51.100.2' }))).toBe('unknown');
    process.env[TRUST] = '1';
    expect(requestIp(req({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }))).toBe('198.51.100.2');
    expect(() => rateLimit(req({ 'x-forwarded-for': '198.51.100.3' }), 'ekey:ip')).not.toThrow();
  });
});

describe('customer sessions are rate limited', () => {
  it('caps new sessions per address (429 + Retry-After) while existing sessions keep working', async () => {
    const { withCustomer, sessions, SESSION_HEADER } = await import('./session');
    const { ok } = await import('./api');
    setLimits({ 'session-create:ip': 2, scale: 1000 });
    const handler = () => ok({ fine: true });
    const call = (headers: Record<string, string> = {}) => withCustomer(new Request('http://localhost/x', { headers }), handler);

    const first = await call({ [SESSION_HEADER]: 'new' });
    const second = await call({ [SESSION_HEADER]: 'new' });
    expect([first.status, second.status]).toEqual([200, 200]);
    const id = first.headers.get(SESSION_HEADER)!;

    const third = await call({ [SESSION_HEADER]: 'new' });
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(third.headers.get(SESSION_HEADER)).toBeNull();
    expect((await third.json()).error.code).toBe('RATE_LIMITED');
    expect(sessions.get(id)).toBeDefined();

    // a known session id is not "creating a session"
    expect((await call({ [SESSION_HEADER]: id })).status).toBe(200);
  });
});

describe('logging never prints what the customer typed', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('scrubs CPR, phone, e-mail, voucher codes and long tokens from a message', () => {
    const text = 'bad 880412345 / 3600 1234 / a@b.com / IMZ-ABCD-EF23-GH45 / ' + 'A'.repeat(32);
    const out = scrubForLog(text);
    for (const secret of ['880412345', '3600 1234', 'a@b.com', 'IMZ-ABCD', 'AAAAAAAA']) expect(out).not.toContain(secret);
  });

  it('logs the name, a scrubbed message and stack frames, never the error object', () => {
    const err = new Error('cannot handle CPR 880412345 voucher IMZ-ABCD-EF23-GH45');
    (err as Error & { body?: string }).body = '{"cpr":"880412345"}';
    logUnexpected(err);
    const printed = (console.error as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
    expect(printed).toContain('[api] unexpected Error');
    expect(printed).not.toContain('880412345');
    expect(printed).not.toContain('IMZ-ABCD');
  });

  it('handleError answers 500 INTERNAL without the message', async () => {
    const res = handleError(new Error('secret 880412345'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('880412345');
  });
});
