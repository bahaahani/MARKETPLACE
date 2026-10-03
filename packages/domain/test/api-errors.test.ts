import { describe, expect, it } from 'vitest';
import { PaymentTransitionError, transition } from '../src';
// The web API's error mapping (apps/web/lib/api.ts): domain errors must become 4xx, never 500.
import { handleError, jsonBody } from '../../../apps/web/lib/api';

async function statusOf(e: unknown) {
  const res = handleError(e);
  return { status: res.status, body: (await res.json()) as { error: { code: string } } };
}

describe('API error mapping', () => {
  it('maps a refused payment transition to 409, by class or by name (other route bundle)', async () => {
    let thrown: unknown;
    try {
      transition('FAILED', 'capture');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PaymentTransitionError);
    expect(await statusOf(thrown)).toEqual({ status: 409, body: { error: { code: 'INVALID_TRANSITION', message: 'cannot capture a payment in status FAILED' } } });

    const foreign = Object.assign(new Error('cannot void a payment in status CAPTURED'), { name: 'PaymentTransitionError' });
    expect((await statusOf(foreign)).status).toBe(409);
  });

  it('still returns 500 for unexpected errors', async () => {
    const spy = console.error;
    console.error = () => {};
    try {
      expect((await statusOf(new TypeError('boom'))).status).toBe(500);
    } finally {
      console.error = spy;
    }
  });

  it('jsonBody rejects bodies that are not JSON objects with 400 BAD_JSON', async () => {
    const req = (body: string) => new Request('http://localhost/api/v1/x', { method: 'POST', body });
    for (const body of ['null', '[]', '42', '"text"', '{']) {
      let err: unknown;
      try {
        await jsonBody(req(body));
      } catch (e) {
        err = e;
      }
      expect(err, body).toBeInstanceOf(SyntaxError);
      expect((await statusOf(err)).body.error.code).toBe('BAD_JSON');
    }
    expect(await jsonBody(req('{"a":1}'))).toEqual({ a: 1 });
    expect(await jsonBody(req(''), { optional: true })).toEqual({});
  });
});
