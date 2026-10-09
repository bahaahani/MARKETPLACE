import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// "Bid For Me" bid and trade-in carried into the finance application (⚠️ sandbox).
// The numbers always come from the API: nothing here recomputes the server's pricing.

const bhd0 = (fils: number) => `BHD ${new Intl.NumberFormat('en-BH', { maximumFractionDigits: 0 }).format(fils / 1000)}`;
const CRV = 'v-honda-crv-2026';
const REQUEST = { bodyType: 'suv', maxMonthlyFils: 300_000, structure: 'murabaha', tenureMonths: 60, downPaymentFils: 3_000_000 };
const CAMRY = { make: 'Toyota', model: 'Camry', year: 2021, mileageKm: 60_000, condition: 'good', accidentHistory: false };

interface Pricing {
  listPriceFils: number;
  discountFils: number;
  priceFils: number;
  tradeInCreditFils: number;
  downPaymentFils: number;
  cashDownPaymentFils: number;
  extras: string[];
  financedFils: number;
}

/** Posts a request, gets NMC's CR-V bid (BHD 500 off, two extras) and accepts it through the API. */
async function acceptedBid(api: APIRequestContext) {
  const created = await api.post('/api/v1/requests', { data: REQUEST });
  expect(created.status()).toBe(201);
  const requestId = (await created.json()).data.id as string;
  const placed = await api.post(`/api/v1/dealer/nmc/requests/${requestId}/bids`, {
    data: { vehicleId: CRV, discountFils: 500_000, extras: ['service-1y', 'window-tint'] },
  });
  expect(placed.status()).toBe(201);
  const bidId = (await placed.json()).data.myBid.id as string;
  const accepted = await api.post(`/api/v1/requests/${requestId}/accept`, { data: { bidId } });
  expect(accepted.status()).toBe(200);
  return { requestId, bidId, view: (await accepted.json()).data };
}

async function postRequestInUi(page: Page): Promise<string> {
  await page.goto('/en/requests/new');
  const form = page.getByTestId('bid-request-form');
  await form.getByTestId('bid-body').selectOption('suv');
  await form.getByTestId('bid-max-monthly').fill('300');
  await form.getByTestId('bid-structure-murabaha').click();
  await form.getByTestId('bid-tenure').selectOption('60');
  await form.getByTestId('bid-down-payment').fill('3000');
  await form.getByTestId('bid-post').click();
  await expect(page).toHaveURL(/\/en\/requests\/breq_/);
  return page.url().split('/').pop()!;
}

test('post a request, the dealer bids, accept, then apply at the discounted price with the trade-in', async ({ page }) => {
  const id = await postRequestInUi(page);

  // The dealer bids from its own API session (no customer cookie).
  const bid = await page.request.post(`/api/v1/dealer/nmc/requests/${id}/bids`, {
    data: { vehicleId: CRV, discountFils: 500_000, extras: ['service-1y', 'window-tint'] },
  });
  expect(bid.status()).toBe(201);
  await page.reload();
  const card = page.locator('[data-testid="bid"][data-seller-id="nmc"]');
  await expect(card).toBeVisible();
  await card.getByTestId('bid-accept').click();
  const link = page.getByTestId('bid-accepted').getByTestId('bid-apply-link');
  await expect(link).toHaveAttribute('href', /^\/en\/cars\/v-honda-crv-2026\?requestId=breq_.+&bidId=bid_/);

  // The customer also values their car (the trade-in offer the car page can use).
  const valued = await page.request.post('/api/v1/trade-in/valuations', { data: CAMRY });
  expect(valued.status()).toBe(201);
  const offer = (await valued.json()).data;

  // The car page shows the accepted bid and prices the calculator at the discounted price.
  await link.click();
  const banner = page.getByTestId('car-bid');
  await expect(banner).toBeVisible();
  await expect(banner.getByTestId('car-bid-list')).toHaveText(bhd0(14_900_000));
  await expect(banner.getByTestId('car-bid-discount')).toHaveText(`−${bhd0(500_000)}`);
  await expect(banner.getByTestId('car-bid-price')).toHaveText(bhd0(14_400_000));
  await expect(banner.getByTestId('car-bid-extras')).toContainText('1 year free service');
  await expect(banner.getByTestId('car-bid-extras')).toContainText('Window tint');

  // "Use my trade-in", then apply: the button sends the bid ids and useTradeIn, never a price.
  await page.getByTestId('tradein-use-button').click();
  await expect(page.getByTestId('tradein-applied')).toBeVisible();
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/v1/applications') && r.method() === 'POST');
  await page.getByTestId('apply-finance').click();
  const body = (await sent).postDataJSON() as Record<string, unknown>;
  expect(body).toMatchObject({ productLine: 'vehicle', vehicleId: CRV, useTradeIn: true });
  expect(body.requestId).toBe(id);
  expect(typeof body.bidId).toBe('string');
  expect(Object.keys(body)).not.toContain('assetPriceFils');
  await expect(page).toHaveURL(/\/en\/applications\/app_/);

  // The application is priced at the bid: breakdown from the API's `pricing`.
  const appId = page.url().split('/').pop()!;
  const app = (await (await page.request.get(`/api/v1/applications/${appId}`)).json()).data as {
    pricing: Pricing;
    source: { type: string; requestId: string };
    tradeIn: { offerId: string; creditFils: number };
    quote: { assetPriceFils: number; downPaymentFils: number; financedFils: number };
  };
  expect(app.source).toMatchObject({ type: 'bid', requestId: id });
  expect(app.tradeIn.offerId).toBe(offer.id);
  expect(app.pricing).toMatchObject({ listPriceFils: 14_900_000, discountFils: 500_000, priceFils: 14_400_000, extras: ['service-1y', 'window-tint'] });
  expect(app.pricing.tradeInCreditFils).toBe(app.tradeIn.creditFils);
  expect(app.pricing.tradeInCreditFils).toBeGreaterThan(0);
  expect(app.quote.assetPriceFils).toBe(14_400_000);
  expect(app.pricing.financedFils).toBe(app.quote.financedFils);
  expect(app.pricing.cashDownPaymentFils + app.pricing.tradeInCreditFils).toBe(app.quote.downPaymentFils);

  const breakdown = page.getByTestId('pricing-breakdown');
  await expect(breakdown.getByTestId('pricing-from-bid')).toBeVisible();
  await expect(breakdown.getByTestId('pricing-list')).toHaveText(bhd0(14_900_000));
  await expect(breakdown.getByTestId('pricing-discount')).toHaveText(`−${bhd0(500_000)}`);
  await expect(breakdown.getByTestId('pricing-price')).toHaveText(bhd0(14_400_000));
  await expect(breakdown.getByTestId('pricing-tradein')).toHaveText(`−${bhd0(app.pricing.tradeInCreditFils)}`);
  await expect(breakdown.getByTestId('pricing-tradein-note')).toHaveText(`Trade-in credit ${bhd0(app.pricing.tradeInCreditFils)}, credited at delivery.`);
  await expect(breakdown.getByTestId('pricing-financed')).toHaveText(bhd0(app.pricing.financedFils));
  await expect(breakdown.getByTestId('pricing-extras')).toContainText('1 year free service');
  // The offer summary prices the discounted car.
  await expect(page.getByTestId('offer-summary')).toContainText(bhd0(14_400_000));

  // The dealer's lead shows the list price against the bid price.
  await page.goto('/en/dealer/nmc');
  // The dealer's board is shared by every browser project and spec, so pick the lead by its own bid price instead of
  // the first CR-V lead (an earlier undiscounted lead may be listed before it).
  const lead = page
    .getByTestId('leads-NEW')
    .getByTestId('lead')
    .filter({ hasText: 'Honda CR-V' })
    .filter({ has: page.getByTestId('lead-bid').filter({ hasText: `bid ${bhd0(14_400_000)}` }) });
  await expect(lead.first().getByTestId('lead-bid')).toContainText(`List ${bhd0(14_900_000)} · bid ${bhd0(14_400_000)}`);
  await expect(lead.first().getByTestId('lead-bid')).toContainText(`Discount ${bhd0(500_000)}`);
});

test('the same application page in Arabic (RTL)', async ({ page }) => {
  const { requestId, bidId } = await acceptedBid(page.request);
  await page.goto(`/ar/cars/${CRV}?requestId=${requestId}&bidId=${bidId}`);
  await expect(page.getByTestId('car-bid')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('apply-finance').click();
  await expect(page).toHaveURL(/\/ar\/applications\/app_/);
  await expect(page.getByTestId('pricing-breakdown')).toContainText('خصم الوكيل');
  await expect(page.getByTestId('pricing-extras')).toBeVisible();
});

test('a car page link with a bid that is not the customer\'s falls back to the list price and the server refuses a forged one', async ({ page }) => {
  await page.goto(`/en/cars/${CRV}?requestId=breq_forged&bidId=bid_forged`);
  await expect(page.getByTestId('car-bid-unavailable')).toBeVisible();
  await expect(page.getByTestId('car-bid')).toHaveCount(0);
  // Applying from this page uses no bid (list price); the forged ids are never sent.
  await page.getByTestId('apply-finance').click();
  await expect(page).toHaveURL(/\/en\/applications\/app_/);
  await expect(page.getByTestId('pricing-breakdown')).toHaveCount(0);
});

test('applications API: bid and trade-in are re-validated on the server', async ({ playwright, baseURL }) => {
  const customer = await playwright.request.newContext({ baseURL });
  const other = await playwright.request.newContext({ baseURL });
  const apply = (api: APIRequestContext, data: Record<string, unknown>, key: string) =>
    api.post('/api/v1/applications', {
      data: { productLine: 'vehicle', structure: 'murabaha', vehicleId: CRV, downPaymentFils: 3_000_000, tenureMonths: 60, ...data },
      headers: { 'Idempotency-Key': key },
    });
  const code = async (res: Awaited<ReturnType<typeof apply>>) => (await res.json()).error.code as string;

  // Baseline: no bid, no trade-in -> the same application as before, with a plain breakdown.
  const plain = await apply(customer, {}, 'carry-baseline-01');
  expect(plain.status()).toBe(201);
  const plainApp = (await plain.json()).data;
  expect(plainApp.quote.assetPriceFils).toBe(14_900_000);
  expect(plainApp.pricing).toEqual({
    listPriceFils: 14_900_000,
    discountFils: 0,
    priceFils: 14_900_000,
    tradeInCreditFils: 0,
    downPaymentFils: 3_000_000,
    cashDownPaymentFils: 3_000_000,
    extras: [],
    financedFils: 11_900_000,
  });
  expect(plainApp.source).toBeUndefined();
  expect(plainApp.tradeIn).toBeUndefined();

  // An open (not accepted) request's bid is refused.
  const open = await customer.post('/api/v1/requests', { data: REQUEST });
  const openId = (await open.json()).data.id as string;
  const openBid = (await (await customer.post(`/api/v1/dealer/nmc/requests/${openId}/bids`, { data: { vehicleId: CRV, discountFils: 500_000 } })).json()).data.myBid.id as string;
  const notAccepted = await apply(customer, { requestId: openId, bidId: openBid }, 'carry-open-0001');
  expect(notAccepted.status()).toBe(409);
  expect(await code(notAccepted)).toBe('BID_NOT_ACCEPTED');
  await customer.post(`/api/v1/requests/${openId}/cancel`);

  const { requestId, bidId } = await acceptedBid(customer);

  // Forged ids, half a pair, and another customer's session all read as no such bid / invalid.
  expect(await code(await apply(customer, { requestId, bidId: 'bid_forged' }, 'carry-forged-01'))).toBe('BID_NOT_FOUND');
  expect((await apply(customer, { requestId, bidId: 'bid_forged' }, 'carry-forged-02')).status()).toBe(404);
  expect(await code(await apply(customer, { requestId }, 'carry-half-0001'))).toBe('INVALID_REQUEST');
  const stolen = await apply(other, { requestId, bidId }, 'carry-stolen-01');
  expect(stolen.status()).toBe(404);
  expect(await code(stolen)).toBe('BID_NOT_FOUND');

  // The bid is for the CR-V only; a client-sent price is ignored.
  const wrongCar = await apply(customer, { vehicleId: 'v-haval-h9-2026', requestId, bidId }, 'carry-wrongcar-01');
  expect(wrongCar.status()).toBe(422);
  expect(await code(wrongCar)).toBe('BID_VEHICLE_MISMATCH');
  const nonVehicle = await customer.post('/api/v1/applications', {
    data: { productLine: 'personal', structure: 'conventional', amountFils: 5_000_000, tenureMonths: 48, requestId, bidId },
    headers: { 'Idempotency-Key': 'carry-personal-01' },
  });
  expect(nonVehicle.status()).toBe(422);

  // No trade-in offer yet: refused with a clear code. Then the good application.
  const noOffer = await apply(customer, { useTradeIn: true }, 'carry-nooffer-01');
  expect(noOffer.status()).toBe(422);
  expect(await code(noOffer)).toBe('NO_TRADE_IN');
  expect(await code(await apply(customer, { useTradeIn: 'yes' }, 'carry-badflag-01'))).toBe('INVALID_REQUEST');

  const good = await apply(customer, { requestId, bidId, assetPriceFils: 1, priceFils: 1, discountFils: 99_999_999 }, 'carry-good-0001');
  expect(good.status()).toBe(201);
  const goodApp = (await good.json()).data;
  expect(goodApp.quote.assetPriceFils).toBe(14_400_000);
  expect(goodApp.pricing).toMatchObject({ discountFils: 500_000, tradeInCreditFils: 0, extras: ['service-1y', 'window-tint'] });
  // The same key returns the same application.
  expect((await (await apply(customer, { requestId, bidId }, 'carry-good-0001')).json()).data.id).toBe(goodApp.id);

  // Another customer's trade-in offer is never used.
  expect((await customer.post('/api/v1/trade-in/valuations', { data: CAMRY })).status()).toBe(201);
  expect(await code(await apply(other, { useTradeIn: true }, 'carry-other-ti-01'))).toBe('NO_TRADE_IN');

  // The cap: an offer above the maximum down payment of a cheap car is credited only up to it.
  const cheap = await apply(customer, { vehicleId: 'v-kia-picanto-2025', downPaymentFils: 0, useTradeIn: true }, 'carry-cap-0001');
  expect(cheap.status()).toBe(201);
  const cheapApp = (await cheap.json()).data;
  expect(cheapApp.tradeIn.capped).toBe(true);
  expect(cheapApp.quote.downPaymentFils).toBeLessThanOrEqual(Math.floor(3_750_000 * 0.9));
  expect(cheapApp.pricing.tradeInCreditFils).toBe(cheapApp.quote.downPaymentFils);

  // Withdrawn offer: nothing to use.
  await customer.delete('/api/v1/me/trade-in');
  expect(await code(await apply(customer, { useTradeIn: true }, 'carry-gone-0001'))).toBe('NO_TRADE_IN');
  await customer.dispose();
  await other.dispose();
});
