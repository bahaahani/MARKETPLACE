import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Motor claims, First Notice of Loss (J6), ⚠️ sandbox. Claims belong to the session customer and need one of their
// ACTIVE motor policies, so each test buys motor cover for the garage car (#123456) in its own session first.

/** A real 1×1 PNG (the browser decodes and re-compresses it before upload). */
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString('base64');
const GIF_HEADER = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)]).toString('base64');

interface MotorPolicy {
  id: string;
  policyNumber: string;
}

/** Buy motor cover for the garage car in this request context's session (hold, pay, confirm). */
async function buyMotorPolicy(request: APIRequestContext): Promise<MotorPolicy> {
  const quote = (await (
    await request.post('/api/v1/policies/quotes', {
      data: { line: 'motor', insurerId: 'pearl-takaful', input: { vehicleValueFils: 14_900_000, cover: 'comprehensive', reference: '123456' } },
    })
  ).json()).data as { id: string; premiumFils: number };
  const payment = (await (
    await request.post('/api/v1/payments', {
      data: { amountFils: quote.premiumFils, method: 'card', purpose: 'insurance_premium', reference: quote.id },
      headers: { 'Idempotency-Key': `e2e-claim-motor-${quote.id}` },
    })
  ).json()).data as { id: string };
  await request.post(`/api/v1/payments/${payment.id}/confirm`);
  const res = await request.post('/api/v1/policies/confirm', { data: { paymentId: payment.id, quoteId: quote.id } });
  expect(res.status()).toBe(200);
  return (await res.json()).data as MotorPolicy;
}

function claimBody(policyId: string, over: Record<string, unknown> = {}) {
  return {
    policyId,
    incidentAt: new Date().toISOString(),
    location: 'Sheikh Khalifa Highway, near Isa Town',
    type: 'collision',
    severity: 'moderate',
    description: 'Rear-ended at a traffic light; bumper damaged.',
    thirdPartyInvolved: true,
    photos: [{ mimeType: 'image/jpeg', dataBase64: JPEG_HEADER }],
    ...over,
  };
}

/** Start the browser session, then buy motor cover in it (page.request shares the browser's cookies). */
async function customerWithMotorCover(page: Page): Promise<MotorPolicy> {
  await page.goto('/en');
  return buyMotorPolicy(page.request);
}

test('without motor cover, "I had an accident" offers to get cover', async ({ page }) => {
  await page.goto('/en/account');
  await page.getByTestId('garage-accident').first().click();
  await expect(page).toHaveURL(/\/en\/claims\/new\?plate=123456$/);
  await expect(page.getByTestId('claim-no-policy')).toContainText('no active motor policy');
  await expect(page.getByRole('link', { name: 'Get motor cover' })).toHaveAttribute('href', '/en/insurance#motor');
});

test('file a motor claim from My Garage, follow assessment, book a garage, settle', async ({ page }) => {
  const policy = await customerWithMotorCover(page);
  await page.goto('/en/account');
  await page.getByTestId('garage-accident').first().click();
  await expect(page).toHaveURL(/\/en\/claims\/new\?plate=123456$/);
  await expect(page.getByTestId('claim-policy')).toHaveValue(policy.id);

  // Validation errors come from the API.
  await page.getByTestId('claim-location').fill('Sheikh Khalifa Highway, near Isa Town');
  await page.getByTestId('claim-description').fill('Rear-ended at a traffic light; bumper and boot damaged.');
  await page.getByTestId('claim-submit').click();
  await expect(page.getByTestId('claim-error')).toHaveText('Add at least one photo of the damage.');

  await page.getByTestId('claim-type-collision').click();
  await page.getByTestId('claim-severity-moderate').click();
  await page.getByTestId('claim-third-party').check();
  await page.getByTestId('claim-photo-input').setInputFiles({ name: 'damage.png', mimeType: 'image/png', buffer: PNG_1x1 });
  await expect(page.getByTestId('claim-photo')).toHaveCount(1);
  await expect(page.getByTestId('claim-photo-count')).toHaveText('1 of 6 photos');
  await page.getByTestId('claim-submit').click();

  await expect(page).toHaveURL(/\/en\/claims\/clm_/);
  const id = page.url().split('/').pop()!;
  const api = (await (await page.request.get(`/api/v1/claims/${id}`)).json()).data;
  expect(api.claimNumber).toMatch(/^SBX-CLM-\d{2}-\d{6}$/);
  // The photo was re-encoded as JPEG in the browser; only its type and size reached the claim.
  expect(api.photos).toEqual([{ index: 0, mimeType: 'image/jpeg', bytes: expect.any(Number) }]);
  await expect(page.getByTestId('claim-number')).toHaveText(`Claim ${api.claimNumber}`);
  await expect(page.getByTestId('claim-status')).toHaveAttribute('data-status', 'SUBMITTED');
  // UI estimate = API estimate (sandbox rules: collision, moderate = BHD 600 ± 20%), labelled as not AI.
  await expect(page.getByTestId('claim-estimate')).toHaveAttribute('data-estimate', String(api.estimate.estimateFils));
  await expect(page.getByTestId('claim-estimate')).toContainText('BHD 480.000 to BHD 720.000');
  await expect(page.getByTestId('estimate-not-ai')).toContainText('not an AI estimate');
  await expect(page.getByTestId('claim-step')).toHaveCount(5);
  await expect(page.locator('[data-testid="claim-step"][data-done="true"]')).toHaveCount(1);
  await expect(page.getByTestId('replacement-car')).toContainText('Tasheelat Car Leasing');
  await expect(page.getByTestId('claim-garage')).toContainText('once the claim is approved');

  // Sandbox assessment
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('claim-status')).toHaveAttribute('data-status', 'UNDER_ASSESSMENT');
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('claim-status')).toHaveAttribute('data-status', 'APPROVED');
  await expect(page.getByTestId('claim-approved-amount')).toContainText('BHD 600.000');

  // Garage: agency workshops only when the policy includes agency repair (as the API says).
  const garages = page.getByTestId('garage-option');
  await expect(garages).toHaveCount(api.agencyRepair ? 5 : 3);
  await page.getByTestId('book-g-sitra-auto-works').click();
  await expect(page.getByTestId('garage-booked')).toContainText('Repair booked at Sitra Auto Works (demo)');
  await expect(page.getByTestId('claim-status')).toHaveAttribute('data-status', 'REPAIR_BOOKED');
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('claim-status')).toHaveAttribute('data-status', 'SETTLED');
  await expect(page.locator('[data-testid="claim-step"][data-done="true"]')).toHaveCount(5);
  await expect(page.getByTestId('sandbox-advance')).toHaveCount(0);

  // Listed on the account page
  await page.goto('/en/account');
  const row = page.locator(`[data-testid="claim-row"][data-claim-number="${api.claimNumber}"]`);
  await expect(row).toContainText('Collision · Car #123456');
  await expect(row.getByTestId('claim-status')).toHaveAttribute('data-status', 'SETTLED');
});

test('"I had an accident" on an active motor policy; theft needs a police report and is a total loss', async ({ page }) => {
  const policy = await customerWithMotorCover(page);
  await page.goto('/en/account');
  const card = page.locator(`[data-testid="policy"][data-policy-number="${policy.policyNumber}"]`);
  await card.getByTestId('policy-accident').click();
  await expect(page).toHaveURL(new RegExp(`/en/claims/new\\?policyId=${policy.id}$`));

  await page.getByTestId('claim-type-theft').click();
  await expect(page.getByText('Police report number (required for theft)')).toBeVisible();
  await page.getByTestId('claim-location').fill('Seef Mall car park');
  await page.getByTestId('claim-description').fill('The car was taken from the car park overnight.');
  await page.getByTestId('claim-submit').click();
  await expect(page.getByTestId('claim-error')).toHaveText('Enter a valid police report number.');
  await page.getByTestId('claim-police-report').fill('PR-2026-0042');
  await page.getByTestId('claim-submit').click();
  await expect(page).toHaveURL(/\/en\/claims\/clm_/);
  await expect(page.getByTestId('claim-estimate')).toContainText('Total loss');
  await expect(page.getByTestId('claim-step')).toHaveCount(4); // no repair step
  await expect(page.getByTestId('claim-garage')).toHaveCount(0);
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('claim-status')).toHaveAttribute('data-status', 'UNDER_ASSESSMENT');
  await page.getByTestId('reject').click();
  await expect(page.getByTestId('claim-status')).toHaveAttribute('data-status', 'REJECTED');
  await expect(page.getByTestId('replacement-car')).toHaveCount(0);
});

test('Arabic claim form is RTL and translated', async ({ page }) => {
  await customerWithMotorCover(page);
  await page.goto('/ar/claims/new?plate=123456');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('الإبلاغ عن حادث');
  await expect(page.getByTestId('claim-type-theft')).toHaveText('سرقة');
});

test.describe('claims API', () => {
  test('validates input, enforces transitions and is idempotent', async ({ request }) => {
    const policy = await buyMotorPolicy(request);
    const file = (over: Record<string, unknown> = {}, headers: Record<string, string> = {}) => request.post('/api/v1/claims', { data: claimBody(policy.id, over), headers });
    const err = async (over: Record<string, unknown>) => {
      const res = await file(over);
      return [res.status(), (await res.json()).error?.code];
    };
    expect(await err({ photos: [{ dataBase64: GIF_HEADER }] })).toEqual([422, 'PHOTO_INVALID']);
    expect(await err({ photos: [{ mimeType: 'image/png', dataBase64: JPEG_HEADER }] })).toEqual([422, 'PHOTO_INVALID']);
    expect(await err({ photos: Array.from({ length: 7 }, () => ({ dataBase64: JPEG_HEADER })) })).toEqual([422, 'TOO_MANY_PHOTOS']);
    expect(await err({ photos: [] })).toEqual([422, 'PHOTOS_REQUIRED']);
    expect(await err({ type: 'theft', photos: [] })).toEqual([422, 'POLICE_REPORT_REQUIRED']);
    expect(await err({ incidentAt: new Date(Date.now() + 3_600_000).toISOString() })).toEqual([422, 'INCIDENT_IN_FUTURE']);
    expect(await err({ incidentAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })).toEqual([422, 'INCIDENT_OUTSIDE_POLICY']);
    expect(await err({ incidentAt: 'yesterday' })).toEqual([422, 'INVALID_INCIDENT_TIME']);
    expect(await err({ description: 'short' })).toEqual([422, 'INVALID_DESCRIPTION']);
    expect(await err({ type: 'flood' })).toEqual([422, 'INVALID_REQUEST']);
    expect(await err({ policyId: 'pol_nope' })).toEqual([404, 'POLICY_NOT_FOUND']);
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(400_001)]).toString('base64');
    expect(await err({ photos: [{ dataBase64: big }] })).toEqual([413, 'PHOTO_TOO_LARGE']);
    const bad = await request.post('/api/v1/claims', { headers: { 'Content-Type': 'application/json' }, data: 'null' });
    expect(bad.status()).toBe(400);

    const key = { 'Idempotency-Key': `e2e-claim-${Date.now()}-${Math.random()}` };
    const first = await file({}, key);
    expect(first.status()).toBe(201);
    const claim = (await first.json()).data;
    expect(claim).toMatchObject({ status: 'SUBMITTED', policyNumber: policy.policyNumber, vehicleReference: '123456', estimate: { ai: false, method: 'SANDBOX_RULES' } });
    expect(JSON.stringify(claim)).not.toContain(JPEG_HEADER);
    expect((await (await file({}, key)).json()).data.id).toBe(claim.id);

    const garage = (garageId: string) => request.post(`/api/v1/claims/${claim.id}/garage`, { data: { garageId } });
    const advance = (data?: object) => request.post(`/api/v1/claims/${claim.id}/advance`, data ? { data } : {});
    expect((await garage('g-sitra-auto-works')).status()).toBe(409);
    expect((await advance({ to: 'SETTLED' })).status()).toBe(409);
    expect((await advance({ to: 'NOPE' })).status()).toBe(422);
    expect((await (await advance()).json()).data.status).toBe('UNDER_ASSESSMENT');
    expect((await (await advance({ to: 'APPROVED' })).json()).data.status).toBe('APPROVED');
    expect((await advance()).status()).toBe(409); // a garage must be booked first
    expect((await garage('g-nowhere')).status()).toBe(422);
    const booked = await garage('g-tubli-body-paint');
    expect((await booked.json()).data).toMatchObject({ status: 'REPAIR_BOOKED', garage: { garageId: 'g-tubli-body-paint' } });

    const mine = (await (await request.get('/api/v1/me/claims')).json()).data;
    expect(mine.items.map((c: { id: string }) => c.id)).toContain(claim.id);
    const config = (await (await request.get('/api/v1/config')).json()).data;
    expect(config.claims).toMatchObject({ maxPhotos: 6, policeReportRequiredFor: ['theft'] });
  });

  test("another session's claim and policy are 404", async ({ request, playwright, baseURL }) => {
    const policy = await buyMotorPolicy(request);
    const claim = (await (await request.post('/api/v1/claims', { data: claimBody(policy.id) })).json()).data as { id: string };

    const other = await playwright.request.newContext({ baseURL });
    try {
      expect((await other.get(`/api/v1/claims/${claim.id}`)).status()).toBe(404);
      expect((await other.post(`/api/v1/claims/${claim.id}/advance`)).status()).toBe(404);
      expect((await other.post(`/api/v1/claims/${claim.id}/garage`, { data: { garageId: 'g-sitra-auto-works' } })).status()).toBe(404);
      const steal = await other.post('/api/v1/claims', { data: claimBody(policy.id) });
      expect(steal.status()).toBe(404);
      expect((await steal.json()).error.code).toBe('POLICY_NOT_FOUND');
      expect((await (await other.get('/api/v1/me/claims')).json()).data.total).toBe(0);
    } finally {
      await other.dispose();
    }
  });
});
