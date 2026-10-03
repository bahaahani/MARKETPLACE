import { expect, test, type Page } from '@playwright/test';

const MURABAHA_ORDER = ['ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_BCFC', 'SALE_TO_CUSTOMER'];

async function stepStatuses(page: Page) {
  return page.getByTestId('timeline-step').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
}

test('apply for car finance (Murabaha), accept and see BCFC own the car before selling it', async ({ page }) => {
  await page.goto('/en/cars/v-honda-crv-2026');
  // Enabled once hydrated and the calculator has published its selection.
  await expect(page.getByTestId('apply-finance')).toBeEnabled();
  const calc = page.getByTestId('finance-calculator');
  await calc.getByTestId('quote-murabaha').click();
  const calculatorMonthly = await calc.getByTestId('monthly-murabaha').innerText();

  await page.getByTestId('apply-finance').click();
  await expect(page).toHaveURL(/\/en\/applications\/app_sbx_/);
  await expect(page.getByTestId('decision')).toHaveAttribute('data-outcome', 'APPROVED');
  await expect(page.getByTestId('decision-reason')).toContainText('fits within your borrowing room');
  // The offer is exactly what the calculator showed.
  await expect(page.getByTestId('offer-monthly')).toHaveText(calculatorMonthly);
  await expect(page.getByTestId('offer-summary')).toContainText('Islamic · Murabaha');
  await expect(page.getByTestId('murabaha-steps')).toContainText("Shari'a requirement");
  await expect(page.locator('[data-testid="timeline-step"][data-status="OFFER_ACCEPTED"]')).toHaveAttribute('data-done', 'false');

  await page.getByTestId('accept-offer').click();
  await expect(page.getByTestId('accept-offer')).toHaveCount(0);
  await expect(page.locator('[data-testid="timeline-step"][data-status="COMPLETED"]')).toHaveAttribute('data-done', 'true');
  await expect(page.locator('[data-testid="timeline-step"][data-done="false"]')).toHaveCount(0);

  const statuses = await stepStatuses(page);
  expect(statuses).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED', 'OFFER_ACCEPTED', 'CONTRACT_SIGNED', ...MURABAHA_ORDER, 'COMPLETED']);
  await expect(page.getByTestId('murabaha-steps').getByTestId('timeline-step')).toHaveCount(3);
});

test('apply carries the calculator selection (conventional, 84 months)', async ({ page }) => {
  await page.goto('/en/cars/v-honda-city-2026');
  await expect(page.getByTestId('apply-finance')).toBeEnabled();
  const calc = page.getByTestId('finance-calculator');
  await calc.getByRole('slider', { name: 'Tenure' }).fill('84');
  await calc.getByTestId('quote-conventional').click();
  await expect(calc.getByText('84 months')).toBeVisible();

  await page.getByTestId('apply-finance').click();
  await expect(page).toHaveURL(/\/en\/applications\//);
  const offer = page.getByTestId('offer-summary');
  await expect(offer).toContainText('Conventional');
  await expect(offer).toContainText('84 months');
  // Conventional has no Murabaha steps.
  await expect(page.getByTestId('murabaha-steps')).toHaveCount(0);
});

test('an unaffordable car is declined with a plain-language reason and no offer to accept', async ({ page }) => {
  await page.goto('/en/cars/v-cadillac-escalade-2026');
  await page.getByTestId('apply-finance').click();
  await expect(page).toHaveURL(/\/en\/applications\//);
  await expect(page.getByTestId('decision')).toHaveAttribute('data-outcome', 'DECLINED');
  await expect(page.locator('[data-reason="DBR_EXCEEDED"]')).toContainText('50% debt-burden limit');
  await expect(page.locator('[data-reason="AMOUNT_ABOVE_PREAPPROVAL"]')).toContainText('pre-approved limit');
  await expect(page.getByTestId('accept-offer')).toHaveCount(0);
  expect(await stepStatuses(page)).toEqual(['DRAFT', 'SUBMITTED', 'DECLINED']);
});

test('a thin-margin application is referred for review', async ({ page }) => {
  await page.goto('/en/cars/v-nissan-patrol-2021');
  await page.getByTestId('apply-finance').click();
  await expect(page.getByTestId('decision')).toHaveAttribute('data-outcome', 'REFERRED');
  await expect(page.locator('[data-reason="HIGH_DBR_UTILISATION"]')).toBeVisible();
  await expect(page.getByTestId('accept-offer')).toHaveCount(0);
});

test('personal finance from the home page: apply, accept, funds paid out', async ({ page }) => {
  await page.goto('/en');
  await page.getByTestId('personal-finance-link').click();
  await expect(page).toHaveURL(/\/en\/finance\/personal$/);
  const pf = page.getByTestId('personal-finance');
  await expect(pf.getByTestId('apply-finance')).toBeEnabled();
  await expect(pf.getByTestId('amount')).toHaveText('BHD 5,000');
  await pf.getByTestId('quote-conventional').click();
  await pf.getByTestId('apply-finance').click();

  await expect(page).toHaveURL(/\/en\/applications\//);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Personal finance');
  await expect(page.getByTestId('decision')).toHaveAttribute('data-outcome', 'APPROVED');
  await page.getByTestId('accept-offer').click();
  await expect(page.locator('[data-testid="timeline-step"][data-status="DISBURSED"]')).toHaveAttribute('data-done', 'true');
  expect(await stepStatuses(page)).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED', 'OFFER_ACCEPTED', 'CONTRACT_SIGNED', 'DISBURSED', 'COMPLETED']);

  // It shows up under My Sahel.
  await page.goto('/en/account');
  await expect(page.getByTestId('application').first()).toBeVisible();
});

test('application page in Arabic is right-to-left', async ({ page }) => {
  await page.goto('/ar/cars/v-honda-crv-2026');
  await page.getByTestId('apply-finance').click();
  await expect(page).toHaveURL(/\/ar\/applications\//);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('decision')).toContainText('تمت الموافقة');
  await expect(page.getByTestId('murabaha-steps')).toContainText('متطلب شرعي');
});

test.describe('API v1 /applications', () => {
  const crv = { productLine: 'vehicle', structure: 'murabaha', vehicleId: 'v-honda-crv-2026', downPaymentFils: 3_000_000, tenureMonths: 60 };

  test('create is idempotent, readable and listed', async ({ request }) => {
    const key = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const a = await request.post('/api/v1/applications', { data: crv, headers: { 'Idempotency-Key': key } });
    expect(a.status()).toBe(201);
    const first = (await a.json()).data;
    expect(first.status).toBe('APPROVED');
    expect(first.quote.assetPriceFils).toBe(14_900_000);

    const again = await request.post('/api/v1/applications', { data: { ...crv, tenureMonths: 48 }, headers: { 'Idempotency-Key': key } });
    expect((await again.json()).data.id).toBe(first.id);

    const got = await request.get(`/api/v1/applications/${first.id}`);
    expect((await got.json()).data.steps.filter((s: { murabaha: boolean }) => s.murabaha).map((s: { status: string }) => s.status)).toEqual(MURABAHA_ORDER);

    const list = (await (await request.get('/api/v1/applications')).json()).data;
    expect(list.items.map((x: { id: string }) => x.id)).toContain(first.id);

    const accepted = (await (await request.post(`/api/v1/applications/${first.id}/accept`)).json()).data;
    expect(accepted.status).toBe('COMPLETED');
  });

  test('errors: declined offers cannot be accepted, unknown ids, invalid terms', async ({ request }) => {
    const declined = await request.post('/api/v1/applications', {
      data: { ...crv, vehicleId: 'v-cadillac-escalade-2026', downPaymentFils: 9_300_000 },
      headers: { 'Idempotency-Key': `e2e-decl-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    const { id } = (await declined.json()).data;
    const accept = await request.post(`/api/v1/applications/${id}/accept`);
    expect(accept.status()).toBe(409);
    expect((await accept.json()).error.code).toBe('NOT_APPROVED');

    expect((await request.get('/api/v1/applications/nope')).status()).toBe(404);
    const badTenure = await request.post('/api/v1/applications', { data: { ...crv, tenureMonths: 120 }, headers: { 'Idempotency-Key': `e2e-bad-${Date.now()}` } });
    expect(badTenure.status()).toBe(422);
    expect((await badTenure.json()).error.code).toBe('TENURE_OUT_OF_RANGE');
    const noKey = await request.post('/api/v1/applications', { data: crv });
    expect(noKey.status()).toBe(400);
  });
});
