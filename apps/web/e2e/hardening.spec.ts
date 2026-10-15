import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from '@playwright/test';

// API hardening: request body caps (413), rate limits (429 + Retry-After), session-creation cap, and redaction of a CPR
// typed into a claim. See docs/12-web-platform.md ("API hardening").
//
// The body-cap and redaction tests run on the main test server, whose rate limits are 1000x the defaults. The rate-limit
// tests run on a second server (playwright.config.ts) with tiny limits, started with SAHEL_TRUST_PROXY=1 only for it, so
// each test picks its own client address with X-Forwarded-For. A server started without that variable ignores the header,
// so there is no client-controlled bypass: the limits cannot be changed or skipped from a request.

const LIMITED_URL = `http://localhost:${Number(process.env.PORT ?? 3100) + 1}`;

const rand = (n: number) => Math.floor(Math.random() * n);
/** A client address nobody else in this run uses. */
const freshIp = () => `198.51.${rand(256)}.${1 + rand(254)}`;

async function limitedClient(ip = freshIp()): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: LIMITED_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip } });
}

const pad = (bytes: number) => ({ filler: 'x'.repeat(bytes) });

test.describe('request body caps (413 PAYLOAD_TOO_LARGE)', () => {
  // [method, path, headers] for a sample of routes; the unit test (lib/body-limits.test.ts) covers every route.
  const routes: [string, string, Record<string, string>][] = [
    ['POST', '/api/v1/quotes/finance', {}],
    ['POST', '/api/v1/insurance/motor-quotes', {}],
    ['POST', '/api/v1/insurance/home-quotes', {}],
    ['POST', '/api/v1/payments', {}],
    ['POST', '/api/v1/onboarding/ekey', {}],
    ['POST', '/api/v1/onboarding/pre-approval', {}],
    ['POST', '/api/v1/cards/imtiaz-prepaid/apply', {}],
    ['POST', '/api/v1/applications', {}],
    ['POST', '/api/v1/assistant/messages', {}],
    ['POST', '/api/v1/backoffice/session', {}],
    ['POST', '/api/v1/backoffice/applications/x/decision', { 'X-Sahel-Staff-Role': 'credit_officer' }],
    ['POST', '/api/v1/dealer/offers', {}],
    ['POST', '/api/v1/dealer/preapproval/redeem', {}],
    ['PATCH', '/api/v1/dealer/nmc/leads/x', {}],
    ['POST', '/api/v1/dealer/nmc/requests/x/bids', {}],
    ['POST', '/api/v1/requests', {}],
    ['POST', '/api/v1/me/rewards/redemptions', {}],
    ['PUT', '/api/v1/me/notification-preferences', {}],
    ['PATCH', '/api/v1/me/contracts/c-1002', {}],
    ['POST', '/api/v1/claims/x/advance', {}],
  ];

  for (const [method, path, headers] of routes) {
    test(`${method} ${path}`, async ({ request }) => {
      const res = await request.fetch(path, { method, headers, data: pad(20 * 1024) });
      expect(res.status()).toBe(413);
      expect((await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  }

  test('a body that reads no JSON is refused by its declared size too', async ({ request }) => {
    const res = await request.post('/api/v1/payments/x/confirm', { headers: { 'Content-Type': 'application/json' }, data: pad(20 * 1024) });
    expect(res.status()).toBe(413);
    expect((await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('a body under the cap still works (the cap is not a regression)', async ({ request }) => {
    const res = await request.post('/api/v1/quotes/finance', { data: { productLine: 'personal', assetPriceFils: 3_000_000, ...pad(2 * 1024) } });
    expect(res.status()).toBe(200);
  });

  test('the claim form keeps its own, bigger cap', async ({ request }) => {
    const res = await request.post('/api/v1/claims', { headers: { 'Content-Type': 'application/json' }, data: pad(4 * 1024 * 1024) });
    expect(res.status()).toBe(413);
    expect((await res.json()).error.code).toBe('BODY_TOO_LARGE');
  });
});

test.describe('rate limits (429 RATE_LIMITED + Retry-After)', () => {
  // The limits are small, shared per address and not per project: run once.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'API only, one viewport is enough');
  });

  async function expectRateLimited(res: { status(): number; headers(): Record<string, string>; json(): Promise<{ error: { code: string } }> }) {
    expect(res.status()).toBe(429);
    const wait = Number(res.headers()['retry-after']);
    expect(Number.isInteger(wait)).toBe(true);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(60);
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
  }

  test('new sessions are capped per client address, other addresses and existing sessions are not affected', async () => {
    const api = await limitedClient();
    let sessionId = '';
    for (let i = 0; i < 5; i++) {
      const res = await api.get('/api/v1/me/cards', { headers: { 'X-Sahel-Session': 'new' } });
      expect(res.status()).toBe(200);
      sessionId ||= res.headers()['x-sahel-session']!;
    }
    const sixth = await api.get('/api/v1/me/cards', { headers: { 'X-Sahel-Session': 'new' } });
    await expectRateLimited(sixth);
    expect(sixth.headers()['x-sahel-session']).toBeUndefined(); // no session was started
    expect((await api.get('/api/v1/me/cards', { headers: { 'X-Sahel-Session': sessionId } })).status()).toBe(200); // not a new session
    const other = await limitedClient();
    expect((await other.get('/api/v1/me/cards', { headers: { 'X-Sahel-Session': 'new' } })).status()).toBe(200);
    await api.dispose();
    await other.dispose();
  });

  test('a cookie that is not a session also counts as a new session', async () => {
    const api = await limitedClient();
    for (let i = 0; i < 5; i++) expect((await api.get('/api/v1/me/cards', { headers: { Cookie: `sahel_session=${'A'.repeat(32)}` } })).status()).toBe(200);
    await expectRateLimited(await api.get('/api/v1/me/cards', { headers: { Cookie: `sahel_session=${'B'.repeat(32)}` } }));
    await api.dispose();
  });

  test('the assistant is limited per client address, so "X-Sahel-Session: new" is no way around it', async () => {
    const api = await limitedClient();
    const say = () => api.post('/api/v1/assistant/messages', { headers: { 'X-Sahel-Session': 'new' }, data: { text: 'hello', locale: 'en' } });
    for (let i = 0; i < 3; i++) expect((await say()).status()).toBe(200);
    await expectRateLimited(await say());
    // another address is untouched
    const other = await limitedClient();
    expect((await other.post('/api/v1/assistant/messages', { headers: { 'X-Sahel-Session': 'new' }, data: { text: 'hello', locale: 'en' } })).status()).toBe(200);
    await api.dispose();
    await other.dispose();
  });

  test('payments, eKey login and back-office role selection are limited', async () => {
    const api = await limitedClient();
    const session = (await api.get('/api/v1/me/cards', { headers: { 'X-Sahel-Session': 'new' } })).headers()['x-sahel-session']!;
    const h = { 'X-Sahel-Session': session };
    const pay = (n: number) =>
      api.post('/api/v1/payments', {
        headers: { ...h, 'Idempotency-Key': `e2e-hardening-${Date.now()}-${n}` },
        data: { amountFils: 100_000, method: 'card', purpose: 'reservation_deposit', reference: 'v-honda-city-2026' },
      });
    expect((await pay(1)).status()).not.toBe(429);
    expect((await pay(2)).status()).not.toBe(429);
    await expectRateLimited(await pay(3));

    const ekey = () => api.post('/api/v1/onboarding/ekey', { headers: h, data: { cpr: '880412345' } });
    expect((await ekey()).status()).toBe(200);
    expect((await ekey()).status()).toBe(200);
    await expectRateLimited(await ekey());

    const role = () => api.post('/api/v1/backoffice/session', { data: { role: 'operations' } });
    expect((await role()).status()).toBe(200);
    expect((await role()).status()).toBe(200);
    await expectRateLimited(await role());
    await api.dispose();
  });

  test('polling endpoints are limited', async () => {
    const api = await limitedClient();
    for (let i = 0; i < 3; i++) expect((await api.get('/api/v1/me/notifications/unread-count')).status()).toBe(200);
    await expectRateLimited(await api.get('/api/v1/me/notifications/unread-count'));
    await api.dispose();
  });

  test('an X-Forwarded-For header changes nothing on a server that does not trust a proxy', async ({ request }) => {
    // The main test server has no SAHEL_TRUST_PROXY: many different "addresses" all land in one bucket, whose limit is
    // 1000x the default, so nothing here is refused, and the header cannot be used to dodge or to pick a limit.
    for (let i = 0; i < 40; i++) {
      const res = await request.get('/api/v1/me', { headers: { 'X-Forwarded-For': freshIp(), 'X-Sahel-Session': 'new' } });
      expect(res.status()).toBe(200);
    }
  });
});

test.describe('claims redact a CPR and phone number typed into free text', () => {
  const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString('base64');

  async function buyMotorPolicy(request: APIRequestContext): Promise<{ id: string }> {
    const quote = (await (
      await request.post('/api/v1/policies/quotes', {
        data: { line: 'motor', insurerId: 'pearl-takaful', input: { vehicleValueFils: 14_900_000, cover: 'comprehensive', reference: '123456' } },
      })
    ).json()).data as { id: string; premiumFils: number };
    const payment = (await (
      await request.post('/api/v1/payments', {
        data: { amountFils: quote.premiumFils, method: 'card', purpose: 'insurance_premium', reference: quote.id },
        headers: { 'Idempotency-Key': `e2e-hardening-motor-${quote.id}` },
      })
    ).json()).data as { id: string };
    await request.post(`/api/v1/payments/${payment.id}/confirm`);
    const res = await request.post('/api/v1/policies/confirm', { data: { paymentId: payment.id, quoteId: quote.id } });
    expect(res.status()).toBe(200);
    return (await res.json()).data as { id: string };
  }

  const body = (policyId: string) => ({
    policyId,
    incidentAt: new Date().toISOString(),
    location: 'Sheikh Khalifa Highway, call me on 3600 1234',
    type: 'collision',
    severity: 'moderate',
    description: 'Rear-ended at a light. The other driver wrote his CPR 880412345 and phone +973 3600 1234 on a note.',
    thirdPartyInvolved: true,
    photos: [{ mimeType: 'image/jpeg', dataBase64: JPEG_HEADER }],
  });

  test('the response, the list and the claim page show the masked text only', async ({ page }) => {
    await page.goto('/en');
    const policy = await buyMotorPolicy(page.request);
    const res = await page.request.post('/api/v1/claims', { data: body(policy.id) });
    expect(res.status()).toBe(201);
    const claim = (await res.json()).data as { id: string; description: string; location: string };
    for (const text of [claim.description, claim.location]) {
      expect(text).toContain('[•••]');
      for (const secret of ['880412345', '3600 1234', '36001234']) expect(text).not.toContain(secret);
    }
    expect(claim.description).toContain('Rear-ended at a light');
    expect(claim.location).toContain('Sheikh Khalifa Highway');

    const list = JSON.stringify((await (await page.request.get('/api/v1/me/claims')).json()).data);
    expect(list).not.toContain('880412345');
    expect(list).not.toContain('3600 1234');

    await openClaim(page, claim.id);
    const html = await page.content();
    expect(html).not.toContain('880412345');
    expect(html).not.toContain('3600 1234');
  });

  async function openClaim(page: Page, id: string) {
    await page.goto(`/en/claims/${id}`);
    await expect(page.locator('main')).toContainText('Rear-ended at a light');
  }
});
