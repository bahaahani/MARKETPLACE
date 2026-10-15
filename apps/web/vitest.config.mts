import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the pure helpers in lib/ (Playwright covers pages and the API in e2e/). The `@` alias is tsconfig's,
// so tests can import the route handlers (lib/body-limits.test.ts).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { include: ['lib/**/*.test.ts'] },
});
