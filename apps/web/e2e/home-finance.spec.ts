import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Home finance (J4): conventional and Ijara Muntahia Bittamleek from a property for sale, server-priced valuation
// fees and deposits (P1), and settled contracts freeing DBR headroom. ⚠️ Sandbox: placeholder rules and amounts.

const bhd = (fils: number) =>
  `BHD ${new Intl.NumberFormat('en-BH', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(fils / 1000)}`;

const PROPERTY = 'p-amwaj-apt-2br';

/** Onboard the page's session with a salary that can carry a home (BHD 5,000, no obligations). */
async function onboardWealthy(api: APIRequestContext) {
  const res = await api.post('/api/v1/onboarding/pre-approval', {
    data: { monthlySalaryFils: 5_000_000, existingObligationsFils: 0, employer: 'Bahrain Co.', consentScopes: ['CRB', 'OPEN_BANKING'] },
  });
  expect(res.status()).toBe(200);
}

async function stepStatuses(page: Page) {
  return page.getByTestId('timeline-step').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
}

const step = (page: Page, status: string) => page.locator(`[data-testid="timeline-step"][data-status="${status}"]`);

test('Ijara home finance: apply from the property page, accept, BCFC buys then leases; ownership transfer is a future step', async ({ page }) => {
  await onboardWealthy(page.request);
  await page.goto(`/en/property/${PROPERTY}`);
  const apply = page.getByTestId('apply-finance');
  await expect(apply).toHaveText('Apply for home finance');
  await expect(apply).toBeEnabled();
  const calc = page.getByTestId('finance-calculator');
  await calc.getByTestId('quote-ijara').click();
  const calculatorMonthly = await calc.getByTestId('monthly-ijara').innerText();

  await apply.click();
  await expect(page).toHaveURL(/\/en\/applications\/app_sbx_/);
  await expect(page.locator('h1')).toHaveText('Sea-view 2-bedroom apartment');
  await expect(page.getByTestId('decision')).toHaveAttribute('data-outcome', 'APPROVED');
  const offer = page.getByTestId('offer-summary');
  await expect(offer).toContainText('Islamic · Ijara');
  await expect(offer).toContainText('Monthly rental');
  await expect(offer).toContainText('BHD 98,000');
  await expect(page.getByTestId('offer-monthly')).toHaveText(calculatorMonthly);
  // Islamic products are never labelled "interest".
  expect((await offer.innerText()).toLowerCase()).not.toContain('interest');
  await expect(page.getByTestId('ijara-steps')).toContainText('BCFC must own the home before leasing it');

  await page.getByTestId('accept-offer').click();
  await expect(page.getByTestId('accept-offer')).toHaveCount(0);
  await expect(page.getByTestId('lease-active')).toBeVisible();
  await expect(step(page, 'LEASE_STARTED')).toHaveAttribute('data-done', 'true');
  await expect(step(page, 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER')).toHaveAttribute('data-done', 'false');
  await expect(step(page, 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER')).toContainText('Ownership transfers to you after the final rental');
  expect(await stepStatuses(page)).toEqual([
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'OFFER_ACCEPTED',
    'CONTRACT_SIGNED',
    'ASSET_PURCHASED_BY_BCFC',
    'LEASE_STARTED',
    'OWNERSHIP_TRANSFERRED_TO_CUSTOMER',
    'COMPLETED',
  ]);
  await expect(page.getByTestId('ijara-steps').getByTestId('timeline-step')).toHaveCount(3);
  await expect(page.getByTestId('murabaha-steps')).toHaveCount(0);
});

test('conventional home finance waits for the TRESCO valuation fee, then pays out', async ({ page }) => {
  await onboardWealthy(page.request);
  const price = (await (await page.request.get(`/api/v1/payments/price?purpose=valuation_fee&reference=${PROPERTY}`)).json()).data;
  await page.goto(`/en/property/${PROPERTY}`);
  await expect(page.getByTestId('request-valuation')).toContainText(`Request valuation · BHD ${(price.amountFils / 1000).toLocaleString('en')}`);
  await expect(page.getByTestId('apply-finance')).toBeEnabled();
  await page.getByTestId('finance-calculator').getByTestId('quote-conventional').click();
  await page.getByTestId('apply-finance').click();
  await expect(page).toHaveURL(/\/en\/applications\//);
  await expect(page.getByTestId('offer-summary')).toContainText('Conventional');
  const url = page.url();

  await page.getByTestId('accept-offer').click();
  const valuation = page.getByTestId('valuation-step');
  await expect(valuation).toHaveAttribute('data-paid', 'false');
  await expect(step(page, 'CONTRACT_SIGNED')).toHaveAttribute('data-done', 'true');
  await expect(step(page, 'VALUATION_CONFIRMED')).toHaveAttribute('data-done', 'false');
  await expect(step(page, 'DISBURSED')).toHaveAttribute('data-done', 'false');

  // Pay the server-priced fee in the sandbox checkout (the link carries no amount).
  await page.getByTestId('pay-valuation').click();
  await expect(page).toHaveURL(/\/en\/checkout\?purpose=valuation_fee&reference=p-amwaj-apt-2br/);
  await expect(page.getByTestId('checkout-amount')).toHaveText(bhd(price.amountFils));
  await expect(page.getByTestId('server-priced')).toBeVisible();
  await page.getByTestId('pay').click();
  await expect(page.getByTestId('payment-success')).toBeVisible();

  await page.goto(url);
  await expect(valuation).toHaveAttribute('data-paid', 'true');
  await page.getByTestId('continue-fulfilment').click();
  await expect(step(page, 'COMPLETED')).toHaveAttribute('data-done', 'true');
  await expect(page.getByTestId('valuation-step')).toHaveCount(0);
  expect(await stepStatuses(page)).toEqual([
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'OFFER_ACCEPTED',
    'CONTRACT_SIGNED',
    'VALUATION_CONFIRMED',
    'DISBURSED',
    'COMPLETED',
  ]);
  const app = (await (await page.request.get(`/api/v1/applications/${url.split('/').pop()}`)).json()).data;
  expect(app.status).toBe('COMPLETED');
  expect(app.valuationPaymentId).toMatch(/^pay_sbx_/);
});

test('the decision uses the session customer: the demo customer cannot carry this home', async ({ page }) => {
  await page.goto(`/en/property/${PROPERTY}`);
  await expect(page.getByTestId('apply-finance')).toBeEnabled();
  await page.getByTestId('apply-finance').click();
  await expect(page).toHaveURL(/\/en\/applications\//);
  await expect(page.getByTestId('decision')).toHaveAttribute('data-outcome', 'DECLINED');
  await expect(page.locator('[data-reason="DBR_EXCEEDED"]')).toBeVisible();
  await expect(page.locator('[data-reason="AMOUNT_ABOVE_PREAPPROVAL"]')).toBeVisible();
  await expect(page.getByTestId('accept-offer')).toHaveCount(0);
});

test('home finance API: price from the catalog, structures from the rate card, rentals refused', async ({ request }) => {
  await onboardWealthy(request);
  const post = (data: object, key: string) => request.post('/api/v1/applications', { data, headers: { 'Idempotency-Key': key } });
  const base = { productLine: 'home', structure: 'ijara', propertyId: PROPERTY, downPaymentFils: 19_600_000, tenureMonths: 240 };
  const created = await post({ ...base, assetPriceFils: 1, amountFils: 1 }, `e2e-home-${Date.now()}`);
  expect(created.status()).toBe(201);
  const app = (await created.json()).data;
  expect(app).toMatchObject({ productLine: 'home', structure: 'ijara', reference: PROPERTY, status: 'APPROVED' });
  expect(app.quote.assetPriceFils).toBe(98_000_000);
  expect(app.steps.filter((s: { ijara: boolean }) => s.ijara).map((s: { status: string }) => s.status)).toEqual([
    'ASSET_PURCHASED_BY_BCFC',
    'LEASE_STARTED',
    'OWNERSHIP_TRANSFERRED_TO_CUSTOMER',
  ]);
  const accepted = (await (await request.post(`/api/v1/applications/${app.id}/accept`)).json()).data;
  expect(accepted.status).toBe('LEASE_STARTED');

  expect((await post({ ...base, structure: 'murabaha' }, `e2e-home-mur-${Date.now()}`)).status()).toBe(422);
  expect((await post({ ...base, propertyId: 'p-seef-apt-1br' }, `e2e-home-rent-${Date.now()}`)).status()).toBe(422);
  expect((await post({ ...base, propertyId: 'p-nope' }, `e2e-home-404-${Date.now()}`)).status()).toBe(404);
  expect((await post({ ...base, downPaymentFils: 0 }, `e2e-home-down-${Date.now()}`)).status()).toBe(422);
  // Vehicles still do not offer Ijara.
  const car = await post({ productLine: 'vehicle', structure: 'ijara', vehicleId: 'v-honda-crv-2026', downPaymentFils: 3_000_000, tenureMonths: 60 }, `e2e-car-ijara-${Date.now()}`);
  expect(car.status()).toBe(422);
});

test('server-side amounts: deposits and valuation fees must match the server price (422 AMOUNT_MISMATCH)', async ({ request, page }) => {
  const price = async (purpose: string, reference: string) => request.get(`/api/v1/payments/price?purpose=${purpose}&reference=${reference}`);
  const deposit = (await (await price('reservation_deposit', 'v-honda-crv-2026')).json()).data;
  const config = (await (await request.get('/api/v1/config')).json()).data;
  expect(deposit.amountFils).toBe(config.reservationDepositFils);
  const fee = (await (await price('valuation_fee', PROPERTY)).json()).data;
  expect(fee).toMatchObject({ purpose: 'valuation_fee', reference: PROPERTY, currency: 'BHD' });
  expect((await price('valuation_fee', 'p-seef-apt-1br')).status()).toBe(404);
  expect((await (await price('installment', 'c-1001-15')).json()).error.code).toBe('NOT_SERVER_PRICED');

  const pay = (purpose: string, reference: string, amountFils: number) =>
    request.post('/api/v1/payments', {
      data: { amountFils, method: 'card', purpose, reference },
      headers: { 'Idempotency-Key': `e2e-bind-${purpose}-${amountFils}-${Date.now()}` },
    });
  for (const [purpose, reference, amount] of [
    ['valuation_fee', PROPERTY, fee.amountFils],
    ['reservation_deposit', 'v-honda-crv-2026', deposit.amountFils],
  ] as const) {
    const wrong = await pay(purpose, reference, amount - 1);
    expect(wrong.status()).toBe(422);
    expect((await wrong.json()).error.code).toBe('AMOUNT_MISMATCH');
    expect((await pay(purpose, reference, amount)).status()).toBe(201);
  }
  expect((await pay('reservation_deposit', 'v-nope', deposit.amountFils)).status()).toBe(404);

  // A tampered checkout link still shows (and charges) the server amount.
  await page.goto(`/en/checkout?purpose=valuation_fee&amount=1&reference=${PROPERTY}&label=Valuation`);
  await expect(page.getByTestId('checkout-amount')).toHaveText(bhd(fee.amountFils));
  await page.getByTestId('pay').click();
  await expect(page.getByTestId('payment-success')).toContainText(bhd(fee.amountFils));
});

test('settling a contract frees DBR headroom: obligations, pre-approval, personal finance range and bundles reflect it', async ({ request }) => {
  const me0 = (await (await request.get('/api/v1/me')).json()).data;
  const c1001 = me0.contracts.find((c: { id: string }) => c.id === 'c-1001');
  const q = (await (await request.get('/api/v1/me/contracts/c-1001/settlement-quote')).json()).data;
  const created = (
    await (
      await request.post('/api/v1/payments', {
        data: { amountFils: q.settlementAmountFils, method: 'card', purpose: 'early_settlement', reference: q.payment.reference },
        headers: { 'Idempotency-Key': `e2e-settle-free-${Date.now()}` },
      })
    ).json()
  ).data;
  expect((await request.post(`/api/v1/payments/${created.id}/confirm`)).status()).toBe(200);

  const me1 = (await (await request.get('/api/v1/me')).json()).data;
  expect(me1.existingObligationsFils).toBe(me0.existingObligationsFils - c1001.quote.monthlyFils);
  expect(me1.preApproval.maxMonthlyFils).toBe(me0.preApproval.maxMonthlyFils + c1001.quote.monthlyFils);
  const home = (m: typeof me0) => m.preApproval.limits.find((l: { productLine: string }) => l.productLine === 'home').maxFinanceFils;
  expect(home(me1)).toBeGreaterThan(home(me0));
  const config = (await (await request.get('/api/v1/config')).json()).data;
  expect(config.personalFinance.preApprovedFils).toBe(me1.preApproval.limits.find((l: { productLine: string }) => l.productLine === 'personal').maxFinanceFils);
  // The life-event bundle check uses the same freed headroom.
  const bundle = (await (await request.get('/api/v1/life-events/married/bundle?structure=islamic')).json()).data;
  expect(bundle.maxMonthlyFils).toBe(me1.preApproval.maxMonthlyFils);
});

test('Arabic: apply for Ijara home finance, right-to-left timeline with the Ijara note', async ({ page }) => {
  await onboardWealthy(page.request);
  await page.goto(`/ar/property/${PROPERTY}`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const apply = page.getByTestId('apply-finance');
  await expect(apply).toHaveText('تقدّم بطلب تمويل سكني');
  await expect(apply).toBeEnabled();
  await page.getByTestId('finance-calculator').getByTestId('quote-ijara').click();
  await apply.click();
  await expect(page).toHaveURL(/\/ar\/applications\//);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('ijara-steps')).toContainText('يجب أن تتملك BCFC المنزل قبل تأجيره لك');
  await expect(step(page, 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER')).toContainText('تنتقل الملكية إليك بعد دفع آخر أجرة');
  await expect(page.getByTestId('offer-summary')).toContainText('الإيجار الشهري');
});
