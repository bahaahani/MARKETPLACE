import { expect, test } from '@playwright/test';

// Regression tests for the round-5 review: request size caps on the new routes, one application per accepted bid,
// idempotent accept and replay of an application, and a pre-existing conditions declaration that is never coerced.

const CRV = 'v-honda-crv-2026';
const REQUEST = { bodyType: 'suv', maxMonthlyFils: 300_000, structure: 'murabaha', tenureMonths: 60, downPaymentFils: 3_000_000 };
const big = (kb: number) => ({ padding: 'x'.repeat(kb * 1024) });

test.describe('body size caps on the new routes', () => {
  const cases: [string, string, number][] = [
    ['/api/v1/requests', 'POST', 8],
    ['/api/v1/requests/breq_x/accept', 'POST', 4],
    ['/api/v1/dealer/nmc/requests/breq_x/bids', 'POST', 8],
    ['/api/v1/trade-in/valuations', 'POST', 4],
    ['/api/v1/claims/clm_x/garage', 'POST', 2],
    ['/api/v1/claims/clm_x/advance', 'POST', 2],
    ['/api/v1/insurance/medical-quotes', 'POST', 16],
    ['/api/v1/insurance/life-quotes', 'POST', 16],
    ['/api/v1/policies/quotes', 'POST', 16],
    ['/api/v1/policies/confirm', 'POST', 4],
    ['/api/v1/applications', 'POST', 8],
  ];
  for (const [path, , kb] of cases) {
    test(`${path} refuses a body over ${kb} KB with 413`, async ({ request }) => {
      const res = await request.post(path, { data: big(kb + 1), headers: { 'Idempotency-Key': 'key-too-large-0001' } });
      expect(res.status()).toBe(413);
      expect((await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  }
});

test('one accepted bid prices one application; accept and apply are idempotent', async ({ request }) => {
  const created = await request.post('/api/v1/requests', { data: REQUEST });
  expect(created.status()).toBe(201);
  const requestId = (await created.json()).data.id as string;
  const placed = await request.post(`/api/v1/dealer/nmc/requests/${requestId}/bids`, { data: { vehicleId: CRV, discountFils: 500_000, extras: ['service-1y'] } });
  expect(placed.status()).toBe(201);
  const bidId = (await placed.json()).data.myBid.id as string;

  // Accepting twice (a retry after a lost response) gives the same 200 result.
  const first = await request.post(`/api/v1/requests/${requestId}/accept`, { data: { bidId } });
  expect(first.status()).toBe(200);
  const again = await request.post(`/api/v1/requests/${requestId}/accept`, { data: { bidId } });
  expect(again.status()).toBe(200);
  expect((await again.json()).data.acceptedBidId).toBe(bidId);

  const apply = (key: string) =>
    request.post('/api/v1/applications', {
      data: { productLine: 'vehicle', structure: 'murabaha', vehicleId: CRV, downPaymentFils: 3_000_000, tenureMonths: 60, requestId, bidId },
      headers: { 'Idempotency-Key': key },
    });
  const one = await apply('key-bid-first-0001');
  expect(one.status()).toBe(201);
  const appId = (await one.json()).data.id as string;

  // Another key on the same bid is refused; the same key replays the original application.
  const two = await apply('key-bid-second-0002');
  expect(two.status()).toBe(409);
  expect((await two.json()).error.code).toBe('BID_ALREADY_USED');
  const replay = await apply('key-bid-first-0001');
  expect(replay.status()).toBe(201);
  expect((await replay.json()).data.id).toBe(appId);
  const list = await request.get('/api/v1/applications');
  expect((await list.json()).data.total).toBe(1);
});

test('medical: "true" for the pre-existing conditions declaration is refused, not read as false', async ({ request }) => {
  const body = { primaryDateOfBirth: '1986-01-01', nationality: 'expat', preExistingConditions: 'true' };
  const quotes = await request.post('/api/v1/insurance/medical-quotes', { data: body });
  expect(quotes.status()).toBe(422);
  const hold = await request.post('/api/v1/policies/quotes', { data: { line: 'medical', insurerId: 'pearl-takaful', input: body } });
  expect(hold.status()).toBe(422);
  const ok = await request.post('/api/v1/insurance/medical-quotes', { data: { ...body, preExistingConditions: true } });
  expect(ok.status()).toBe(200);
});
