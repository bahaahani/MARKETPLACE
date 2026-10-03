import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

// ⚠️ Sandbox customer session (stand-in for eKey login): each browser has its own customer, starting as the demo
// customer. Onboarding switches it to the customer's own numbers; applications, cards and keys stay private.

const bhd0 = (fils: number) => `BHD ${(fils / 1000).toLocaleString('en')}`;

async function newCustomer(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: test.info().project.use.baseURL });
}

async function onboard(ctx: BrowserContext, salaryBhd: string, obligationsBhd: string) {
  const page = await ctx.newPage();
  await page.goto('/en/onboarding');
  await page.getByLabel('CPR number').fill('880412345');
  await page.getByTestId('ekey-login').click();
  await expect(page.getByTestId('ekey-identity')).toBeVisible();
  await page.getByLabel('Monthly salary (BHD)').fill(salaryBhd);
  await page.getByLabel('Existing monthly repayments (BHD)').fill(obligationsBhd);
  await page.getByTestId('employment-continue').click();
  await page.getByTestId('consent-CRB').check();
  await page.getByTestId('consent-OPEN_BANKING').check();
  await page.getByTestId('see-preapproval').click();
  await expect(page.getByTestId('onboarding-result')).toBeVisible();
  return page;
}

test('onboarding is saved: home, /me and cards use the customer\'s own numbers; other browsers stay the demo customer', async ({ browser }) => {
  const a = await newCustomer(browser);
  const b = await newCustomer(browser);
  const demo = (await (await b.request.get('/api/v1/me')).json()).data;
  expect(demo.onboarded).toBe(false);

  const page = await onboard(a, '3,000', '0');
  const me = (await (await a.request.get('/api/v1/me')).json()).data;
  expect(me).toMatchObject({ onboarded: true, monthlySalaryFils: 3_000_000, existingObligationsFils: 0, cprMasked: '******345' });
  const vehicleLimit = (m: typeof me) => m.preApproval.limits.find((l: { productLine: string }) => l.productLine === 'vehicle').maxFinanceFils;
  expect(vehicleLimit(me)).not.toBe(vehicleLimit(demo));

  // Home page shows the onboarded customer's pre-approval.
  await page.goto('/en');
  await expect(page.getByTestId('preapproval')).toContainText(`Up to ${bhd0(vehicleLimit(me))}`);
  await expect(page.getByTestId('preapproval')).toContainText(bhd0(me.preApproval.cardLimitFils));

  // BHD 3,000 qualifies for World Elite (min BHD 2,500); the demo customer (BHD 1,400) does not.
  await page.goto('/en/cards');
  await expect(page.getByTestId('apply-imtiaz-world-elite')).toBeVisible();
  const cardsA = (await (await a.request.get('/api/v1/cards')).json()).data.items;
  expect(cardsA.find((c: { id: string }) => c.id === 'imtiaz-world-elite')).toMatchObject({ eligible: true, ineligibleReason: null });

  const other = await b.newPage();
  await other.goto('/en');
  await expect(other.getByTestId('preapproval')).toContainText(`Up to ${bhd0(vehicleLimit(demo))}`);
  await other.goto('/en/cards');
  await expect(other.getByTestId('apply-imtiaz-world-elite')).toHaveCount(0);
  await expect(other.getByTestId('ineligible-imtiaz-world-elite')).toContainText("Your salary is below this card's minimum.");
  const cardsB = (await (await b.request.get('/api/v1/cards')).json()).data.items;
  expect(cardsB.find((c: { id: string }) => c.id === 'imtiaz-world-elite')).toMatchObject({ eligible: false, ineligibleReason: 'BELOW_MIN_SALARY' });

  // Finance decisions use the session's own financials too.
  const app = (
    await (
      await a.request.post('/api/v1/applications', {
        data: { productLine: 'personal', structure: 'conventional', amountFils: 5_000_000, tenureMonths: 48 },
        headers: { 'Idempotency-Key': `e2e-own-${Date.now()}` },
      })
    ).json()
  ).data;
  expect(app.applicant).toEqual({ monthlySalaryFils: 3_000_000, existingObligationsFils: 0 });
  await a.close();
  await b.close();
});

test('applications and cards are private to the customer who created them', async ({ browser }) => {
  const a = await newCustomer(browser);
  const b = await newCustomer(browser);

  // A applies for car finance and a card in the browser.
  const pageA = await a.newPage();
  await pageA.goto('/en/cars/v-honda-crv-2026');
  await expect(pageA.getByTestId('apply-finance')).toBeEnabled();
  await pageA.getByTestId('apply-finance').click();
  await expect(pageA).toHaveURL(/\/en\/applications\/app_sbx_/);
  const appId = pageA.url().split('/').pop()!;
  await pageA.goto('/en/cards/imtiaz-world/apply');
  await pageA.getByTestId('confirm-card').click();
  await expect(pageA.getByTestId('card-approved')).toBeVisible();
  const cardsA = (await (await a.request.get('/api/v1/me/cards')).json()).data.items;
  expect(cardsA).toHaveLength(1);

  // B cannot read, accept or list A's application or card.
  expect((await b.request.get(`/api/v1/applications/${appId}`)).status()).toBe(404);
  expect((await b.request.post(`/api/v1/applications/${appId}/accept`)).status()).toBe(404);
  expect((await (await b.request.get('/api/v1/applications')).json()).data.items).toEqual([]);
  expect((await (await b.request.get('/api/v1/me/cards')).json()).data.items).toEqual([]);
  expect((await b.request.get(`/api/v1/me/cards/${cardsA[0].id}`)).status()).toBe(404);
  const pageB = await b.newPage();
  const res = await pageB.goto(`/en/applications/${appId}`);
  expect(res?.status()).toBe(404);

  // A still sees both.
  expect((await a.request.get(`/api/v1/applications/${appId}`)).status()).toBe(200);
  expect((await a.request.get(`/api/v1/me/cards/${cardsA[0].id}`)).status()).toBe(200);

  // Idempotency keys are per customer: the same key in B creates B's own application.
  const key = `e2e-shared-key-${Date.now()}`;
  const body = { productLine: 'personal', structure: 'murabaha', amountFils: 2_000_000, tenureMonths: 24 };
  const first = (await (await a.request.post('/api/v1/applications', { data: body, headers: { 'Idempotency-Key': key } })).json()).data;
  const second = (await (await b.request.post('/api/v1/applications', { data: body, headers: { 'Idempotency-Key': key } })).json()).data;
  expect(second.id).not.toBe(first.id);
  expect(second.customerId).not.toBe(first.customerId);
  await a.close();
  await b.close();
});

test('My cards on the account page lists the issued card (masked, status, limit)', async ({ page }) => {
  await page.goto('/en/account');
  await expect(page.getByTestId('my-cards')).toContainText('No cards yet');
  await page.goto('/en/cards/imtiaz-platinum/apply');
  const offered = await page.getByTestId('offered-limit').innerText();
  await page.getByTestId('confirm-card').click();
  await expect(page.getByTestId('card-approved')).toBeVisible();

  await page.goto('/en/account');
  const card = page.getByTestId('my-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('masked-pan')).toHaveText(/^5xxx xxxx xxxx \d{4}$/);
  await expect(card.getByTestId('my-card-status')).toHaveText('Active');
  await expect(card.getByTestId('my-card-limit')).toHaveText(offered);
  await expect(page.getByTestId('my-cards')).toContainText('Sandbox');
  await expect(page.getByTestId('session-note')).toContainText('this session only');

  await page.goto('/ar/account');
  await expect(page.getByTestId('my-cards')).toContainText('بطاقاتي');
  await expect(page.getByTestId('my-card-status')).toHaveText('فعّالة');
});

test('session cookie is HttpOnly and SameSite=Lax; the app uses the X-Sahel-Session header instead', async ({ page, request, playwright }) => {
  await page.goto('/en/cards/imtiaz-world/apply');
  await page.getByTestId('confirm-card').click();
  await expect(page.getByTestId('card-approved')).toBeVisible();
  const cookie = (await page.context().cookies()).find((c) => c.name === 'sahel_session');
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  expect(cookie!.value).toMatch(/^[A-Za-z0-9_-]{32}$/);

  // Mobile protocol: ask for a session, then send its id back. No cookie is involved.
  const app = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const first = await app.get('/api/v1/me', { headers: { 'X-Sahel-Session': 'new' } });
  const id = first.headers()['x-sahel-session'];
  expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(first.headers()['set-cookie']).toBeUndefined();
  const pre = await app.post('/api/v1/onboarding/pre-approval', {
    headers: { 'X-Sahel-Session': id },
    data: { monthlySalaryFils: 2_000_000, existingObligationsFils: 100_000, consentScopes: ['CRB', 'OPEN_BANKING'] },
  });
  expect(pre.headers()['x-sahel-session']).toBe(id);
  const me = (await (await app.get('/api/v1/me', { headers: { 'X-Sahel-Session': id } })).json()).data;
  expect(me).toMatchObject({ onboarded: true, monthlySalaryFils: 2_000_000 });
  // A made-up id is never adopted: the API starts a new session with its own id.
  const forged = await app.get('/api/v1/me', { headers: { 'X-Sahel-Session': 'A'.repeat(32) } });
  expect(forged.headers()['x-sahel-session']).not.toBe('A'.repeat(32));
  expect((await forged.json()).data.onboarded).toBe(false);
  await app.dispose();

  // The browser session's id never appears in a response body or header.
  const body = await (await page.request.get('/api/v1/me')).text();
  expect(body).not.toContain(cookie!.value);
  expect((await request.get('/api/v1/me')).headers()['x-sahel-session']).toBeUndefined();
});

test('GET /config and quote defaults give the app every rule it needs', async ({ request }) => {
  const cfg = (await (await request.get('/api/v1/config')).json()).data;
  expect(cfg.consent).toEqual({ scopes: ['CRB', 'OPEN_BANKING'], validityDays: 90 });
  expect(cfg.finance.vehicle).toMatchObject({ defaultDownPaymentPct: 20, defaultTenureMonths: 60, downPaymentStepFils: 100_000, tenureStepMonths: 12 });
  expect(cfg.finance.home).toMatchObject({ defaultTenureMonths: 240, downPaymentStepFils: 1_000_000 });
  expect(cfg.personalFinance).toMatchObject({ minAmountFils: 500_000, amountStepFils: 100_000, defaultTenureMonths: 48, tenureStepMonths: 6 });
  expect(cfg.reservationDepositFils).toBe(100_000);

  const quote = (await (await request.post('/api/v1/quotes/finance', { data: { productLine: 'home', assetPriceFils: 72_000_000 } })).json()).data;
  expect(quote.limits).toMatchObject({ defaultDownPaymentFils: 14_400_000, defaultTenureMonths: 240, downPaymentStepFils: 1_000_000, tenureStepMonths: 12 });
  expect(quote.quotes[0]).toMatchObject({ downPaymentFils: 14_400_000, tenureMonths: 240 });
});
