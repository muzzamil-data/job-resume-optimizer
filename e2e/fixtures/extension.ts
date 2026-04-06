/**
 * Core Playwright fixture — launches a persistent Chrome context with the
 * built extension loaded once per worker (shared across all tests in the run).
 *
 * Fixtures are named with an "extension" prefix to avoid colliding with
 * Playwright's built-in `context`, `page`, and `browser` test fixtures.
 */
import {
  test as base,
  chromium,
  type BrowserContext,
  type Worker,
} from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const DIST_PATH = path.resolve(process.cwd(), 'dist');

/**
 * Worker-scoped fixtures (second type param) are created once per worker
 * process and reused across all tests — important for extension tests
 * because launching a new Chrome with an extension takes ~3 s each time.
 */
type WorkerFixtures = {
  /** Persistent BrowserContext with the extension loaded. */
  extensionContext: BrowserContext;
  /** The Chrome extension ID (derived from the service-worker URL). */
  extensionId: string;
  /** The extension's background service worker. */
  extensionWorker: Worker;
};

export const test = base.extend<{}, WorkerFixtures>({
  extensionContext: [
    async ({}, use) => {
      if (!fs.existsSync(DIST_PATH)) {
        throw new Error(
          `Extension dist not found at ${DIST_PATH}. Run "npm run build" first.`,
        );
      }
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
      const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          `--disable-extensions-except=${DIST_PATH}`,
          `--load-extension=${DIST_PATH}`,
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      await use(context);
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],

  extensionWorker: [
    async ({ extensionContext }, use) => {
      let [sw] = extensionContext.serviceWorkers();
      if (!sw) sw = await extensionContext.waitForEvent('serviceworker');
      await use(sw);
    },
    { scope: 'worker' },
  ],

  extensionId: [
    async ({ extensionWorker }, use) => {
      // Service worker URL: chrome-extension://{id}/src/background/service-worker.js
      const id = extensionWorker.url().split('/')[2];
      await use(id);
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
