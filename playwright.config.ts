import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './e2e/tests',
  // Extensions require a single persistent context — no parallelism
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'e2e/report', open: 'never' }], ['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // tsconfig for e2e tests
  use: {
    trace: 'on-first-retry',
  },
});
