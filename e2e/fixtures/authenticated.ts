/**
 * Authenticated fixture — extends the base extension fixture with mocked
 * Supabase routes and a fake session injected into chrome.storage so tests
 * reach the logged-in main view without a real backend.
 */
import { type Page } from '@playwright/test';
import { test as extTest } from './extension';
import {
  mockSupabaseRoutes,
  injectAuthSession,
  clearExtensionStorage,
  readSupabaseUrl,
} from '../helpers/routes';
import { openJobPage, openSidebar } from '../helpers/sidebar';

type AuthTestFixtures = {
  authenticatedPage: Page;
};

export const test = extTest.extend<AuthTestFixtures>({
  authenticatedPage: async ({ extensionContext, extensionWorker }, use) => {
    const supabaseUrl = readSupabaseUrl();
    if (!supabaseUrl) {
      console.warn(
        '[authenticated fixture] VITE_SUPABASE_URL not set — skipping. ' +
          'Add it to .env.local or set the environment variable.',
      );
      const dummy = await extensionContext.newPage();
      await use(dummy);
      await dummy.close();
      return;
    }

    // Mock Supabase network calls before any page opens
    await mockSupabaseRoutes(extensionContext);

    // Inject a fake session so loadData() finds an active user
    await injectAuthSession(extensionWorker, supabaseUrl);

    // Open the job page and sidebar
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    // "Premium Balance" is only present in the main (logged-in) view
    await page
      .locator('text=Premium Balance')
      .waitFor({ state: 'visible', timeout: 15_000 });

    await use(page);

    // Reset state for the next test
    await clearExtensionStorage(extensionWorker);
    await page.close();
  },
});

export { expect } from '@playwright/test';
