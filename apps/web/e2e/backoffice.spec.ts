import { expect, test, type Browser, type Page } from '@playwright/test';

/** Back-office console (staff tool). ⚠️ Sandbox sign-in: pick a role. Staff use their own browser context. */

async function staffPage(browser: Browser, baseURL: string | undefined, roleTestId: string, locale = 'en'): Promise<Page> {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await page.goto(`/${locale}/backoffice`);
  await page.getByTestId(roleTestId).click();
  await expect(page.getByTestId('bo-staff')).toBeVisible();
  return page;
}

function bahrainDate(days: number): string {
  return new Date(Date.now() + 3 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

const staff = (role: string) => ({ 'X-Sahel-Staff-Role': role });

test('customer is referred, a credit officer approves it in the back office, the customer sees it approved and accepts', async ({ page, browser, baseURL }) => {
  // Customer: a thin-margin application is referred.
  await page.goto('/en/cars/v-nissan-patrol-2021');
  await page.getByTestId('apply-finance').click();
  await expect(page).toHaveURL(/\/en\/applications\/app_sbx_/);
  await expect(page.getByTestId('decision')).toHaveAttribute('data-outcome', 'REFERRED');
  const appId = page.url().split('/').pop()!;
  const monthly = await page.getByTestId('offer-monthly').innerText();

  // Credit officer (own browser context): the application is in the queue of every customer.
  const officer = await staffPage(browser, baseURL, 'bo-role-credit_officer');
  await expect(officer.getByTestId('bo-staff')).toHaveAttribute('data-role', 'credit_officer');
  await expect(officer.getByTestId('bo-nav-audit')).toHaveCount(0);
  await officer.getByTestId('bo-nav-credit').click();
  const row = officer.locator(`[data-testid="bo-referred"][data-id="${appId}"]`);
  await expect(row.getByTestId('bo-applicant')).toContainText('Fatima');
  // First name only.
  await expect(row.getByTestId('bo-applicant')).not.toContainText('Ahmed');
  await expect(row.getByTestId('bo-monthly')).toHaveText(monthly);
  await expect(row.locator('[data-reason="HIGH_DBR_UTILISATION"]')).toBeVisible();
  await expect(row.getByTestId('bo-dbr')).toContainText('cap 50%');
  // Credit officers see salary and obligations.
  await expect(row.getByTestId('bo-financials')).toContainText('BHD 1,400');

  // A note is mandatory.
  await row.getByTestId('bo-approve').click();
  await expect(row.getByTestId('bo-decision-message')).toContainText('at least 5 characters');
  await row.getByTestId('bo-note').fill('Stable employment, approved on review');
  await row.getByTestId('bo-approve').click();
  await expect(row.getByTestId('bo-decision-message')).toContainText('Approved');
  await officer.reload();
  await expect(officer.locator(`[data-testid="bo-referred"][data-id="${appId}"]`)).toHaveCount(0);

  // Customer: approved, reviewed by a credit officer, can accept; the internal note is not shown.
  await page.reload();
  await expect(page.getByTestId('decision')).toHaveAttribute('data-outcome', 'APPROVED');
  await expect(page.getByTestId('reviewed-by-officer')).toHaveText('Reviewed by credit officer');
  const approvedStep = page.locator('[data-testid="timeline-step"][data-status="APPROVED"]');
  await expect(approvedStep.getByTestId('step-reviewed-by-officer')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Stable employment');
  await page.getByTestId('accept-offer').click();
  await expect(page.locator('[data-testid="timeline-step"][data-status="COMPLETED"]')).toHaveAttribute('data-done', 'true');

  // Compliance viewer: the decision is in the audit log with who, role and note; read-only queue.
  const compliance = await staffPage(browser, baseURL, 'bo-role-compliance');
  await compliance.getByTestId('bo-nav-audit').click();
  await compliance.getByTestId('bo-audit-type').selectOption('APPLICATION_APPROVED');
  await compliance.getByTestId('bo-audit-apply').click();
  await expect(compliance).toHaveURL(/type=APPLICATION_APPROVED/);
  const entry = compliance.locator('[data-testid="bo-audit-row"]', { hasText: appId });
  await expect(entry).toContainText('Demo Credit Officer');
  await expect(entry).toContainText('Credit officer');
  await expect(entry.getByTestId('bo-audit-note')).toHaveText('Stable employment, approved on review');
  await expect(compliance.locator('[data-testid="bo-audit-row"]:not([data-type="APPLICATION_APPROVED"])')).toHaveCount(0);
  await compliance.getByTestId('bo-nav-credit').click();
  await expect(compliance.getByTestId('bo-read-only')).toBeVisible();
  await expect(compliance.getByTestId('bo-financials')).toHaveCount(0);
  await expect(compliance.getByTestId('bo-approve')).toHaveCount(0);
});

type Step = { status: string; done: boolean; murabaha: boolean; ijara: boolean; by?: string };

test('a referred vehicle Murabaha approved by a credit officer shows the Murabaha steps to come and is accepted like any approval', async ({ request }) => {
  const created = await request.post('/api/v1/applications', {
    headers: { 'Idempotency-Key': `e2e-ref-mur-${Date.now()}` },
    data: { productLine: 'vehicle', structure: 'murabaha', vehicleId: 'v-nissan-patrol-2021', downPaymentFils: 3_900_000, tenureMonths: 60 },
  });
  const app = (await created.json()).data;
  expect(app.status).toBe('REFERRED');
  expect((app.steps as Step[]).filter((s) => !s.done)).toEqual([]);
  const decided = await request.post(`/api/v1/backoffice/applications/${app.id}/decision`, {
    headers: staff('credit_officer'),
    data: { outcome: 'APPROVED', note: 'Verified salary certificate' },
  });
  expect(decided.status()).toBe(200);
  const view = (await (await request.get(`/api/v1/applications/${app.id}`)).json()).data;
  const upcoming = (view.steps as Step[]).filter((s) => !s.done);
  expect(upcoming.map((s) => s.status)).toEqual(['OFFER_ACCEPTED', 'CONTRACT_SIGNED', 'ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_BCFC', 'SALE_TO_CUSTOMER', 'COMPLETED']);
  expect(upcoming.filter((s) => s.murabaha).map((s) => s.status)).toEqual(['ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_BCFC', 'SALE_TO_CUSTOMER']);
  const accepted = (await (await request.post(`/api/v1/applications/${app.id}/accept`)).json()).data;
  expect(accepted.status).toBe('COMPLETED');
  expect((accepted.steps as Step[]).map((s) => s.status)).toEqual([
    'DRAFT', 'SUBMITTED', 'REFERRED', 'APPROVED', 'OFFER_ACCEPTED', 'CONTRACT_SIGNED',
    'ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_BCFC', 'SALE_TO_CUSTOMER', 'COMPLETED',
  ]);
  expect((accepted.steps as Step[]).find((s) => s.status === 'APPROVED')?.by).toBe('CREDIT_OFFICER');
});

test('a referred home Ijara application: the credit queue shows the property, approval adds the Ijara steps, accept starts the lease', async ({ page, browser, baseURL }) => {
  // Salary that refers a home application (thin DBR margin).
  const onboard = await page.request.post('/api/v1/onboarding/pre-approval', {
    data: { monthlySalaryFils: 1_300_000, existingObligationsFils: 0, employer: 'Bahrain Co.', consentScopes: ['CRB', 'OPEN_BANKING'] },
  });
  expect(onboard.status()).toBe(200);
  const created = await page.request.post('/api/v1/applications', {
    headers: { 'Idempotency-Key': `e2e-ref-ijara-${Date.now()}` },
    data: { productLine: 'home', structure: 'ijara', propertyId: 'p-amwaj-apt-2br', downPaymentFils: 19_600_000, tenureMonths: 240 },
  });
  const app = (await created.json()).data;
  expect(app.status).toBe('REFERRED');

  const officer = await staffPage(browser, baseURL, 'bo-role-credit_officer');
  await officer.getByTestId('bo-nav-credit').click();
  const row = officer.locator(`[data-testid="bo-referred"][data-id="${app.id}"]`);
  await expect(row).toContainText('Home finance');
  await expect(row.getByTestId('bo-asset')).toHaveText('Sea-view 2-bedroom apartment');
  await expect(row.getByTestId('bo-structure')).toHaveText('Islamic · Ijara');
  await expect(row).not.toContainText(/interest/i);
  await row.getByTestId('bo-note').fill('Verified salary certificate');
  await row.getByTestId('bo-approve').click();
  await expect(row.getByTestId('bo-decision-message')).toContainText('Approved');

  await page.goto(`/en/applications/${app.id}`);
  await expect(page.getByTestId('decision')).toHaveAttribute('data-outcome', 'APPROVED');
  const ijara = page.getByTestId('ijara-steps');
  await expect(ijara.locator('[data-testid="timeline-step"]')).toHaveCount(3);
  await expect(page.locator('body')).not.toContainText(/interest/i);
  await page.getByTestId('accept-offer').click();
  await expect(page.getByTestId('lease-active')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-step"][data-status="LEASE_STARTED"]')).toHaveAttribute('data-done', 'true');
  await expect(page.locator('[data-testid="timeline-step"][data-status="OWNERSHIP_TRANSFERRED_TO_CUSTOMER"]')).toHaveAttribute('data-done', 'false');
});

test('operations refunds a captured premium that never became a policy, once', async ({ request, browser, baseURL }) => {
  // Customer pays a held travel quote but the app never confirms the policy.
  const quoteRes = await request.post('/api/v1/policies/quotes', {
    data: { line: 'travel', insurerId: 'pearl-takaful', input: { region: 'gcc', startDate: bahrainDate(3), endDate: bahrainDate(5) } },
  });
  const quote = (await quoteRes.json()).data as { id: string; premiumFils: number };
  const payRes = await request.post('/api/v1/payments', {
    data: { amountFils: quote.premiumFils, method: 'benefitpay', purpose: 'insurance_premium', reference: quote.id },
    headers: { 'Idempotency-Key': `e2e-bo-refund-${Math.random()}` },
  });
  const paymentId = (await payRes.json()).data.id as string;
  expect((await (await request.post(`/api/v1/payments/${paymentId}/confirm`)).json()).data.status).toBe('CAPTURED');

  const ops = await staffPage(browser, baseURL, 'bo-role-operations');
  // Operations sees payment data only: no credit queue.
  await expect(ops.getByTestId('bo-nav-credit')).toHaveCount(0);
  await expect(ops.getByTestId('bo-kpi-refunds')).toBeVisible();
  await ops.goto('/en/backoffice/credit');
  await expect(ops.getByTestId('bo-forbidden')).toBeVisible();
  await ops.getByTestId('bo-nav-refunds').click();
  const row = ops.locator(`[data-testid="bo-refund-row"][data-id="${paymentId}"]`);
  await expect(row).toContainText(quote.id);
  await expect(row).toContainText('BenefitPay');
  await expect(row).toContainText(`BHD ${(quote.premiumFils / 1000).toLocaleString('en', { minimumFractionDigits: 3 })}`);
  await row.getByTestId('bo-refund').click();
  await expect(row.getByTestId('bo-refunded')).toContainText('Refunded');
  await ops.reload();
  await expect(ops.locator(`[data-testid="bo-refund-row"][data-id="${paymentId}"]`)).toHaveCount(0);

  // Idempotent: refunding again returns the original refund and audit entry.
  const again = await request.post(`/api/v1/backoffice/refunds/${paymentId}`, { headers: staff('operations') });
  expect(again.status()).toBe(200);
  const body = (await again.json()).data;
  expect(body).toMatchObject({ replayed: true, payment: { status: 'REFUNDED' }, audit: { type: 'PAYMENT_REFUNDED', role: 'operations' } });
  const audit = (await (await request.get('/api/v1/backoffice/audit?type=PAYMENT_REFUNDED', { headers: staff('compliance') })).json()).data;
  expect(audit.items.filter((e: { subject?: { id: string } }) => e.subject?.id === paymentId)).toHaveLength(1);

  // The refunded premium can no longer become a policy.
  const late = await request.post('/api/v1/policies/confirm', { data: { paymentId, quoteId: quote.id } });
  expect(late.status()).toBe(409);
  expect((await late.json()).error.code).toBe('PAYMENT_NOT_CAPTURED');
});

test('back-office API: 401 without a role, 403 for the wrong role, data minimization, mandatory note', async ({ request }) => {
  const get = (url: string, role?: string) => request.get(url, role ? { headers: staff(role) } : {});
  // This API context never signed in as staff.
  expect((await get('/api/v1/backoffice/dashboard')).status()).toBe(401);
  expect((await get('/api/v1/backoffice/applications', 'admin')).status()).toBe(401);
  expect((await get('/api/v1/backoffice/applications', 'operations')).status()).toBe(403);
  expect((await get('/api/v1/backoffice/refunds', 'credit_officer')).status()).toBe(403);
  expect((await get('/api/v1/backoffice/audit', 'operations')).status()).toBe(403);
  expect((await get('/api/v1/backoffice/audit', 'credit_officer')).status()).toBe(403);
  expect((await get('/api/v1/backoffice/audit?type=NOPE', 'compliance')).status()).toBe(400);
  for (const role of ['credit_officer', 'operations', 'compliance']) expect((await get('/api/v1/backoffice/dashboard', role)).status()).toBe(200);

  // A referred application (customer API), then the queue as each role.
  const applied = await request.post('/api/v1/applications', {
    data: { productLine: 'vehicle', structure: 'conventional', vehicleId: 'v-nissan-patrol-2021', downPaymentFils: 3_900_000, tenureMonths: 60 },
    headers: { 'Idempotency-Key': `e2e-bo-api-${Math.random()}` },
  });
  const app = (await applied.json()).data as { id: string; status: string };
  expect(app.status).toBe('REFERRED');
  const asOfficer = (await (await get('/api/v1/backoffice/applications', 'credit_officer')).json()).data.items.find((a: { id: string }) => a.id === app.id);
  expect(asOfficer.financials.monthlySalaryFils).toBeGreaterThan(0);
  const asCompliance = (await (await get('/api/v1/backoffice/applications', 'compliance')).json()).data.items.find((a: { id: string }) => a.id === app.id);
  expect(asCompliance.financials).toBeUndefined();
  expect(asCompliance.firstName.en).toBe('Fatima');

  const decide = (role: string, data: object) => request.post(`/api/v1/backoffice/applications/${app.id}/decision`, { headers: staff(role), data });
  expect((await decide('compliance', { outcome: 'DECLINED', note: 'Not allowed' })).status()).toBe(403);
  expect((await decide('credit_officer', { outcome: 'DECLINED' })).status()).toBe(422);
  expect((await decide('credit_officer', { outcome: 'MAYBE', note: 'Not allowed' })).status()).toBe(400);
  const declined = await decide('credit_officer', { outcome: 'DECLINED', note: 'Income could not be verified' });
  expect(declined.status()).toBe(200);
  expect((await declined.json()).data.application).toMatchObject({ status: 'DECLINED', review: { outcome: 'DECLINED', reviewedBy: 'CREDIT_OFFICER' } });
  expect((await (await decide('credit_officer', { outcome: 'DECLINED', note: 'Income could not be verified' })).json()).data.replayed).toBe(true);
  expect((await decide('credit_officer', { outcome: 'APPROVED', note: 'Changed my mind' })).status()).toBe(409);

  // The customer sees the decline (and not the internal note).
  const mine = await (await request.get(`/api/v1/applications/${app.id}`)).json();
  expect(mine.data.status).toBe('DECLINED');
  expect(mine.data.steps.find((s: { status: string }) => s.status === 'DECLINED').by).toBe('CREDIT_OFFICER');
  expect(JSON.stringify(mine)).not.toContain('Income could not be verified');
});

test('back office in Arabic is RTL and shows the role picker', async ({ browser, baseURL }) => {
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.goto('/ar/backoffice');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('bo-role-credit_officer')).toContainText('مسؤول الائتمان');
  await page.getByTestId('bo-role-compliance').click();
  await expect(page.getByTestId('bo-kpi-apps-today')).toBeVisible();
  await page.getByTestId('bo-sign-out').click();
  await expect(page.getByTestId('bo-role-operations')).toBeVisible();
});
