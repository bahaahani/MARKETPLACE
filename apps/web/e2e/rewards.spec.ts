import { expect, test, type APIRequestContext } from '@playwright/test';

// IMTIAZ Points Everywhere (⚠️ sandbox, placeholder earn / burn rates): pay something → points increase → redeem.

interface Summary {
  balance: number;
  tier: { id: string };
  entries: { id: string; points: number; source: string; paymentId?: string; onTime?: boolean }[];
}
const rewards = async (r: APIRequestContext) => (await (await r.get('/api/v1/me/rewards')).json()).data as Summary;
const fmt = (n: number) => new Intl.NumberFormat('en-BH').format(n);

test('pay an installment on time → points and tier go up → redeem a voucher (masked in the list)', async ({ page }) => {
  // page.request shares the page's cookie: the same sandbox session as the page.
  const before = await rewards(page.request);
  await page.goto('/en/account');
  await expect(page.getByTestId('account-rewards')).toContainText(`${fmt(before.balance)} points`);
  await page.getByTestId('account-rewards').click();
  await expect(page).toHaveURL(/\/en\/rewards$/);
  await expect(page.getByTestId('rew-balance')).toHaveAttribute('data-points', String(before.balance));
  await expect(page.getByTestId('rew-tier')).toHaveAttribute('data-tier', before.tier.id);
  await expect(page.getByTestId('rew-sandbox')).toContainText('placeholders');
  // The demo history already shows good-payer streaks and the opening balance.
  await expect(page.locator('[data-testid="rew-entry"][data-source="good_payer_streak"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="rew-entry"][data-source="opening_balance"]')).toHaveCount(1);

  // Pay the next CR-V installment through the sandbox checkout (due in a few days: on time).
  await page.goto('/en/account');
  await page.getByTestId('contract').first().getByRole('link', { name: 'Pay now' }).click();
  await expect(page).toHaveURL(/purpose=installment/);
  await page.getByTestId('pay').click();
  await expect(page.getByTestId('payment-success')).toBeVisible();

  const after = await rewards(page.request);
  const earned = after.entries.find((e) => e.source === 'payment')!;
  expect(earned.onTime).toBe(true);
  expect(earned.points).toBeGreaterThan(0);
  expect(after.balance).toBe(before.balance + earned.points);
  expect(after.tier.id).toBe('gold');
  await page.goto('/en/rewards');
  await expect(page.getByTestId('rew-balance')).toHaveAttribute('data-points', String(after.balance));
  await expect(page.getByTestId('rew-tier')).toHaveAttribute('data-tier', 'gold');
  await expect(page.locator('[data-testid="rew-entry"][data-source="payment"]').first()).toContainText(`+${fmt(earned.points)}`);

  // Redeem a fuel voucher, with a confirmation step.
  const fuel = page.getByTestId('rew-item-fuel-5');
  await fuel.getByTestId('rew-redeem-fuel-5').click();
  await expect(fuel.getByRole('alertdialog')).toContainText('Redeem BHD 5 fuel voucher for 1,500 points?');
  await fuel.getByTestId('rew-confirm').click();
  const code = (await page.getByTestId('rew-code').innerText()).trim();
  expect(code).toMatch(/^IMZ-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  await expect(page.getByTestId('rew-new-balance')).toContainText(fmt(after.balance - 1_500));
  await expect(page.getByTestId('rew-balance')).toHaveAttribute('data-points', String(after.balance - 1_500));
  // Later the code is only shown masked (last 4 characters).
  await expect(page.getByTestId('rew-voucher-code').first()).toHaveText(`IMZ-••••-••••-${code.slice(-4)}`);
  const list = await (await page.request.get('/api/v1/me/rewards/redemptions')).text();
  expect(list).not.toContain(code);
  expect((await rewards(page.request)).entries.some((e) => e.source === 'redemption' && e.points === -1_500)).toBe(true);
});

test('rewards page in Arabic is RTL, and home links to it', async ({ page }) => {
  await page.goto('/ar');
  await page.getByTestId('rewards-cta').click();
  await expect(page).toHaveURL(/\/ar\/rewards$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('نقاط امتياز');
  await expect(page.getByTestId('rew-tier')).toContainText('فضي');
});

test('rewards API: idempotent redemption, insufficient balance, validation, private per session', async ({ playwright }) => {
  const baseURL = test.info().project.use.baseURL;
  const a = await playwright.request.newContext({ baseURL });
  const b = await playwright.request.newContext({ baseURL });
  try {
    const cat = (await (await a.get('/api/v1/rewards/catalogue')).json()).data;
    expect(cat.items.length).toBeGreaterThan(3);
    expect(cat.items.some((i: { demoPartner: boolean }) => i.demoPartner)).toBe(true);
    const start = (await rewards(a)).balance;
    expect(cat.balance).toBe(start);

    const redeem = (itemId: string, key?: string) =>
      a.post('/api/v1/me/rewards/redemptions', { data: { itemId }, headers: key ? { 'Idempotency-Key': key } : {} });
    const first = await redeem('takaful-15', 'e2e-rewards-0001');
    expect(first.status()).toBe(201);
    const r1 = (await first.json()).data;
    const replay = await redeem('takaful-15', 'e2e-rewards-0001');
    expect(replay.status()).toBe(200);
    expect((await replay.json()).data.redemption.id).toBe(r1.redemption.id);
    expect((await rewards(a)).balance).toBe(start - 3_000);
    expect((await redeem('fuel-5', 'e2e-rewards-0001')).status()).toBe(409);
    expect((await redeem('takaful-15')).status()).toBe(400);
    expect((await redeem('nope', 'e2e-rewards-0002')).status()).toBe(404);
    expect((await a.post('/api/v1/me/rewards/redemptions', { data: '[1]', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-rewards-0003' } })).status()).toBe(400);

    // Spend down until the balance no longer covers the item: 422, and nothing is taken.
    let status = 201;
    for (let i = 0; status === 201 && i < 20; i++) status = (await redeem('takaful-15', `e2e-rewards-drain-${i}`)).status();
    expect(status).toBe(422);
    const left = (await rewards(a)).balance;
    expect(left).toBeLessThan(3_000);
    expect(left).toBeGreaterThanOrEqual(0);
    const low = (await (await a.get('/api/v1/rewards/catalogue')).json()).data;
    expect(low.items.find((i: { id: string }) => i.id === 'takaful-15').affordable).toBe(false);

    // Another session sees none of it, and can reuse the same key.
    expect((await (await b.get('/api/v1/me/rewards/redemptions')).json()).data.total).toBe(0);
    expect((await rewards(b)).balance).toBe(start);
    expect((await b.post('/api/v1/me/rewards/redemptions', { data: { itemId: 'partner-coffee' }, headers: { 'Idempotency-Key': 'e2e-rewards-0001' } })).status()).toBe(201);
    const listA = (await (await a.get('/api/v1/me/rewards/redemptions')).json()).data;
    expect(listA.items.every((r: { code?: string; codeMasked: string }) => r.code === undefined && r.codeMasked.includes('••••'))).toBe(true);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});
