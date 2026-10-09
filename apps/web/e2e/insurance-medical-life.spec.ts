import { expect, test, type Page } from '@playwright/test';

// Medical and life insurance (sandbox, indicative quotes) and "My policies". Policies belong to the browser's
// customer session; tests look for the policy they bought instead of counting policies.

/** YYYY-MM-DD in Bahrain (UTC+3) for someone who is `years` old today (a day after the birthday is safe for any timezone). */
function dobForAge(years: number): string {
  const today = new Date(Date.now() + 3 * 3600_000);
  return new Date(Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate() - 1)).toISOString().slice(0, 10);
}

async function premiums(page: Page, testId: string): Promise<number[]> {
  return page.getByTestId(testId).evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-premium'))));
}

/** Pay on the checkout page and return the issued policy number. */
async function payAndGetPolicy(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/checkout\?.*reference=pq_/);
  await page.getByLabel('BenefitPay').check();
  await page.getByTestId('pay').click();
  await expect(page.getByTestId('payment-success')).toContainText('Payment successful');
  const issued = page.getByTestId('policy-issued');
  await expect(issued).toContainText('Your policy is issued');
  return (await issued.getAttribute('data-policy-number'))!;
}

test('insurance hub links to the medical and life shelf', async ({ page }) => {
  await page.goto('/en/insurance');
  await page.getByTestId('insurance-line-medical').click();
  await expect(page).toHaveURL(/\/en\/insurance\/medical$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Medical insurance');
  await page.goto('/en/insurance');
  await page.getByTestId('insurance-line-life').click();
  await expect(page).toHaveURL(/\/en\/insurance\/life$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Life insurance');
});

test('medical quotes are indicative, cheapest first, match the API and filter Takaful only', async ({ page, request }) => {
  await page.goto('/en/insurance/medical');
  await expect(page.getByTestId('medical-indicative')).toContainText('Indicative quote only');
  await expect(page.getByTestId('medical-quote')).toHaveCount(4);

  const primary = dobForAge(40);
  const spouse = dobForAge(38);
  const child = dobForAge(6);
  await page.getByTestId('primary-dob').fill(primary);
  await page.getByTestId('add-spouse').check();
  await page.getByTestId('spouse-dob').fill(spouse);
  await page.getByTestId('add-child').click();
  await page.getByTestId('child-dob-0').fill(child);
  await page.getByTestId('nationality-expat').click();
  await page.getByTestId('tier-enhanced').click();
  await page.getByTestId('get-quotes').click();
  const list = page.getByTestId('medical-quote');
  await expect(list).toHaveCount(4);
  await expect(page.getByTestId('medical-quotes')).toContainText('3 members');
  await expect(page.getByTestId('medical-quotes')).toContainText('Annual limit BHD 150,000 per member');
  const shown = await premiums(page, 'medical-quote');
  expect(shown).toEqual([...shown].sort((a, b) => a - b));

  const res = await request.post('/api/v1/insurance/medical-quotes', {
    data: { primaryDateOfBirth: primary, spouseDateOfBirth: spouse, childrenDatesOfBirth: [child], tier: 'enhanced', nationality: 'expat', preExistingConditions: false },
  });
  const api = (await res.json()).data.quotes as { premiumFils: number; annualPremiumFils: number }[];
  expect(shown).toEqual(api.map((q) => q.annualPremiumFils));

  // Premium tier costs more than Enhanced at every insurer.
  await page.getByTestId('tier-premium').click();
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('medical-quotes')).toContainText('Optical');
  const premium = await premiums(page, 'medical-quote');
  expect(Math.min(...premium)).toBeGreaterThan(Math.min(...shown));

  await page.getByTestId('medical-quotes').getByLabel('Takaful only').check();
  await expect(list).toHaveCount(2);
});

test('medical: a pre-existing declaration surcharges or refers the quote and never declines; referred quotes cannot be bought', async ({ page }) => {
  await page.goto('/en/insurance/medical');
  await expect(page.getByTestId('medical-quote')).toHaveCount(4);
  await page.getByTestId('pre-existing').check();
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('referred-note')).toHaveCount(2);
  await expect(page.getByTestId('surcharge-note')).toHaveCount(2);
  await expect(page.getByTestId('medical-quote')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Buy' })).toHaveCount(2);
  await expect(page.locator('[data-testid="medical-quote"][data-status="referred"]').getByRole('button', { name: 'Buy' })).toHaveCount(0);
  await expect(page.getByTestId('medical-quotes')).toContainText('Not for sale online');
});

test('medical members are validated: ages and child count', async ({ page }) => {
  await page.goto('/en/insurance/medical');
  await expect(page.getByTestId('medical-quote')).toHaveCount(4);
  await page.getByTestId('primary-dob').fill(dobForAge(70));
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('quote-error')).toContainText('Check the members');
  await expect(page.getByTestId('medical-quote')).toHaveCount(0);
  await page.getByTestId('primary-dob').fill(dobForAge(30));
  for (let i = 0; i < 5; i++) await page.getByTestId('add-child').click();
  await expect(page.getByTestId('add-child')).toBeDisabled();
  await page.getByTestId('child-dob-0').fill(dobForAge(19));
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('quote-error')).toContainText('Check the members');
  await page.getByTestId('child-dob-0').fill(dobForAge(2));
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('medical-quote')).toHaveCount(4);
});

test('buy medical insurance: pay the held premium, policy issued and listed in My policies', async ({ page }) => {
  await page.goto('/en/insurance/medical');
  await page.getByTestId('primary-dob').fill(dobForAge(33));
  await page.getByTestId('tier-enhanced').click();
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('medical-quote')).toHaveCount(4);
  const cheapest = page.getByTestId('medical-quote').first();
  const premium = await cheapest.getByTestId('premium').innerText();
  await cheapest.getByRole('button', { name: 'Buy' }).click();
  await expect(page.getByText(premium.replace(' / year', '')).first()).toBeVisible();
  const policyNumber = await payAndGetPolicy(page);
  expect(policyNumber).toMatch(/^SBX-MED-\d{2}-\d{6}$/);

  await page.goto('/en/account');
  const card = page.locator(`[data-testid="policy"][data-policy-number="${policyNumber}"]`);
  await expect(card).toHaveAttribute('data-status', 'ACTIVE');
  await expect(card).toContainText(/Medical · .*Enhanced · 1 members · Annual limit BHD 150,000 per member/s);
  // One-year period.
  await expect(card).toContainText('Premium BHD');
});

test('life quotes: monthly and annual figures, total over the term vs the sum assured, takaful label, no beneficiary fields', async ({ page, request }) => {
  await page.goto('/en/insurance/life');
  await expect(page.getByTestId('life-indicative')).toContainText('Indicative quote only');
  await expect(page.getByTestId('life-quote')).toHaveCount(4);
  await expect(page.getByTestId('beneficiary-note')).toContainText('Beneficiary names are not collected in this quote');
  await expect(page.getByLabel(/beneficiar/i)).toHaveCount(0);

  const dob = dobForAge(42);
  await page.getByTestId('life-dob').fill(dob);
  await page.getByTestId('sum-assured').fill('250000');
  await page.getByTestId('term-years').fill('15');
  await page.getByTestId('smoker').check();
  await page.getByTestId('ci-rider').check();
  await page.getByTestId('get-quotes').click();
  const list = page.getByTestId('life-quote');
  await expect(list).toHaveCount(4);
  await expect(page.getByTestId('life-quotes')).toContainText('Critical illness rider');
  await expect(page.getByTestId('life-quotes')).toContainText('Total over 15 years');
  await expect(page.getByTestId('life-quotes')).toContainText('Sum assured BHD 250,000.000');
  const shown = await premiums(page, 'life-quote');
  expect(shown).toEqual([...shown].sort((a, b) => a - b));

  const res = await request.post('/api/v1/insurance/life-quotes', {
    data: { dateOfBirth: dob, smoker: true, sumAssuredFils: 250_000_000, termYears: 15, criticalIllnessRider: true },
  });
  const api = (await res.json()).data.quotes as { annualPremiumFils: number; totalPremiumsFils: number; productType: string }[];
  expect(shown).toEqual(api.map((q) => q.annualPremiumFils));
  const totals = await list.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-total'))));
  expect(totals).toEqual(api.map((q) => q.totalPremiumsFils));
  expect(totals.every((t) => t < 250_000_000)).toBe(true);
  const labels = await page.getByTestId('product-type').allInnerTexts();
  expect(labels).toEqual(api.map((q) => (q.productType === 'family-takaful' ? 'Family takaful' : 'Conventional')));

  await page.getByTestId('life-quotes').getByLabel('Takaful only').check();
  await expect(list).toHaveCount(2);
  await expect(page.getByTestId('product-type').first()).toHaveText('Family takaful');
});

test('life input is validated: age, sum assured and a term that must end by age 70', async ({ page }) => {
  await page.goto('/en/insurance/life');
  await expect(page.getByTestId('life-quote')).toHaveCount(4);
  await page.getByTestId('life-dob').fill(dobForAge(70));
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('quote-error')).toContainText('life cover is for ages 18 to 65');
  await page.getByTestId('life-dob').fill(dobForAge(50));
  await page.getByTestId('term-years').fill('25');
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('quote-error')).toContainText('ending by age 70');
  await page.getByTestId('term-years').fill('20');
  await page.getByTestId('sum-assured').fill('12000');
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('quote-error')).toContainText('steps of BHD 5,000');
  await page.getByTestId('sum-assured').fill('15000');
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('life-quote')).toHaveCount(4);
});

test('buy life insurance: annual premium paid, policy issued with the term and listed in My policies', async ({ page }) => {
  await page.goto('/en/insurance/life');
  await page.getByTestId('life-dob').fill(dobForAge(36));
  await page.getByTestId('sum-assured').fill('200000');
  await page.getByTestId('term-years').fill('25');
  await page.getByTestId('get-quotes').click();
  await expect(page.getByTestId('life-quote')).toHaveCount(4);
  const cheapest = page.getByTestId('life-quote').first();
  const premium = await cheapest.getByTestId('premium').innerText();
  await cheapest.getByRole('button', { name: 'Buy' }).click();
  await expect(page.getByText(premium.replace(' / year', '')).first()).toBeVisible();
  const policyNumber = await payAndGetPolicy(page);
  expect(policyNumber).toMatch(/^SBX-LIF-\d{2}-\d{6}$/);

  await page.goto('/en/account');
  const card = page.locator(`[data-testid="policy"][data-policy-number="${policyNumber}"]`);
  await expect(card).toHaveAttribute('data-status', 'ACTIVE');
  await expect(card).toContainText('Life ·');
  await expect(card).toContainText('Sum assured BHD 200,000 · 25-year term');
});

test('the medical and life pages work in Arabic (RTL)', async ({ page }) => {
  await page.goto('/ar/insurance/life');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('التأمين على الحياة');
  await expect(page.getByTestId('life-quote')).toHaveCount(4);
  await page.goto('/ar/insurance/medical');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('التأمين الطبي');
  await expect(page.getByTestId('medical-quote')).toHaveCount(4);
});
