import { expect, test } from '@playwright/test';

test('home shows pre-approval and budget cars (English, LTR)', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByTestId('preapproval')).toContainText("You're pre-approved");
  await expect(page.getByTestId('vehicle-card').first()).toBeVisible();
});

test('Arabic is right-to-left', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('preapproval')).toContainText('أنت مؤهل مبدئياً');
});

test('car detail compares Murabaha and conventional, matching the API', async ({ page, request }) => {
  await page.goto('/en/cars/v-honda-crv-2026');
  const calc = page.getByTestId('finance-calculator');
  await expect(calc.getByTestId('quote-conventional')).toBeVisible();
  await expect(calc.getByTestId('quote-murabaha')).toBeVisible();

  // Parity check: the web calculator shows exactly what the API (used by Flutter) returns.
  const res = await request.post('/api/v1/quotes/finance', {
    data: { productLine: 'vehicle', assetPriceFils: 14_900_000, downPaymentFils: 3_000_000, tenureMonths: 60 },
  });
  const { data } = await res.json();
  const murabaha = data.quotes.find((q: { structure: string }) => q.structure === 'murabaha');
  const expected = `BHD ${(murabaha.monthlyFils / 1000).toLocaleString('en', { minimumFractionDigits: 3 })}`;
  await expect(calc.getByTestId('monthly-murabaha')).toHaveText(expected);
});

test('insurance quotes load and can filter Takaful only', async ({ page }) => {
  await page.goto('/en/cars/v-honda-crv-2026');
  const ins = page.getByTestId('insurance-quotes');
  await expect(ins.getByRole('listitem')).toHaveCount(4);
  await ins.getByLabel('Takaful only').check();
  await expect(ins.getByRole('listitem')).toHaveCount(2);
});

test('reserve a car with BenefitPay (sandbox)', async ({ page }) => {
  await page.goto('/en/cars/v-honda-city-2026');
  await page.getByTestId('reserve').click();
  await page.getByLabel('BenefitPay').check();
  await page.getByTestId('pay').click();
  await expect(page.getByTestId('payment-success')).toContainText('Payment successful');
});

test('car search filters by condition', async ({ page }) => {
  await page.goto('/en/cars?condition=used');
  const cards = page.getByTestId('vehicle-card');
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allInnerTexts()) expect(text).toContain('Used');
});
