import { expect, test } from '@playwright/test';

// Life-Event Engine (idea #2): curated bundles priced with the pricing engine, checked against DBR headroom.

const bhd = (fils: number) =>
  `BHD ${new Intl.NumberFormat('en-BH', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(fils / 1000)}`;

test('home → life events → married bundle: over budget, totals equal the API, Islamic never says interest', async ({ page, request }) => {
  await page.goto('/en');
  await page.getByTestId('life-events-cta').click();
  await expect(page).toHaveURL(/\/en\/life-events$/);
  await expect(page.getByTestId(/^life-event-/)).toHaveCount(4);
  await page.getByTestId('life-event-married').click();
  await expect(page).toHaveURL(/\/en\/life-events\/married$/);

  const api = (await (await request.get('/api/v1/life-events/married/bundle?structure=islamic')).json()).data;
  const bundle = page.getByTestId('life-event-bundle');
  await expect(bundle).toHaveAttribute('data-structure', 'islamic');
  await expect(page.getByTestId('bundle-summary')).toHaveAttribute('data-verdict', api.verdict);
  await expect(page.getByTestId('bundle-verdict')).toContainText('Over budget');
  await expect(page.getByTestId('bundle-total')).toHaveText(bhd(api.totalMonthlyFils));
  await expect(page.getByTestId('bundle-headroom')).toHaveText(bhd(api.maxMonthlyFils));
  await expect(page.getByTestId('bundle-summary')).toContainText(`${bhd(api.shortfallFils)}/month over your budget`);
  await expect(page.getByTestId('bundle-item-honeymoon')).toContainText('Coming soon');
  await expect(page.getByTestId('bundle-item-home')).toContainText('Ijara');
  await expect(page.getByTestId('bundle-item-car')).toContainText('Profit:');
  expect((await bundle.innerText()).toLowerCase()).not.toContain('interest');

  // Toggle the whole bundle to conventional.
  await page.getByTestId('structure-conventional').click();
  await expect(bundle).toHaveAttribute('data-structure', 'conventional');
  const conv = (await (await request.get('/api/v1/life-events/married/bundle?structure=conventional')).json()).data;
  await expect(page.getByTestId('bundle-total')).toHaveText(bhd(conv.totalMonthlyFils));
  await expect(page.getByTestId('bundle-item-car')).toContainText('Interest:');
  await expect(page.getByTestId('bundle-item-car')).toContainText('Conventional');
});

test('bundle items link to the real listing pages with the same monthly figure', async ({ page }) => {
  await page.goto('/en/life-events/new-baby?structure=conventional');
  await expect(page.getByTestId('bundle-summary')).toHaveAttribute('data-verdict', 'fits');
  await expect(page.getByTestId('bundle-verdict')).toContainText('Fits your budget');
  const car = page.getByTestId('bundle-item-family-car');
  await expect(car).toContainText('7 seats');
  await car.getByTestId('bundle-item-link').click();
  await expect(page).toHaveURL(/\/en\/cars\/v-haval-h9-2026$/);
});

test('new job suggests a card upgrade the customer qualifies for', async ({ page }) => {
  await page.goto('/en/life-events/new-job');
  const card = page.getByTestId('bundle-item-card-upgrade');
  await expect(card).toContainText('IMTIAZ World Mastercard');
  await card.getByTestId('bundle-item-link').click();
  await expect(page).toHaveURL(/\/en\/cards\/imtiaz-world\/apply$/);
});

test('life events work in Arabic (RTL)', async ({ page }) => {
  await page.goto('/ar/life-events/first-home');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('bundle-verdict')).toContainText('يتجاوز ميزانيتك');
  await expect(page.getByTestId('bundle-summary')).toContainText('أقساط التغطية');
  await expect(page.getByTestId('bundle-item-home-cover')).toContainText('تكافل المنزل');
});

test('life events API: list, bundle and errors', async ({ request }) => {
  const list = await (await request.get('/api/v1/life-events')).json();
  expect(list.data.items.map((e: { id: string }) => e.id)).toEqual(['married', 'new-job', 'first-home', 'new-baby']);
  const def = (await (await request.get('/api/v1/life-events/new-baby/bundle')).json()).data;
  expect(def.structure).toBe('islamic');
  expect(Number.isSafeInteger(def.totalMonthlyFils)).toBe(true);
  expect(JSON.stringify(def).toLowerCase()).not.toContain('interest');
  const missing = await request.get('/api/v1/life-events/retirement/bundle');
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe('EVENT_NOT_FOUND');
  const bad = await request.get('/api/v1/life-events/married/bundle?structure=murabaha');
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.code).toBe('INVALID_STRUCTURE');
  const page404 = await request.get('/en/life-events/retirement');
  expect(page404.status()).toBe(404);
});
