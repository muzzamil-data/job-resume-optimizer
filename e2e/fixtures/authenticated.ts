/**
 * Configured fixture — extends the base extension fixture with a mocked provider
 * endpoint and an injected API config so tests reach the ready-to-use main view.
 *
 * (The fixture key is kept as `authenticatedPage` for backwards compatibility
 * with the existing specs; there is no authentication anymore.)
 */
import { type Page } from '@playwright/test';
import { test as extTest } from './extension';
import {
  mockProviderRoutes,
  injectApiConfig,
  clearExtensionStorage,
} from '../helpers/routes';
import { openJobPage, openSidebar } from '../helpers/sidebar';

type ConfiguredTestFixtures = {
  authenticatedPage: Page;
};

export const test = extTest.extend<ConfiguredTestFixtures>({
  authenticatedPage: async ({ extensionContext, extensionWorker }, use) => {
    // Never hit a real provider
    await mockProviderRoutes(extensionContext);

    // Seed a provider config so the extension is "configured"
    await injectApiConfig(extensionWorker);

    // Open the job page and sidebar
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    // "Current Resume" is present in the main view
    await page
      .locator('text=Current Resume')
      .waitFor({ state: 'visible', timeout: 15_000 });

    await use(page);

    // Reset state for the next test
    await clearExtensionStorage(extensionWorker);
    await page.close();
  },
});

export { expect } from '@playwright/test';
