import { defineConfig } from 'vitest/config';

// Unit tests for the pure helpers in lib/ (Playwright covers pages and the API in e2e/).
export default defineConfig({ test: { include: ['lib/**/*.test.ts'] } });
