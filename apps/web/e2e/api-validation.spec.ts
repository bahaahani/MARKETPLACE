import { expect, test } from '@playwright/test';

// Bad input must come back as 4xx with an error code, never a 500.
test.describe('API input validation', () => {
  const json = { 'Content-Type': 'application/json' };

  test('a JSON body that is not an object is a 400, on every route that reads a body', async ({ request }) => {
    const routes = [
      '/api/v1/payments',
      '/api/v1/quotes/finance',
      '/api/v1/insurance/motor-quotes',
      '/api/v1/onboarding/ekey',
      '/api/v1/onboarding/pre-approval',
      '/api/v1/applications',
      '/api/v1/cards/imtiaz-world/apply',
      '/api/v1/dealer/offers',
      '/api/v1/dealer/preapproval/redeem',
    ];
    for (const url of routes) {
      for (const body of ['null', '[]', '7']) {
        const res = await request.post(url, { headers: { ...json, 'Idempotency-Key': 'e2e-not-an-object' }, data: body });
        expect(res.status(), `${url} ${body}`).toBe(400);
        expect((await res.json()).error.code).toBe('BAD_JSON');
      }
    }
    const patch = await request.patch('/api/v1/dealer/nmc/leads/lead-nmc-1', { headers: json, data: 'null' });
    expect(patch.status()).toBe(400);
  });

  test('payments reject unknown purposes, non-string references and unsafe amounts', async ({ request }) => {
    const base = { amountFils: 100_000, method: 'card', purpose: 'installment', reference: 'c-1001-15' };
    const post = (data: object, key: string) => request.post('/api/v1/payments', { data, headers: { 'Idempotency-Key': `${key}-${Date.now()}` } });
    for (const [data, key] of [
      [{ ...base, purpose: 'bogus' }, 'e2e-purpose'],
      [{ ...base, reference: { id: 1 } }, 'e2e-reference'],
      [{ ...base, amountFils: 1e20 }, 'e2e-huge'],
    ] as const) {
      const res = await post(data, key);
      expect(res.status(), JSON.stringify(data)).toBe(422);
      expect((await res.json()).error.code).toBe('PAYMENT_INVALID');
    }
    expect((await post(base, 'e2e-ok')).status()).toBe(201);
  });

  test('quotes and insurance reject huge amounts; Murabaha never quotes a negative final installment', async ({ request }) => {
    const huge = await request.post('/api/v1/quotes/finance', {
      data: { productLine: 'vehicle', assetPriceFils: 1e300, downPaymentFils: 1e299, tenureMonths: 60 },
    });
    expect(huge.status()).toBe(422);
    expect((await huge.json()).error.code).toBe('INVALID_AMOUNT');
    const tiny = await request.post('/api/v1/quotes/finance', {
      data: { productLine: 'personal', structure: 'murabaha', assetPriceFils: 1, downPaymentFils: 0, tenureMonths: 12 },
    });
    expect(tiny.status()).toBe(422);
    const motor = await request.post('/api/v1/insurance/motor-quotes', { data: { vehicleValueFils: 1e300 } });
    expect(motor.status()).toBe(400);
  });

  test('dealer offers reject a structures value that is not a list', async ({ request }) => {
    const share = (await (await request.post('/api/v1/me/preapproval-token')).json()).data;
    const offer = { sellerId: 'nmc', token: share.token, vehicleId: 'v-honda-crv-2026', downPaymentFils: 3_000_000, tenureMonths: 60 };
    const bad = await request.post('/api/v1/dealer/offers', { data: { ...offer, structures: 'murabaha' } });
    expect(bad.status()).toBe(400);
    const dup = await request.post('/api/v1/dealer/offers', { data: { ...offer, structures: ['murabaha', 'murabaha'] } });
    expect(dup.status()).toBe(200);
    expect((await dup.json()).data.quotes).toHaveLength(1);
  });

  test('applications need a string idempotency key and a vehicleId for car finance', async ({ request }) => {
    const personal = { productLine: 'personal', structure: 'murabaha', amountFils: 1_000_000, tenureMonths: 24 };
    const numericKey = await request.post('/api/v1/applications', { data: { ...personal, idempotencyKey: 123456789 } });
    expect(numericKey.status()).toBe(400);
    const noVehicle = await request.post('/api/v1/applications', {
      data: { productLine: 'vehicle', structure: 'murabaha', downPaymentFils: 3_000_000, tenureMonths: 60 },
      headers: { 'Idempotency-Key': `e2e-no-vehicle-${Date.now()}` },
    });
    expect(noVehicle.status()).toBe(400);
  });

  test('card application rejects a requested limit that is not a positive integer', async ({ request }) => {
    for (const requestedLimitFils of [-1, 1.5, 'lots']) {
      const res = await request.post('/api/v1/cards/imtiaz-platinum/apply', { data: { requestedLimitFils } });
      expect(res.status(), String(requestedLimitFils)).toBe(400);
    }
  });
});

test('main navigation is labelled in the page language', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.getByRole('navigation', { name: 'القائمة الرئيسية' })).toBeVisible();
  await page.goto('/en');
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
});
