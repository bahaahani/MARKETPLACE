import { expect, test } from '@playwright/test';

// Suhail & Suhaila 2.0 (⚠️ sandbox, rules-based): chat on customer pages, answers from the session's own data,
// actions are links the customer confirms in the normal UI.

const bhd = (fils: number) =>
  `BHD ${new Intl.NumberFormat('en-BH', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(fils / 1000)}`;

test('English: balance, then a follow-up settlement quote whose action opens the checkout (nothing is paid)', async ({ page }) => {
  await page.goto('/en');
  const launcher = page.getByTestId('assistant-launcher');
  await launcher.click();
  const panel = page.getByTestId('assistant-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('assistant-input')).toBeFocused();
  await expect(panel.getByRole('log')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByTestId('assistant-confirm-note')).toContainText('never pay');

  await page.getByTestId('assistant-input').fill('How much do I still owe on the car?');
  await page.getByTestId('assistant-send').click();
  const replies = page.getByTestId('assistant-msg-assistant');
  await expect(replies).toHaveCount(1);
  // Same session as the page (cookie set by the first chat message).
  const me = (await (await page.request.get('/api/v1/me')).json()).data;
  const car = me.contracts.find((c: { id: string }) => c.id === 'c-1001');
  await expect(replies.first()).toContainText(`You still owe ${bhd(car.outstandingFils)}`);

  await page.getByTestId('assistant-input').fill('And what if I pay it all off now?');
  await page.keyboard.press('Enter');
  await expect(replies).toHaveCount(2);
  const q = (await (await page.request.get('/api/v1/me/contracts/c-1001/settlement-quote')).json()).data;
  const answer = replies.nth(1);
  await expect(answer).toContainText(bhd(q.settlementAmountFils));
  await expect(answer).toContainText(`saving you ${bhd(q.savingsFils)}`);
  await expect(answer.getByTestId('assistant-amount-emphasis')).toHaveText(bhd(q.settlementAmountFils));

  await answer.getByTestId('assistant-action-settle-c-1001').click();
  await expect(page).toHaveURL(/\/en\/checkout\?purpose=early_settlement&amount=\d+&reference=c-1001-settle/);
  expect(new URL(page.url()).searchParams.get('amount')).toBe(String(q.settlementAmountFils));
  await expect(page.getByText(bhd(q.settlementAmountFils)).first()).toBeVisible();
  await expect(page.getByTestId('assistant-panel')).toHaveCount(0);
  // Proposing the action changed nothing: the contract is still open.
  const after = (await (await page.request.get('/api/v1/me')).json()).data;
  expect(after.contracts.find((c: { id: string }) => c.id === 'c-1001').settlement).toBeUndefined();
});

test('Arabic (RTL): Bahraini phrasing with Arabic-Indic digits finds cars within budget; a car link opens the listing', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('assistant-launcher').click();
  await page.getByTestId('assistant-persona-suhail').click();
  await expect(page.getByTestId('assistant-persona-suhail')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('assistant-greeting')).toContainText('أنا سهيل');

  await page.getByTestId('assistant-input').fill('أبي سيارة تحت ٢٠٠ بالشهر');
  await page.getByTestId('assistant-send').click();
  const reply = page.getByTestId('assistant-msg-assistant').first();
  await expect(reply.locator('[dir="rtl"]').first()).toContainText('الأرخص أولاً');

  const cars = (await (await page.request.get('/api/v1/vehicles?maxMonthlyFils=200000')).json()).data.items as { id: string; fromMonthlyFils: number }[];
  expect(cars.length).toBeGreaterThan(0);
  const first = cars[0]!;
  await expect(reply.getByTestId(`assistant-vehicle-${first.id}`)).toBeVisible();
  await reply.getByTestId(`assistant-vehicle-${first.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/ar/cars/${first.id}$`));
});

test('suggestion chips: next installment offers a payment link to the checkout; Escape closes and returns focus', async ({ page }) => {
  await page.goto('/en/cars');
  await page.getByTestId('assistant-launcher').click();
  await page.getByTestId('assistant-suggestion').filter({ hasText: 'When is my next installment?' }).click();
  const reply = page.getByTestId('assistant-msg-assistant').first();
  await expect(reply).toContainText('Your next installment is');
  const pay = reply.getByTestId('assistant-action-pay-c-1002');
  await expect(pay).toHaveAttribute('href', /^\/en\/checkout\?purpose=installment&amount=\d+&reference=c-1002-\d+/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('assistant-panel')).toHaveCount(0);
  await expect(page.getByTestId('assistant-launcher')).toBeFocused();
});

test('no customer assistant in the dealer portal', async ({ page }) => {
  await page.goto('/en/dealer');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByTestId('assistant-launcher')).toHaveCount(0);
});

test('assistant API: validation, input cap, per-session rate limit (429 + Retry-After), header session', async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const post = (data: unknown, headers: Record<string, string> = {}) => api.post('/api/v1/assistant/messages', { data, headers });
    expect((await post({ text: 'hi', locale: 'fr' })).status()).toBe(422);
    expect((await (await post({ text: '', locale: 'en' })).json()).error.code).toBe('TEXT_REQUIRED');
    expect((await (await post({ text: 'x'.repeat(501), locale: 'en' })).json()).error.code).toBe('TEXT_TOO_LONG');
    expect((await api.post('/api/v1/assistant/messages', { data: '[1]', headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);

    // Mobile-style header session: its own conversation and its own rate limit.
    const first = await post({ text: 'متى القسط الجاي', locale: 'en' }, { 'X-Sahel-Session': 'new' });
    const sid = first.headers()['x-sahel-session']!;
    const reply = (await first.json()).data;
    expect(reply.locale).toBe('ar');
    expect(reply.intent).toBe('next_installment');
    expect(reply.sandbox).toBe(true);
    let last = first;
    for (let i = 0; i < 20 && last.status() !== 429; i++) last = await post({ text: 'hi', locale: 'en' }, { 'X-Sahel-Session': sid });
    expect(last.status()).toBe(429);
    expect(Number(last.headers()['retry-after'])).toBeGreaterThan(0);
    expect((await last.json()).error.code).toBe('RATE_LIMITED');
    // Another session is not limited.
    expect((await post({ text: 'hi', locale: 'en' }, { 'X-Sahel-Session': 'new' })).status()).toBe(200);
  } finally {
    await api.dispose();
  }
});
