import { expect, test } from '@playwright/test';

// Journey J1 (sandbox): eKey → employment & salary → consent → live pre-approval.

test('home and header link to onboarding', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByTestId('onboarding-cta')).toContainText('Check what you can afford');
  await page.getByRole('link', { name: 'Get pre-approved' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/en\/onboarding$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what you can afford');
});

test('onboarding wizard gives a pre-approval matching the API (English)', async ({ page, request }) => {
  await page.goto('/en/onboarding');
  const wizard = page.getByTestId('onboarding');
  await expect(wizard).toContainText('Sandbox');

  // Step 1: eKey (sandbox)
  await page.getByLabel('CPR number').fill('12345');
  await page.getByTestId('ekey-login').click();
  await expect(page.getByTestId('onboarding-error')).toHaveText('Enter a 9-digit CPR number.');
  await page.getByLabel('CPR number').fill('880412345');
  await page.getByTestId('ekey-login').click();
  const identity = page.getByTestId('ekey-identity');
  await expect(identity).toContainText('Verified by eKey');
  await expect(identity).toContainText('******345');
  await expect(wizard).not.toContainText('880412345');

  // Step 2: employment and salary
  await page.getByLabel('Employer').fill('Bahrain Co.');
  await page.getByLabel('Monthly salary (BHD)').fill('1,400');
  await page.getByLabel('Existing monthly repayments (BHD)').fill('300');
  await page.getByTestId('employment-continue').click();

  // Step 3: consent is required, plain-language and time-limited
  await expect(wizard).toContainText('Your consent lasts 90 days');
  await page.getByTestId('see-preapproval').click();
  await expect(page.getByTestId('onboarding-error')).toHaveText('Please give both consents to continue.');
  await page.getByLabel('Credit Reference Bureau (CRB)').check();
  await page.getByLabel('Open Banking').check();
  await page.getByTestId('see-preapproval').click();

  // Step 4: result equals what the API (also used by Flutter) returns for the same inputs
  const result = page.getByTestId('onboarding-result');
  await expect(result).toContainText("You're pre-approved");
  const res = await request.post('/api/v1/onboarding/pre-approval', {
    data: { monthlySalaryFils: 1_400_000, existingObligationsFils: 300_000, consentScopes: ['CRB', 'OPEN_BANKING'] },
  });
  const { data } = await res.json();
  const bhd0 = (fils: number) => `BHD ${(fils / 1000).toLocaleString('en')}`;
  const vehicle = data.preApproval.limits.find((l: { productLine: string }) => l.productLine === 'vehicle');
  await expect(result.getByTestId('limit-vehicle')).toContainText(`Up to ${bhd0(vehicle.maxFinanceFils)}`);
  await expect(result.getByTestId('limit-card')).toContainText(bhd0(data.preApproval.cardLimitFils));
  await expect(result.getByTestId('max-monthly')).toHaveText(`You can afford up to ${bhd0(data.preApproval.maxMonthlyFils)}/month`);

  // CTA: browse cars within budget
  await result.getByTestId('browse-budget').click();
  await expect(page).toHaveURL(new RegExp(`/en/cars\\?maxMonthlyFils=${data.preApproval.maxMonthlyFils}$`));
  await expect(page.getByTestId('vehicle-card').first()).toBeVisible();
});

test('onboarding works in Arabic (RTL)', async ({ page }) => {
  await page.goto('/ar/onboarding');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByLabel('الرقم الشخصي').fill('900101234');
  await page.getByTestId('ekey-login').click();
  await expect(page.getByTestId('ekey-identity')).toContainText('******234');
  await page.getByLabel('الراتب الشهري (د.ب.)').fill('900');
  await page.getByTestId('employment-continue').click();
  await page.getByTestId('consent-CRB').check();
  await page.getByTestId('consent-OPEN_BANKING').check();
  await page.getByTestId('see-preapproval').click();
  await expect(page.getByTestId('onboarding-result')).toContainText('أنت مؤهل مبدئياً');
  await expect(page.getByTestId('limit-card')).toContainText('د.ب.');
});

test('pre-approval API rejects missing consent with 422 CONSENT_REQUIRED', async ({ request }) => {
  const none = await request.post('/api/v1/onboarding/pre-approval', { data: { monthlySalaryFils: 1_000_000, existingObligationsFils: 0 } });
  expect(none.status()).toBe(422);
  expect((await none.json()).error.code).toBe('CONSENT_REQUIRED');
  const partial = await request.post('/api/v1/onboarding/pre-approval', {
    data: { monthlySalaryFils: 1_000_000, existingObligationsFils: 0, consentScopes: ['CRB'] },
  });
  expect(partial.status()).toBe(422);
  expect((await partial.json()).error.code).toBe('CONSENT_REQUIRED');
  const badSalary = await request.post('/api/v1/onboarding/pre-approval', {
    data: { monthlySalaryFils: 0, consentScopes: ['CRB', 'OPEN_BANKING'] },
  });
  expect((await badSalary.json()).error.code).toBe('INVALID_SALARY');
});

test('eKey API masks the CPR and rejects bad input', async ({ request }) => {
  const ok = await request.post('/api/v1/onboarding/ekey', { data: { cpr: '880412345' } });
  const body = await ok.text();
  expect(body).toContain('"cprMasked":"******345"');
  expect(body).not.toContain('880412345');
  const bad = await request.post('/api/v1/onboarding/ekey', { data: { cpr: '88041234X' } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.code).toBe('INVALID_CPR');
});
