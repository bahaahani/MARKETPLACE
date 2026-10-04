import { expect, test, type Page } from '@playwright/test';

const bhd = (fils: number) => `BHD ${(fils / 1000).toLocaleString('en', { minimumFractionDigits: 3 })}`;

interface Pricing {
  monthlyFils: number;
  totalCostFils: number;
}

async function postSuvRequest(page: Page): Promise<string> {
  await page.goto('/en');
  await page.getByTestId('bid-entry').click();
  await expect(page).toHaveURL(/\/en\/requests\/new$/);
  const form = page.getByTestId('bid-request-form');
  await form.getByTestId('bid-body').selectOption('suv');
  await form.getByTestId('bid-max-monthly').fill('300');
  await form.getByTestId('bid-structure-murabaha').click();
  await form.getByTestId('bid-tenure').selectOption('60');
  await form.getByTestId('bid-down-payment').fill('3000');
  await form.getByTestId('bid-insurance').selectOption('takaful');
  await form.getByTestId('bid-post').click();
  await expect(page).toHaveURL(/\/en\/requests\/breq_/);
  return page.url().split('/').pop()!;
}

test('customer posts a request, a dealer bids in the portal, the customer accepts, and the dealer sees the lead', async ({ page, browser }) => {
  const id = await postSuvRequest(page);
  const board = page.getByTestId('bid-board');
  await expect(board.getByTestId('request-status')).toHaveAttribute('data-status', 'OPEN');
  await expect(board.getByTestId('request-expires')).toContainText('Bahrain time');

  // Instant matches from the whole catalogue, cheapest monthly first, with the same figures as the API.
  const api = (await (await page.request.get(`/api/v1/requests/${id}`)).json()).data as {
    instantMatches: { vehicle: { id: string }; pricing: Pricing }[];
  };
  expect(api.instantMatches.map((m) => m.vehicle.id)).toEqual(['v-haval-jolion-2026', 'v-haval-h9-2026', 'v-honda-crv-2026']);
  const matches = board.getByTestId('instant-match');
  await expect(matches).toHaveCount(3);
  await expect(matches.first().getByTestId('offer-monthly')).toHaveText(`${bhd(api.instantMatches[0]!.pricing.monthlyFils)} / month`);
  await expect(board.getByTestId('bids-empty')).toBeVisible();

  // The dealer (another browser, no customer session) bids from the portal.
  const dealerCtx = await browser.newContext();
  const dealer = await dealerCtx.newPage();
  await dealer.goto('/en/dealer/tac');
  await dealer.getByTestId('nav-requests').click();
  const card = dealer.locator(`[data-testid="dealer-request"][data-request-id="${id}"]`);
  await expect(card).toContainText('Fatima is looking for');
  await expect(card.getByTestId('dealer-request-preapproved')).toHaveText('Pre-approved for this budget');
  // Data minimization: no surname, salary or headroom on the dealer's screen.
  await expect(card).not.toContainText('Ahmed');
  await expect(card).not.toContainText('1,400');
  await expect(card).not.toContainText('373.247');

  await card.getByTestId('dealer-bid-vehicle').selectOption('v-nissan-patrol-2021');
  await expect(card.getByTestId('dealer-bid-fit')).toHaveText('Over the maximum at list price');
  // At list price the Patrol is over the customer's BHD 300: rejected by the server.
  await card.getByTestId('dealer-bid-submit').click();
  await expect(card.getByTestId('dealer-bid-error')).toContainText("Over the customer's maximum monthly");
  await card.getByTestId('dealer-bid-discount').fill('2925');
  await card.getByTestId('dealer-bid-extra-service-3y').check();
  await card.getByTestId('dealer-bid-extra-window-tint').check();
  await card.getByTestId('dealer-bid-submit').click();
  await expect(card.getByTestId('dealer-bid-sent')).toBeVisible();
  await expect(card.getByTestId('dealer-my-bid')).toContainText('Your bid: Nissan Patrol 2021');

  // The customer's board picks the bid up by polling; its monthly is the server's.
  const bid = board.locator('[data-testid="bid"][data-seller-id="tac"]');
  await expect(bid).toBeVisible({ timeout: 15_000 });
  const withBid = (await (await page.request.get(`/api/v1/requests/${id}`)).json()).data as { bids: { id: string; pricing: Pricing }[] };
  const placed = withBid.bids[0]!;
  expect(placed.pricing.monthlyFils).toBeLessThanOrEqual(300_000);
  await expect(bid.getByTestId('offer-monthly')).toHaveText(`${bhd(placed.pricing.monthlyFils)} / month`);
  await expect(bid.getByTestId('bid-discount')).toHaveText('Discount BHD 2,925');
  await expect(bid).toContainText('3 years free service');

  await bid.getByTestId('bid-accept').click();
  const accepted = page.getByTestId('bid-accepted');
  await expect(accepted).toContainText("You accepted Tasheelat Automotive's bid");
  await expect(board.getByTestId('request-status')).toHaveAttribute('data-status', 'CLOSED');
  await expect(accepted.getByTestId('bid-apply-link')).toHaveAttribute('href', '/en/cars/v-nissan-patrol-2021');
  await expect(board.getByTestId('bid-cancel')).toHaveCount(0);

  // The request left the dealer's open list, and the accepted bid is a lead on the dealer's board.
  await dealer.goto('/en/dealer/tac/requests');
  await expect(dealer.locator(`[data-testid="dealer-request"][data-request-id="${id}"]`)).toHaveCount(0);
  await dealer.goto('/en/dealer/tac');
  const lead = dealer.getByTestId('leads-NEW').getByTestId('lead').filter({ hasText: 'Bid For Me' }).filter({ hasText: 'Nissan Patrol 2021' });
  await expect(lead.first()).toContainText('Fatima A.');
  await dealerCtx.close();

  // "Apply for finance on this car" opens the existing car page.
  await accepted.getByTestId('bid-apply-link').click();
  await expect(page).toHaveURL(/\/en\/cars\/v-nissan-patrol-2021$/);
});

test('one open request at a time; cancel closes it (Arabic, RTL)', async ({ page }) => {
  const id = await postSuvRequest(page);
  await page.goto('/ar/requests/new');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('bid-open-exists')).toBeVisible();
  await page.goto(`/ar/requests/${id}`);
  await page.getByTestId('bid-cancel').click();
  await expect(page.getByTestId('request-status')).toHaveAttribute('data-status', 'CANCELLED');
  await expect(page.getByTestId('request-status')).toHaveText('ملغى');
  await page.goto('/ar/requests/new');
  await expect(page.getByTestId('bid-request-form')).toBeVisible();
});

test('a maximum monthly above the pre-approval is rejected with a clear reason', async ({ page }) => {
  await page.goto('/en/requests/new');
  const form = page.getByTestId('bid-request-form');
  await form.getByTestId('bid-max-monthly').fill('900');
  await form.getByTestId('bid-post').click();
  await expect(page.getByTestId('bid-error')).toHaveText('That monthly is above what your pre-approval allows. Lower it to post.');
  await expect(page).toHaveURL(/\/en\/requests\/new$/);
});

test('Bid For Me API: validation, privacy and ownership', async ({ playwright, baseURL }) => {
  const customer = await playwright.request.newContext({ baseURL });
  const other = await playwright.request.newContext({ baseURL });
  const body = { bodyType: 'suv', maxMonthlyFils: 300_000, structure: 'murabaha', tenureMonths: 60, downPaymentFils: 3_000_000 };

  expect((await customer.post('/api/v1/requests', { data: { ...body, maxMonthlyFils: 5_000_000 } })).status()).toBe(422);
  expect((await customer.post('/api/v1/requests', { data: { ...body, structure: 'ijara' } })).status()).toBe(422);
  expect((await customer.post('/api/v1/requests', { data: '[]', headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
  const created = await customer.post('/api/v1/requests', { data: body });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).data;
  expect((await customer.post('/api/v1/requests', { data: body })).status()).toBe(409);

  // Another session cannot see, accept or cancel it.
  expect((await other.get(`/api/v1/requests/${id}`)).status()).toBe(404);
  expect((await other.post(`/api/v1/requests/${id}/cancel`)).status()).toBe(404);

  // Dealer side: foreign car, criteria mismatch, over budget, then a good bid priced by the server.
  const bids = `/api/v1/dealer/nmc/requests/${id}/bids`;
  expect((await customer.post(bids, { data: { vehicleId: 'v-nissan-patrol-2021' } })).status()).toBe(422);
  expect((await customer.post(bids, { data: { vehicleId: 'v-honda-city-2026' } })).status()).toBe(422);
  expect((await customer.post(bids, { data: { vehicleId: 'v-honda-crv-2026', discountFils: 99_000_000 } })).status()).toBe(422);
  const good = await customer.post(bids, { data: { vehicleId: 'v-honda-crv-2026', extras: ['window-tint'], monthlyFils: 1 } });
  expect(good.status()).toBe(201);
  const dealerView = (await good.json()).data;
  expect(dealerView.myBid.pricing.monthlyFils).toBeGreaterThan(1);
  const json = JSON.stringify(dealerView);
  for (const secret of ['customerId', 'Ahmed', 'salary', 'obligation', 'tradeIn', 'cashDownPayment']) expect(json).not.toContain(secret);
  expect(dealerView.firstName.en).toBe('Fatima');
  expect((await customer.get('/api/v1/dealer/nobody/requests')).status()).toBe(404);

  // A replaced bid cannot be accepted; the current one can.
  const replaced = dealerView.myBid.id as string;
  const newer = (await (await customer.post(bids, { data: { vehicleId: 'v-honda-crv-2026' } })).json()).data.myBid.id as string;
  expect((await customer.post(`/api/v1/requests/${id}/accept`, { data: { bidId: replaced } })).status()).toBe(404);
  expect((await other.post(`/api/v1/requests/${id}/accept`, { data: { bidId: newer } })).status()).toBe(404);
  const acc = await customer.post(`/api/v1/requests/${id}/accept`, { data: { bidId: newer } });
  expect(acc.status()).toBe(200);
  expect((await acc.json()).data.accepted.applyHref).toBe('/cars/v-honda-crv-2026');
  expect((await customer.post(bids, { data: { vehicleId: 'v-honda-crv-2026' } })).status()).toBe(409);
  const mine = (await (await customer.get('/api/v1/me/requests')).json()).data;
  expect(mine.items[0].status).toBe('CLOSED');
  expect(mine.open).toBeNull();
  await customer.dispose();
  await other.dispose();
});
