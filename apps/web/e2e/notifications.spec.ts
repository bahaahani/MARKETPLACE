import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Notifications inbox, reminders and preferences (⚠️ sandbox: derived from the customer's data, nothing is sent).
// Each test starts its own session through page.request BEFORE the first page load, so the browser and the API calls
// share one customer. The demo customer always has the two garage reminders (registration and insurance in 24 days),
// plus an installment reminder when its next installment (4 UTC days ahead) is 3 Bahrain days ahead (21:00-24:00 UTC),
// so counts are relative to the session's starting inbox.

/** YYYY-MM-DD in Bahrain (UTC+3), `days` from today. */
function bahrainDate(days: number): string {
  return new Date(Date.now() + 3 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

interface Inbox {
  items: { id: string; type: string; link: string; read: boolean; title: { en: string; ar: string } }[];
  unreadCount: number;
  total: number;
}

async function inbox(request: APIRequestContext): Promise<Inbox> {
  const res = await request.get('/api/v1/me/notifications');
  expect(res.status()).toBe(200);
  return (await res.json()).data as Inbox;
}

/** Start the session in the browser context (cookie), then use the page. */
async function startSession(page: Page): Promise<Inbox> {
  return inbox(page.request);
}

/** Buy a 3-day trip starting today (hold, pay, confirm) in this session; returns the policy id. */
async function buyShortTrip(request: APIRequestContext): Promise<string> {
  const quote = (await (
    await request.post('/api/v1/policies/quotes', {
      data: {
        line: 'travel',
        insurerId: 'pearl-takaful',
        input: { region: 'gcc', tier: 'basic', startDate: bahrainDate(0), endDate: bahrainDate(2), adults: 1, children: 0 },
      },
    })
  ).json()).data as { id: string; premiumFils: number };
  const payment = (await (
    await request.post('/api/v1/payments', {
      data: { amountFils: quote.premiumFils, method: 'card', purpose: 'insurance_premium', reference: quote.id },
      headers: { 'Idempotency-Key': `e2e-notif-trip-${quote.id}` },
    })
  ).json()).data as { id: string };
  await request.post(`/api/v1/payments/${payment.id}/confirm`);
  const res = await request.post('/api/v1/policies/confirm', { data: { paymentId: payment.id, quoteId: quote.id } });
  expect(res.status()).toBe(200);
  return ((await res.json()).data as { id: string }).id;
}

async function applyForCar(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/v1/applications', {
    data: { productLine: 'vehicle', structure: 'murabaha', vehicleId: 'v-honda-crv-2026', downPaymentFils: 3_000_000, tenureMonths: 60 },
    headers: { 'Idempotency-Key': `e2e-notif-app-${Date.now()}-${Math.random()}` },
  });
  expect(res.status()).toBe(201);
  const app = (await res.json()).data as { id: string; status: string };
  expect(app.status).toBe('APPROVED');
  return app.id;
}

test('the bell shows the unread count; the inbox groups the demo reminders', async ({ page }) => {
  const start = await startSession(page);
  const n = start.unreadCount;
  expect(n).toBe(start.total);
  expect(start.items.map((i) => i.type)).toEqual(expect.arrayContaining(['garage_insurance_expiring', 'registration_expiring']));
  await page.goto('/en');
  const bell = page.getByTestId('notif-bell');
  await expect(bell).toHaveAttribute('aria-label', `Notifications, ${n} unread`);
  await expect(page.getByTestId('notif-badge')).toHaveText(String(n));
  await expect(page.getByTestId('notif-badge')).toHaveAttribute('aria-hidden', 'true');
  await bell.click();
  await expect(page).toHaveURL(/\/en\/notifications$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
  await expect(page.getByTestId('notif-item')).toHaveCount(n);
  await expect(page.locator('[data-testid="notif-item"][data-id^="registration_expiring."]').getByTestId('notif-delivery')).toContainText(
    'would also send by Push',
  );
});

test('buy a short trip → "Travel cover ends" → opens travel insurance and the badge goes down', async ({ page }) => {
  const n = (await startSession(page)).unreadCount;
  const policyId = await buyShortTrip(page.request);
  const after = await inbox(page.request);
  const trip = after.items.find((i) => i.type === 'policy_expiring')!;
  expect(trip.id).toBe(`policy_expiring.${policyId}.${bahrainDate(2)}`);
  expect(after.unreadCount).toBe(n + 1);

  await page.goto('/en/notifications');
  await expect(page.getByTestId('notif-badge')).toHaveText(String(n + 1));
  const item = page.locator(`[data-testid="notif-item"][data-id="${trip.id}"]`);
  await expect(item).toContainText('Travel cover ends on');
  await expect(item).toHaveAttribute('data-read', 'false');
  await item.getByTestId('notif-open').click();
  await expect(page).toHaveURL(/\/en\/insurance\/travel$/);
  await expect(page.getByTestId('notif-badge')).toHaveText(String(n));
  expect((await inbox(page.request)).items.find((i) => i.id === trip.id)!.read).toBe(true);
});

test('an approved application → notification → application page; mark all read clears the badge', async ({ page }) => {
  const n = (await startSession(page)).unreadCount;
  const appId = await applyForCar(page.request);
  await page.goto('/en/notifications');
  const item = page.locator(`[data-testid="notif-item"][data-id="application_update.${appId}.APPROVED"]`);
  await expect(item).toContainText('Your car finance is approved');
  await item.getByTestId('notif-open').click();
  await expect(page).toHaveURL(new RegExp(`/en/applications/${appId}$`));
  await expect(page.getByTestId('accept-offer')).toBeVisible();

  await page.goto('/en/notifications');
  await expect(page.getByTestId('notif-badge')).toHaveText(String(n));
  await page.getByTestId('notif-read-all').click();
  await expect(page.getByTestId('notif-unread-count')).toHaveText('0 unread');
  await expect(page.getByTestId('notif-badge')).toHaveCount(0);
  await expect(page.getByTestId('notif-bell')).toHaveAttribute('aria-label', 'Notifications');
  // Accepting completes the finance: a new notification (new id), unread.
  await page.request.post(`/api/v1/applications/${appId}/accept`);
  await page.reload();
  await expect(page.locator(`[data-testid="notif-item"][data-id="application_update.${appId}.COMPLETED"]`)).toHaveAttribute('data-read', 'false');
  await expect(page.getByTestId('notif-badge')).toHaveText('1');
});

test('mark one read and dismiss: both survive a reload (re-derived with the same ids)', async ({ page }) => {
  const n = (await startSession(page)).unreadCount;
  await page.goto('/en/notifications');
  const items = page.getByTestId('notif-item');
  await expect(items).toHaveCount(n);
  const firstId = (await items.first().getAttribute('data-id'))!;
  await items.first().getByTestId('notif-mark-read').click();
  await expect(page.locator(`[data-id="${firstId}"]`)).toHaveAttribute('data-read', 'true');
  await expect(page.getByTestId('notif-badge')).toHaveText(String(n - 1));
  const secondId = (await items.nth(1).getAttribute('data-id'))!;
  await items.nth(1).getByTestId('notif-dismiss').click();
  await expect(items).toHaveCount(n - 1);
  await page.reload();
  await expect(items).toHaveCount(n - 1);
  await expect(page.locator(`[data-id="${firstId}"]`)).toHaveAttribute('data-read', 'true');
  await expect(page.locator(`[data-id="${secondId}"]`)).toHaveCount(0);
  if (n === 2) await expect(page.getByTestId('notif-badge')).toHaveCount(0);
  else await expect(page.getByTestId('notif-badge')).toHaveText(String(n - 2));
});

test('preferences: overdue payments cannot be fully switched off; other changes are saved', async ({ page }) => {
  await startSession(page);
  await page.goto('/en/account');
  await page.getByTestId('account-notif-prefs').click();
  await expect(page).toHaveURL(/\/en\/notifications\/preferences$/);
  await expect(page.getByTestId('notif-pref-overdue')).toContainText('Required');
  await page.getByTestId('notif-pref-overdue-push').uncheck();
  await page.getByTestId('notif-pref-overdue-sms').uncheck();
  await page.getByTestId('notif-prefs-save').click();
  await expect(page.getByTestId('notif-prefs-status')).toHaveText('Overdue payment notices need at least one channel.');

  await page.getByTestId('notif-pref-overdue-whatsapp').check();
  await page.getByTestId('notif-pref-vehicle-push').uncheck();
  await page.getByTestId('notif-quiet-start').fill('23:00');
  await page.getByTestId('notif-prefs-save').click();
  await expect(page.getByTestId('notif-prefs-status')).toContainText('Settings saved');
  await page.reload();
  await expect(page.getByTestId('notif-pref-overdue-whatsapp')).toBeChecked();
  await expect(page.getByTestId('notif-pref-overdue-push')).not.toBeChecked();
  await expect(page.getByTestId('notif-quiet-start')).toHaveValue('23:00');
  // The registration reminder (category vehicle) is now in-app only.
  await page.goto('/en/notifications');
  await expect(page.locator('[data-testid="notif-item"][data-id^="registration_expiring."]').getByTestId('notif-delivery')).toContainText('In the app only');
});

test('Arabic inbox is right-to-left; staff areas have no bell', async ({ page }) => {
  const n = (await startSession(page)).unreadCount;
  await page.goto('/ar/notifications');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('الإشعارات');
  await expect(page.getByTestId('notif-bell')).toHaveAttribute('aria-label', `الإشعارات، ${n} غير مقروءة`);
  await page.goto('/en/dealer');
  await expect(page.getByTestId('footer-dealer-link')).toBeVisible();
  await expect(page.getByTestId('notif-bell')).toHaveCount(0);
});

test.describe('API', () => {
  test('ids are private to their session; unknown ids are 404; bad preferences are 422', async ({ playwright, baseURL }) => {
    const a = await playwright.request.newContext({ baseURL });
    const b = await playwright.request.newContext({ baseURL });
    try {
      const n = (await inbox(b)).unreadCount;
      const appId = await applyForCar(a);
      const id = `application_update.${appId}.APPROVED`;
      expect((await inbox(a)).items.some((i) => i.id === id)).toBe(true);
      // Another session neither sees it nor can mark it.
      expect((await inbox(b)).items.some((i) => i.id === id)).toBe(false);
      expect((await b.post(`/api/v1/me/notifications/${encodeURIComponent(id)}/read`)).status()).toBe(404);
      expect((await b.post(`/api/v1/me/notifications/${encodeURIComponent(id)}/dismiss`)).status()).toBe(404);
      expect((await a.post('/api/v1/me/notifications/not-an-id/read')).status()).toBe(404);
      const read = await a.post(`/api/v1/me/notifications/${encodeURIComponent(id)}/read`);
      expect(read.status()).toBe(200);
      expect(((await read.json()).data as Inbox).unreadCount).toBe(n);
      const all = await a.post('/api/v1/me/notifications/read-all');
      expect(((await all.json()).data as Inbox).unreadCount).toBe(0);
      expect((await inbox(b)).unreadCount).toBe(n);

      const off = { push: false, sms: false, whatsapp: false, email: false };
      const mandatory = await a.put('/api/v1/me/notification-preferences', { data: { categories: [{ category: 'overdue', channels: off }] } });
      expect(mandatory.status()).toBe(422);
      expect((await mandatory.json()).error.code).toBe('MANDATORY_CATEGORY');
      expect((await a.put('/api/v1/me/notification-preferences', { data: { quietHours: { start: '25:00' } } })).status()).toBe(422);
      expect((await a.put('/api/v1/me/notification-preferences', { data: '[]' as unknown as object })).status()).toBe(400);
      expect((await a.put('/api/v1/me/notification-preferences', { data: JSON.stringify({ pad: 'x'.repeat(100_000) }), headers: { 'Content-Type': 'application/json' } })).status()).toBe(413);
      // CORS: the preflight of the PUT (and DELETE) routes must allow the method, or a cross-origin client cannot save.
      const preflight = await a.fetch('/api/v1/me/notification-preferences', { method: 'OPTIONS', headers: { Origin: 'http://localhost:9', 'Access-Control-Request-Method': 'PUT' } });
      expect(preflight.headers()['access-control-allow-methods']).toMatch(/\bPUT\b/);
      expect(preflight.headers()['access-control-allow-methods']).toMatch(/\bDELETE\b/);
      const ok = await a.put('/api/v1/me/notification-preferences', { data: { categories: [{ category: 'cards', channels: { whatsapp: true } }] } });
      expect(ok.status()).toBe(200);
      const prefs = (await ok.json()).data as { categories: { category: string; mandatory: boolean; channels: Record<string, boolean> }[] };
      expect(prefs.categories.find((c) => c.category === 'cards')!.channels.whatsapp).toBe(true);
      expect(prefs.categories.find((c) => c.category === 'overdue')!.mandatory).toBe(true);
      const bPrefs = (await (await b.get('/api/v1/me/notification-preferences')).json()).data as typeof prefs;
      expect(bPrefs.categories.find((c) => c.category === 'cards')!.channels.whatsapp).toBe(false);
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });

  test('the unread-count route never starts a session', async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL });
    try {
      const res = await ctx.get('/api/v1/me/notifications/unread-count');
      expect(res.status()).toBe(200);
      expect(res.headers()['set-cookie']).toBeUndefined();
      // A fresh demo customer: the same count a new session starts with.
      const fresh = await inbox(ctx);
      expect((await res.json()).data.unreadCount).toBe(fresh.unreadCount);
    } finally {
      await ctx.dispose();
    }
  });
});
