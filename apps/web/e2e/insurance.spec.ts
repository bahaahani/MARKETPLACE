import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Travel + home insurance and "My policies" (sandbox). Policies belong to the browser's customer session; tests
// still look for the policy they bought instead of counting policies (a test may buy several in one session).

/** YYYY-MM-DD in Bahrain (UTC+3), `days` from today. */
function bahrainDate(days: number): string {
  return new Date(Date.now() + 3 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

async function premiums(page: Page, testId: string): Promise<number[]> {
  return page.getByTestId(testId).evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-premium'))));
}

/** Pay on the checkout page and return the issued policy number. */
async function payAndGetPolicy(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/checkout\?.*reference=pq_/);
  await page.getByLabel('BenefitPay').check();
  await page.getByTestId('pay').click();
  await expect(page.getByTestId('payment-success')).toContainText('Payment successful');
  const issued = page.getByTestId('policy-issued');
  await expect(issued).toContainText('Your policy is issued');
  return (await issued.getAttribute('data-policy-number'))!;
}

async function expectPolicyOnAccount(page: Page, policyNumber: string, text: RegExp) {
  await page.goto('/en/account');
  const card = page.locator(`[data-testid="policy"][data-policy-number="${policyNumber}"]`);
  await expect(card).toHaveAttribute('data-status', 'ACTIVE');
  await expect(card).toContainText(text);
  // The demo history policy is listed as expired.
  await expect(page.locator('[data-testid="policy"][data-policy-number="SBX-TRV-25-000000"]')).toHaveAttribute('data-status', 'EXPIRED');
}

test('insurance hub links to motor, travel and home', async ({ page }) => {
  await page.goto('/en/insurance');
  await expect(page.getByTestId('insurance-line-motor')).toBeVisible();
  await expect(page.getByTestId('insurance-quotes')).toBeVisible();
  await page.getByTestId('insurance-line-travel').click();
  await expect(page).toHaveURL(/\/en\/insurance\/travel$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Travel insurance');
  await page.goto('/en/insurance');
  await page.getByTestId('insurance-line-home').click();
  await expect(page).toHaveURL(/\/en\/insurance\/home$/);
});

test('travel quotes are cheapest first, match the API and filter Takaful only', async ({ page, request }) => {
  await page.goto('/en/insurance/travel');
  await page.getByTestId('region-worldwide').click();
  await page.getByTestId('trip-start').fill(bahrainDate(10));
  await page.getByTestId('trip-end').fill(bahrainDate(19));
  await page.getByTestId('adults').fill('2');
  await page.getByTestId('children').fill('1');
  await page.getByTestId('tier-plus').click();
  await page.getByTestId('get-quotes').click();
  const list = page.getByTestId('travel-quote');
  await expect(list).toHaveCount(4);
  await expect(page.getByTestId('travel-quotes')).toContainText('10 days');
  const shown = await premiums(page, 'travel-quote');
  expect(shown).toEqual([...shown].sort((a, b) => a - b));

  const res = await request.post('/api/v1/insurance/travel-quotes', {
    data: { region: 'worldwide', tier: 'plus', startDate: bahrainDate(10), endDate: bahrainDate(19), adults: 2, children: 1 },
  });
  const api = (await res.json()).data.quotes as { premiumFils: number }[];
  expect(shown).toEqual(api.map((q) => q.premiumFils));
  await expect(list.first().getByTestId('premium')).toHaveText(`BHD ${(api[0]!.premiumFils / 1000).toLocaleString('en', { minimumFractionDigits: 3 })} total`);

  await page.getByTestId('travel-quotes').getByLabel('Takaful only').check();
  await expect(list).toHaveCount(2);
});

test('travel dates are validated: no trips in the past or longer than 180 days', async ({ page }) => {
  await page.goto('/en/insurance/travel');
  await page.getByTestId('trip-start').fill(bahrainDate(-1));
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('quote-error')).toContainText('must start today or later');
  await page.getByTestId('trip-start').fill(bahrainDate(1));
  await page.getByTestId('trip-end').fill(bahrainDate(181));
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('quote-error')).toContainText('at most 180 days');
});

test('buy travel insurance: pay the held premium, policy issued and listed in My policies', async ({ page }) => {
  await page.goto('/en/insurance/travel');
  await expect(page.getByTestId('travel-quote')).toHaveCount(4);
  const cheapest = page.getByTestId('travel-quote').first();
  const premium = await cheapest.getByTestId('premium').innerText();
  await cheapest.getByRole('button', { name: 'Buy' }).click();
  await expect(page.getByText(premium.replace(' total', '')).first()).toBeVisible();
  const policyNumber = await payAndGetPolicy(page);
  expect(policyNumber).toMatch(/^SBX-TRV-\d{2}-\d{6}$/);
  await expectPolicyOnAccount(page, policyNumber, /Travel · .*GCC · Basic · 1 travellers/);
});

test('home insurance from a property listing suggests sums insured; buy it', async ({ page }) => {
  await page.goto('/en/property/p-saar-villa-4br');
  await page.getByTestId('insure-home').click();
  await expect(page).toHaveURL(/\/en\/insurance\/home\?propertyId=p-saar-villa-4br/);
  await expect(page.getByTestId('linked-property')).toContainText('4-bedroom villa with garden');
  await expect(page.getByTestId('building-sum')).toHaveValue('141000');
  await expect(page.getByTestId('contents-sum')).toHaveValue('17500');
  await expect(page.getByTestId('home-quote')).toHaveCount(4);
  const shown = await premiums(page, 'home-quote');
  expect(shown).toEqual([...shown].sort((a, b) => a - b));

  await page.getByTestId('home-quote').first().getByRole('button', { name: 'Buy' }).click();
  const policyNumber = await payAndGetPolicy(page);
  expect(policyNumber).toMatch(/^SBX-HOM-/);
  await expectPolicyOnAccount(page, policyNumber, /4-bedroom villa with garden · Building BHD 141,000 · Contents BHD 17,500/);
});

test('home insurance validates sums insured', async ({ page }) => {
  await page.goto('/en/insurance/home');
  await expect(page.getByTestId('home-quote')).toHaveCount(4);
  await page.getByTestId('building-sum').fill('500');
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('quote-error')).toContainText('Check the sums insured');
  await expect(page.getByTestId('home-quote')).toHaveCount(0);
  await page.getByTestId('building-sum').fill('0');
  await page.getByTestId('contents-sum').fill('15000');
  await page.getByTestId('property-type').selectOption('apartment');
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('home-quote')).toHaveCount(4);
  await expect(page.getByTestId('home-quotes')).not.toContainText('Building');
});

test('motor "Buy" also issues a policy', async ({ page }) => {
  await page.goto('/en/insurance');
  const ins = page.getByTestId('insurance-quotes');
  await expect(ins.getByRole('listitem')).toHaveCount(2); // Takaful by default for this customer
  await ins.getByRole('listitem').first().getByRole('button', { name: 'Buy' }).click();
  const policyNumber = await payAndGetPolicy(page);
  expect(policyNumber).toMatch(/^SBX-MTR-/);
  await expectPolicyOnAccount(page, policyNumber, /Motor · .*#123456 · Comprehensive/);
});

test('Arabic: travel page is RTL and translated', async ({ page }) => {
  await page.goto('/ar/insurance/travel');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('تأمين السفر');
  await expect(page.getByTestId('travel-quote')).toHaveCount(4);
  await expect(page.getByTestId('travel-quotes')).toContainText('د.ب.');
});

test.describe('policy binding API', () => {
  async function holdTravelQuote(request: APIRequestContext) {
    const res = await request.post('/api/v1/policies/quotes', {
      data: { line: 'travel', insurerId: 'pearl-takaful', input: { region: 'gcc', startDate: bahrainDate(3), endDate: bahrainDate(5) } },
    });
    expect(res.status()).toBe(201);
    return (await res.json()).data as { id: string; premiumFils: number };
  }
  async function pay(request: APIRequestContext, amountFils: number, reference: string, capture = true) {
    const res = await request.post('/api/v1/payments', {
      data: { amountFils, method: 'card', purpose: 'insurance_premium', reference },
      headers: { 'Idempotency-Key': `e2e-${reference}-${amountFils}-${Math.random()}` },
    });
    const id = (await res.json()).data.id as string;
    if (capture) await request.post(`/api/v1/payments/${id}/confirm`);
    return id;
  }
  const confirm = (request: APIRequestContext, data: object) => request.post('/api/v1/policies/confirm', { data });

  test('refuses a wrong amount (422), an uncaptured payment (409) and a second payment for a bound quote (409)', async ({ request }) => {
    const q = await holdTravelQuote(request);
    const wrong = await confirm(request, { paymentId: await pay(request, q.premiumFils + 1, q.id) });
    expect(wrong.status()).toBe(422);
    expect((await wrong.json()).error.code).toBe('AMOUNT_MISMATCH');

    const pending = await pay(request, q.premiumFils, q.id, false);
    const notCaptured = await confirm(request, { paymentId: pending });
    expect(notCaptured.status()).toBe(409);
    expect((await notCaptured.json()).error.code).toBe('PAYMENT_NOT_CAPTURED');

    await request.post(`/api/v1/payments/${pending}/confirm`);
    const okRes = await confirm(request, { paymentId: pending, quoteId: q.id });
    expect(okRes.status()).toBe(200);
    const policy = (await okRes.json()).data;
    expect(policy).toMatchObject({ status: 'ACTIVE', premiumFils: q.premiumFils, quoteId: q.id, paymentId: pending });
    // Same payment again: same policy
    expect((await (await confirm(request, { paymentId: pending })).json()).data.id).toBe(policy.id);

    const again = await confirm(request, { paymentId: await pay(request, q.premiumFils, q.id) });
    expect(again.status()).toBe(409);
    expect((await again.json()).error.code).toBe('ALREADY_BOUND');

    const mine = (await (await request.get('/api/v1/me/policies')).json()).data.items as { id: string }[];
    expect(mine.map((p) => p.id)).toContain(policy.id);
  });

  test('bad requests are 4xx, never 500', async ({ request }) => {
    for (const url of ['/api/v1/insurance/travel-quotes', '/api/v1/insurance/home-quotes', '/api/v1/policies/quotes', '/api/v1/policies/confirm']) {
      const res = await request.post(url, { headers: { 'Content-Type': 'application/json' }, data: 'null' });
      expect(res.status(), url).toBe(400);
    }
    expect((await confirm(request, { paymentId: 'pay_nope' })).status()).toBe(404);
    expect((await confirm(request, {})).status()).toBe(400);
    const travel = await request.post('/api/v1/insurance/travel-quotes', { data: { region: 'gcc', startDate: bahrainDate(1), endDate: bahrainDate(2), adults: 99 } });
    expect((await travel.json()).error.code).toBe('INVALID_TRAVELLERS');
    const home = await request.post('/api/v1/insurance/home-quotes', { data: { propertyType: 'villa', buildingSumInsuredFils: 1.5, contentsSumInsuredFils: 0 } });
    expect(home.status()).toBe(422);
    const insurer = await request.post('/api/v1/policies/quotes', { data: { line: 'home', insurerId: 'acme', input: { propertyType: 'villa', buildingSumInsuredFils: 100_000_000, contentsSumInsuredFils: 0 } } });
    expect((await insurer.json()).error.code).toBe('INSURER_NOT_FOUND');
  });
});
