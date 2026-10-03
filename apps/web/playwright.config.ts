import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}`,
    // Use a preinstalled Chromium when provided (e.g. CI images); otherwise Playwright's own.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-web', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    port,
    reuseExistingServer: true,
  },
});
