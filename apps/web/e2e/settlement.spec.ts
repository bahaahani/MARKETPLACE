import { expect, test, type APIRequestContext } from '@playwright/test';

// "My installments": early-settlement quote (⚠️ placeholder fee / Ibra' rules) and autopay (sandbox).

const bhd = (fils: number) =>
  `BHD ${new Intl.NumberFormat('en-BH', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(fils / 1000)}`;

test('Murabaha early settlement: Ibra\' rebate, savings, settle through the sandbox checkout', async ({ page, request }) => {
  const q = (await (await request.get('/api/v1/me/contracts/c-1001/settlement-quote')).json()).data;
  expect(q.settlementAmountFils).toBeLessThan(q.remainingScheduledFils);

  await page.goto('/en/account');
  const panel = page.getByTestId('settlement-c-1001');
  await panel.locator('summary').click();
  await expect(panel.getByTestId('settle-to-term')).toHaveText(bhd(q.remainingScheduledFils));
  await expect(panel.getByTestId('settle-amount')).toHaveText(bhd(q.settlementAmountFils));
  await expect(panel.getByTestId('settle-savings')).toHaveText(`You save ${bhd(q.savingsFils)}`);
  await expect(panel).toContainText("Ibra' rebate");
  await expect(panel).toContainText("Shari'a Supervisory Board");
  expect((await panel.innerText()).toLowerCase()).not.toContain('interest');

  await panel.getByTestId('settle-now-c-1001').click();
  await expect(page).toHaveURL(/\/en\/checkout\?purpose=early_settlement&amount=\d+&reference=c-1001-settle/);
  await expect(page.getByText(bhd(q.settlementAmountFils)).first()).toBeVisible();
  await page.getByTestId('pay').click();
  await expect(page.getByTestId('payment-success')).toContainText('Early settlement: Honda CR-V');
});

test('conventional early settlement shows remaining principal and the placeholder fee', async ({ page, request }) => {
  const q = (await (await request.get('/api/v1/me/contracts/c-1002/settlement-quote')).json()).data;
  await page.goto('/en/account');
  const panel = page.getByTestId('settlement-c-1002');
  await panel.locator('summary').click();
  await expect(panel).toContainText('Remaining principal');
  await expect(panel).toContainText('Early settlement fee');
  await expect(panel.getByTestId('settle-amount')).toHaveText(bhd(q.settlementAmountFils));
  await expect(panel).toContainText('Placeholder fee pending CBB rules');
});

test('autopay toggle persists for this session only (sandbox)', async ({ page, browser }) => {
  // Each browser context is its own sandbox customer session, so this test never races with the other project.
  const id = 'c-1001';
  const autopayOf = async (r: APIRequestContext) => (await (await r.get('/api/v1/me')).json()).data.contracts.find((c: { id: string }) => c.id === id).autopay as boolean;
  // page.request shares the page's cookies: the same session as the page.
  const before = await autopayOf(page.request);
  await page.goto('/en/account');
  const toggle = page.getByTestId(`autopay-${id}`);
  await expect(toggle).toHaveAttribute('aria-checked', String(before));
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', String(!before));
  await expect(toggle).toContainText(!before ? 'Autopay on' : 'Autopay off');
  expect(await autopayOf(page.request)).toBe(!before);
  await page.reload();
  await expect(page.getByTestId(`autopay-${id}`)).toHaveAttribute('aria-checked', String(!before));

  // Another customer session still has the original setting.
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    expect(await autopayOf(other.request)).toBe(before);
    const otherPage = await other.newPage();
    await otherPage.goto('/en/account');
    await otherPage.request.get('/api/v1/me'); // start the session, then render with it
    await otherPage.reload();
    await expect(otherPage.getByTestId(`autopay-${id}`)).toHaveAttribute('aria-checked', String(before));
  } finally {
    await other.close();
  }
});

test('settlement works in Arabic (RTL)', async ({ page }) => {
  await page.goto('/ar/account');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const panel = page.getByTestId('settlement-c-1001');
  await panel.locator('summary').click();
  await expect(panel).toContainText('خصم الإبراء');
  await expect(panel.getByTestId('settle-now-c-1001')).toHaveText('سدد الآن');
});

test('settlement and autopay API validation', async ({ request }) => {
  for (const id of ['c-1001', 'c-1002']) {
    const q = (await (await request.get(`/api/v1/me/contracts/${id}/settlement-quote`)).json()).data;
    expect(q.settlementAmountFils).toBeLessThan(q.remainingScheduledFils);
    expect(Number.isSafeInteger(q.settlementAmountFils)).toBe(true);
    expect(q.payment).toEqual({ purpose: 'early_settlement', amountFils: q.settlementAmountFils, reference: `${id}-settle` });
  }
  const missing = await request.get('/api/v1/me/contracts/c-404/settlement-quote');
  expect(missing.status()).toBe(404);
  const badFlag = await request.patch('/api/v1/me/contracts/c-1001', { data: { autopay: 'yes' } });
  expect(badFlag.status()).toBe(422);
  expect((await badFlag.json()).error.code).toBe('INVALID_REQUEST');
  const badJson = await request.patch('/api/v1/me/contracts/c-1001', { data: '[1]', headers: { 'Content-Type': 'application/json' } });
  expect(badJson.status()).toBe(400);
  const unknown = await request.patch('/api/v1/me/contracts/c-404', { data: { autopay: true } });
  expect(unknown.status()).toBe(404);
});
