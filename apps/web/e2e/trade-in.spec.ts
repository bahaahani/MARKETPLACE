import { expect, test } from '@playwright/test';

// Instant trade-in valuation (⚠️ sandbox rules model, not AI) → the offer becomes a car's down payment.

const bhd0 = (fils: number) => `BHD ${new Intl.NumberFormat('en-BH', { maximumFractionDigits: 0 }).format(fils / 1000)}`;
const bhd3 = (fils: number) =>
  `BHD ${new Intl.NumberFormat('en-BH', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(fils / 1000)}`;

test('value the My Garage car, then use it as the down payment on a car page', async ({ page }) => {
  await page.goto('/en/account');
  await page.getByTestId('garage-tradein').click();
  await expect(page).toHaveURL(/\/en\/trade-in\?garage=v-honda-crv-2026/);
  await expect(page.getByTestId('tradein-sandbox')).toContainText('not AI');
  // Pre-filled from My Garage, plate masked.
  await expect(page.getByTestId('tradein-garage')).toHaveValue('v-honda-crv-2026');
  await expect(page.getByTestId('tradein-plate-masked')).toHaveValue('****56');
  await expect(page.getByTestId('tradein-mileage')).toHaveValue('27850');
  await page.getByTestId('tradein-condition-excellent').click();
  await page.getByTestId('tradein-submit').click();

  const result = page.getByTestId('tradein-result');
  await expect(result).toBeVisible();
  const { offer } = (await (await page.request.get('/api/v1/me/trade-in')).json()).data;
  expect(offer.valuation.vehicle).toMatchObject({ make: 'Honda', model: 'CR-V', condition: 'excellent', plateMasked: '****56' });
  await expect(page.getByTestId('tradein-offer')).toHaveText(bhd0(offer.offerFils));
  await expect(page.getByTestId('tradein-range')).toHaveText(`${bhd0(offer.valuation.rangeLowFils)} to ${bhd0(offer.valuation.rangeHighFils)}`);
  await expect(page.getByTestId('tradein-valid')).toContainText('Valid until');
  await expect(page.getByTestId('tradein-breakdown')).toContainText('Reference price (2026 model)');
  // The trade-in page never shows the full plate (the account page it came from does, as before).
  await page.reload();
  expect(await page.content()).not.toContain('123456');
  await expect(page.getByTestId('tradein-result')).toContainText('#****56');

  // Use it on a car: the calculator's down payment becomes min(offer, maximum down payment).
  await page.goto('/en/cars/v-honda-crv-2026');
  const use = page.getByTestId('tradein-use-button');
  await expect(use).toHaveText(`Use my trade-in (${bhd0(offer.offerFils)})`);
  const forVehicle = (await (await page.request.get('/api/v1/me/trade-in?vehicleId=v-honda-crv-2026')).json()).data.forVehicle;
  expect(forVehicle.downPaymentFils).toBe(Math.min(offer.offerFils, forVehicle.downPaymentFils));
  await use.click();
  await expect(page.getByTestId('tradein-applied')).toHaveText(`Trade-in applied: ${bhd0(forVehicle.downPaymentFils)} down payment.`);
  await expect(page.getByTestId('tradein-use')).toContainText('credited at delivery');
  const calc = page.getByTestId('finance-calculator');
  await expect(calc.locator('output').first()).toHaveText(bhd0(forVehicle.downPaymentFils));
  await expect(calc.locator('input[type=range]').first()).toHaveValue(String(forVehicle.downPaymentFils));

  // The figures equal the API's for that down payment (same pricing engine).
  const api = (
    await (
      await page.request.post('/api/v1/quotes/finance', {
        data: { productLine: 'vehicle', assetPriceFils: 14_900_000, downPaymentFils: forVehicle.downPaymentFils, tenureMonths: 60 },
      })
    ).json()
  ).data;
  const murabaha = api.quotes.find((q: { structure: string }) => q.structure === 'murabaha');
  await expect(calc.getByTestId('monthly-murabaha')).toHaveText(bhd3(murabaha.monthlyFils));
});

test('an offer above the maximum down payment is capped; withdrawing removes it', async ({ page }) => {
  const res = await page.request.post('/api/v1/trade-in/valuations', {
    data: { make: 'Toyota', model: 'Land Cruiser', year: 2025, mileageKm: 10_000, condition: 'excellent', accidentHistory: false, plate: '98 765' },
  });
  expect(res.status()).toBe(201);
  const offer = (await res.json()).data;
  expect(offer.valuation.vehicle.plateMasked).toBe('***65');
  expect(JSON.stringify(offer)).not.toContain('98765');

  await page.goto('/en/cars/v-honda-city-2026');
  await page.getByTestId('tradein-use-button').click();
  // Honda City BHD 7,450: maximum down payment 90% (BHD 6,705), on the BHD 100 step.
  await expect(page.getByTestId('finance-calculator').locator('output').first()).toHaveText('BHD 6,700');
  await expect(page.getByTestId('tradein-use')).toContainText('above the maximum down payment');

  await page.goto('/en/trade-in');
  await expect(page.getByTestId('tradein-offer')).toHaveText(bhd0(offer.offerFils));
  await page.getByTestId('tradein-withdraw').click();
  await expect(page.getByTestId('tradein-withdrawn')).toBeVisible();
  expect((await (await page.request.get('/api/v1/me/trade-in')).json()).data.offer).toBeNull();
  await page.goto('/en/cars/v-honda-city-2026');
  await expect(page.getByTestId('finance-calculator')).toBeVisible();
  await expect(page.getByTestId('tradein-use')).toHaveCount(0);
});

test('trade-in page in Arabic is RTL; the cars page links to it', async ({ page }) => {
  await page.goto('/ar/cars');
  await page.getByTestId('tradein-entry').click();
  await expect(page).toHaveURL(/\/ar\/trade-in$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('استبدل سيارتك');
  await page.getByTestId('tradein-garage').selectOption('');
  await page.getByTestId('tradein-make').selectOption('Kia');
  await page.getByTestId('tradein-model').selectOption('Picanto');
  await page.getByTestId('tradein-year').selectOption('2022');
  await page.getByTestId('tradein-mileage').fill('45000');
  await page.getByTestId('tradein-submit').click();
  await expect(page.getByTestId('tradein-offer')).toContainText('د.ب.');
  await expect(page.getByTestId('tradein-range')).toContainText('من');
});

test('trade-in API: validation, suggestions and session isolation', async ({ playwright }) => {
  const baseURL = test.info().project.use.baseURL;
  const a = await playwright.request.newContext({ baseURL });
  const b = await playwright.request.newContext({ baseURL });
  try {
    const value = (data: unknown) => a.post('/api/v1/trade-in/valuations', { data: data as object });
    const camry = { make: 'Toyota', model: 'Camry', year: 2021, mileageKm: 60_000, condition: 'good' };

    const unknown = await value({ ...camry, make: 'Toyta' });
    expect(unknown.status()).toBe(422);
    expect((await unknown.json()).error).toMatchObject({ code: 'UNKNOWN_MAKE', suggestions: ['Toyota'] });
    expect((await (await value({ ...camry, model: 'Camri' })).json()).error.suggestions).toEqual(['Camry']);
    expect((await (await value({ ...camry, year: 1990 })).json()).error.code).toBe('YEAR_OUT_OF_RANGE');
    expect((await (await value({ ...camry, mileageKm: 900_000 })).json()).error.code).toBe('MILEAGE_OUT_OF_RANGE');
    expect((await (await value({ ...camry, condition: 'mint' })).json()).error.code).toBe('INVALID_CONDITION');
    expect((await (await value({ ...camry, plate: 'ABC' })).json()).error.code).toBe('INVALID_PLATE');
    expect((await a.post('/api/v1/trade-in/valuations', { data: '[1]', headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
    expect((await a.get('/api/v1/me/trade-in?vehicleId=nope')).status()).toBe(404);
    expect((await (await a.get('/api/v1/me/trade-in')).json()).data.offer).toBeNull();

    const created = await value(camry);
    expect(created.status()).toBe(201);
    const offer = (await created.json()).data;
    expect(offer.offerFils).toBe(offer.valuation.rangeLowFils);
    expect(offer.valuation.rangeLowFils).toBeLessThan(offer.valuation.rangeHighFils);
    expect(offer.valuation.method).toBe('rules');
    expect((await (await a.get('/api/v1/me/trade-in')).json()).data.offer.id).toBe(offer.id);

    // Another session sees nothing, and cannot withdraw it.
    expect((await (await b.get('/api/v1/me/trade-in?vehicleId=v-honda-crv-2026')).json()).data).toEqual({ offer: null, forVehicle: null });
    expect((await (await b.delete('/api/v1/me/trade-in')).json()).data.withdrawn).toBe(false);
    expect((await (await a.get('/api/v1/me/trade-in')).json()).data.offer.id).toBe(offer.id);

    // Config carries the form rules (the Flutter app hard-codes none).
    const rules = (await (await a.get('/api/v1/config')).json()).data.tradeIn;
    expect(rules.conditions).toEqual(['excellent', 'good', 'fair', 'poor']);
    expect(rules.garage[0].plateMasked).toBe('****56');
    expect(JSON.stringify(rules)).not.toContain('123456');

    expect((await (await a.delete('/api/v1/me/trade-in')).json()).data.withdrawn).toBe(true);
    expect((await (await a.get('/api/v1/me/trade-in')).json()).data.offer).toBeNull();
  } finally {
    await a.dispose();
    await b.dispose();
  }
});
