import { expect, test } from '@playwright/test';

test('customer shares pre-approval, dealer redeems it in the showroom and builds an offer', async ({ page, request }) => {
  // Customer side: create a share code on the account page.
  await page.goto('/en/account');
  const share = page.getByTestId('share-preapproval');
  await share.getByTestId('share-button').click();
  const tokenText = share.getByTestId('share-token');
  await expect(tokenText).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await expect(share.getByRole('img')).toBeVisible();
  await expect(share.getByTestId('share-countdown')).toContainText(/Expires in 1[45]:\d\d/);
  const token = (await tokenText.textContent())!.trim();

  // Dealer side: open the portal from the footer, pick NMC, go to the showroom.
  await page.getByTestId('footer-dealer-link').click();
  await page.getByTestId('dealer-nmc').click();
  await expect(page.getByTestId('dealer-name')).toHaveText('National Motor Company');
  await page.getByTestId('nav-showroom').click();

  // Typed in lower case without the dash: still accepted.
  await page.getByTestId('token-input').fill(token.replace('-', '').toLowerCase());
  await page.getByTestId('redeem').click();
  const summary = page.getByTestId('customer-summary');
  await expect(summary).toContainText('Fatima is pre-approved');
  // Data minimization: no surname or salary on the dealer's screen.
  await expect(page.locator('body')).not.toContainText('Ahmed');
  await expect(page.locator('body')).not.toContainText('BHD 1,400');

  // Build an offer on the CR-V: compare structures and check against the limit, matching the API.
  await page.getByTestId('offer-vehicle').selectOption('v-honda-crv-2026');
  const builder = page.getByTestId('offer-builder');
  await expect(builder.getByTestId('quote-conventional')).toBeVisible();
  await expect(builder.getByTestId('quote-murabaha')).toBeVisible();
  await expect(builder.getByTestId('offer-status')).toContainText('Within pre-approval');

  const res = await request.post('/api/v1/dealer/offers', {
    data: { sellerId: 'nmc', token, vehicleId: 'v-honda-crv-2026', downPaymentFils: 3_000_000, tenureMonths: 60 },
  });
  expect(res.ok()).toBe(true);
  const { data } = await res.json();
  const murabaha = data.quotes.find((q: { structure: string }) => q.structure === 'murabaha');
  const expected = `BHD ${(murabaha.monthlyFils / 1000).toLocaleString('en', { minimumFractionDigits: 3 })}`;
  await expect(builder.getByTestId('monthly-murabaha')).toHaveText(expected);
  await expect(builder.getByTestId('within-murabaha')).toContainText('Within pre-approval');

  // The Escalade is above the shared limit.
  await page.getByTestId('offer-vehicle').selectOption('v-cadillac-escalade-2026');
  await expect(builder.getByTestId('offer-status')).toContainText('Over pre-approval');
});

test('unknown pre-approval code is rejected', async ({ page }) => {
  await page.goto('/en/dealer/tac/showroom');
  await page.getByTestId('token-input').fill('ZZZZ-ZZZZ');
  await page.getByTestId('redeem').click();
  await expect(page.getByTestId('redeem-error')).toContainText('Code not recognised');
});

test('dealer dashboard shows KPIs, inventory with monthly prices and the leads board (Arabic, RTL)', async ({ page }) => {
  await page.goto('/ar/dealer/demo-dealer');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('kpi-stock')).toContainText('3');
  const rows = page.getByTestId('inventory-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('د.ب.');
  await expect(page.getByTestId('leads-board')).toBeVisible();
  await expect(page.getByTestId('lead').first()).toBeVisible();
});

test('dealer API: inventory, leads and pipeline rules', async ({ request }) => {
  const inv = await (await request.get('/api/v1/dealer/tac/inventory')).json();
  expect(inv.data.items.every((v: { seller: { id: string } }) => v.seller.id === 'tac')).toBe(true);
  expect(inv.data.stats.count).toBe(inv.data.items.length);

  const list = await (await request.get('/api/v1/dealer/tac/leads')).json();
  expect(list.data.total).toBeGreaterThan(0);
  // A won lead is final, so this is rejected no matter what other tests did.
  const won = list.data.items.find((l: { status: string }) => l.status === 'WON');
  const bad = await request.patch(`/api/v1/dealer/tac/leads/${won.id}`, { data: { status: 'CONTACTED' } });
  expect(bad.status()).toBe(409);

  // Another dealer cannot see it.
  expect((await request.get(`/api/v1/dealer/nmc/leads/${won.id}`)).status()).toBe(404);
  expect((await request.get('/api/v1/dealer/tresco/inventory')).status()).toBe(404);
  expect((await request.post('/api/v1/dealer/preapproval/redeem', { data: { sellerId: 'nmc', token: 'NOPE-NOPE' } })).status()).toBe(404);
});
