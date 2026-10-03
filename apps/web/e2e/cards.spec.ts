import { expect, test } from '@playwright/test';

// Journey J3 (sandbox): instant IMTIAZ card → virtual card → wallet (on the phone).

const PAN_LIKE = /\d(?:[ -]?\d){12,18}/;

test('apply for IMTIAZ World and get a masked virtual card (English)', async ({ page }) => {
  await page.goto('/en/cards');
  await page.getByTestId('apply-imtiaz-world').click();
  await expect(page).toHaveURL(/\/en\/cards\/imtiaz-world\/apply$/);
  const offered = await page.getByTestId('offered-limit').innerText();

  await page.getByTestId('confirm-card').click();
  const approved = page.getByTestId('card-approved');
  await expect(approved).toContainText('Your virtual card is ready');
  await expect(approved.getByTestId('masked-pan')).toHaveText(/^5xxx xxxx xxxx \d{4}$/);
  await expect(approved.getByTestId('card-limit')).toHaveText(offered);
  await expect(approved).toContainText('Sandbox');
  expect(await page.locator('body').innerText()).not.toMatch(PAN_LIKE);

  // Web parity: wallet push provisioning is phone-only, so the web explains where to do it.
  await approved.getByTestId('wallet-apple').click();
  await expect(approved.getByTestId('wallet-on-phone')).toContainText('happens on your phone');
  await expect(approved.getByTestId('wallet-google')).toBeVisible();

  // Same browser session (cookie) as the page: the card is this customer's.
  const mine = await (await page.request.get('/api/v1/me/cards')).json();
  const card = mine.data.items.find((c: { cardId: string }) => c.cardId === 'imtiaz-world');
  expect(card.status).toBe('ACTIVE');
  expect(JSON.stringify(mine)).not.toMatch(PAN_LIKE);
  expect(JSON.stringify(mine).toLowerCase()).not.toContain('cvv');
});

test('card below the minimum salary is declined with a reason', async ({ page }) => {
  await page.goto('/en/cards/imtiaz-world-elite/apply');
  await page.getByTestId('confirm-card').click();
  await expect(page.getByTestId('card-declined')).toContainText("Your salary is below this card's minimum.");
});

test('card application works in Arabic (RTL)', async ({ page }) => {
  await page.goto('/ar/cards/imtiaz-platinum/apply');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('confirm-card').click();
  const approved = page.getByTestId('card-approved');
  await expect(approved).toContainText('بطاقتك الافتراضية جاهزة');
  await expect(approved.getByTestId('masked-pan')).toHaveAttribute('dir', 'ltr');
  await approved.getByTestId('wallet-google').click();
  await expect(approved.getByTestId('wallet-on-phone')).toContainText('هاتفك');
});

test('card apply API: unknown card is 404, declined is 200 with a reason', async ({ request }) => {
  const missing = await request.post('/api/v1/cards/no-such-card/apply');
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe('CARD_NOT_FOUND');
  // Financials come from the session customer's onboarding, never from the request body.
  const supplied = await request.post('/api/v1/cards/imtiaz-uefa/apply', {
    data: { monthlySalaryFils: 1_000_000, existingObligationsFils: 900_000 },
  });
  expect(supplied.status()).toBe(400);
  const onboarded = await request.post('/api/v1/onboarding/pre-approval', {
    data: { monthlySalaryFils: 1_000_000, existingObligationsFils: 900_000, consentScopes: ['CRB', 'OPEN_BANKING'] },
  });
  expect(onboarded.status()).toBe(200);
  const declined = await request.post('/api/v1/cards/imtiaz-uefa/apply');
  expect(declined.status()).toBe(200);
  expect((await declined.json()).data).toEqual({ decision: 'DECLINED', cardId: 'imtiaz-uefa', reason: 'NO_DBR_HEADROOM' });
});
