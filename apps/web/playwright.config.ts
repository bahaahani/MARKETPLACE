import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 3100);
// A second server, only for e2e/hardening.spec.ts: tiny rate limits, and SAHEL_TRUST_PROXY=1 so each test can pick its
// own client address with X-Forwarded-For (the header is ignored by any server started without that variable).
const limitedPort = port + 1;

/**
 * Rate limits for the main test server: the suites make hundreds of requests from one address, so every default limit
 * is multiplied by 1000. The real defaults are covered by unit tests (lib/rate-limit.test.ts).
 */
const MAIN_RATE_LIMITS = JSON.stringify({ scale: 1000 });

/** Tiny limits for the hardening server (name → limit per window). Keep in step with e2e/hardening.spec.ts. */
const LIMITED_RATE_LIMITS = JSON.stringify({
  scale: 1000,
  'session-create:ip': { limit: 5, windowSec: 60 },
  'assistant:ip': { limit: 3, windowSec: 60 },
  'payments:ip': { limit: 2, windowSec: 60 },
  'ekey:ip': { limit: 2, windowSec: 60 },
  'staff-role:ip': { limit: 2, windowSec: 60 },
  'poll:ip': { limit: 3, windowSec: 60 },
});

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // CI uploads playwright-report/ and test-results/ as artifacts when a run fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    // Use a preinstalled Chromium when provided (e.g. CI images); otherwise Playwright's own.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-web', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `npx next start -p ${port}`,
      port,
      reuseExistingServer: true,
      env: { ...(process.env as Record<string, string>), SAHEL_RATE_LIMITS: MAIN_RATE_LIMITS },
    },
    {
      command: `npx next start -p ${limitedPort}`,
      port: limitedPort,
      reuseExistingServer: true,
      env: { ...(process.env as Record<string, string>), SAHEL_RATE_LIMITS: LIMITED_RATE_LIMITS, SAHEL_TRUST_PROXY: '1' },
    },
  ],
});
