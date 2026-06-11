/**
 * Sidebar open / close / structure tests.
 *
 * These run in the unauthenticated state (no session) so they don't require a
 * Supabase project.  The sidebar will open to the auth view, which is enough
 * to verify the shell structure and open/close behaviour.
 */
import { test, expect } from '../fixtures/extension';
import { openJobPage, openSidebar } from '../helpers/sidebar';

test.describe('Sidebar shell', () => {
  test.beforeEach(async ({ extensionWorker }) => {
    await extensionWorker.evaluate(
      () => new Promise<void>(resolve => chrome.storage.local.clear(() => resolve())),
    );
  });

  test('job-page indicator appears on a job-related URL', async ({
    extensionContext,
  }) => {
    const page = await openJobPage(extensionContext);
    await expect(page.locator('#tailorcv-indicator')).toBeVisible();
    await page.close();
  });

  test('clicking the indicator opens the sidebar', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    const host = page.locator('#tailorcv-root');
    await expect(host).toBeVisible();
    await expect(host).not.toHaveCSS('width', '0px');
    await page.close();
  });

  test('sidebar header shows the app name', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    await expect(
      page.locator('h2').filter({ hasText: 'TailorCV' }),
    ).toBeVisible();
    await page.close();
  });

  test('close button is labelled and collapses the sidebar', async ({
    extensionContext,
  }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    await page.locator('button[aria-label="Close sidebar"]').click();
    await expect(page.locator('#tailorcv-root')).toHaveCSS('width', '0px');
    await page.close();
  });

  test('footer shows "System Ready" status with correct role', async ({
    extensionContext,
  }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    await expect(
      page.locator('[role="status"]').filter({ hasText: 'System Ready' }),
    ).toBeVisible();
    await page.close();
  });

  test('indicator does NOT appear on non-job pages', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.route('https://example.com/', route =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<html><body><h1>Not a job page</h1></body></html>',
      }),
    );
    await page.goto('https://example.com/', { waitUntil: 'domcontentloaded' });

    // Wait long enough to be sure the content script has run
    await page.waitForTimeout(2000);
    await expect(page.locator('#tailorcv-indicator')).toBeHidden();
    await page.close();
  });

  test('sidebar can be reopened after closing', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    await page.locator('button[aria-label="Close sidebar"]').click();
    await expect(page.locator('#tailorcv-root')).toHaveCSS('width', '0px');

    // Reload and open again via the indicator
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openSidebar(page);
    await expect(
      page.locator('h2').filter({ hasText: 'TailorCV' }),
    ).toBeVisible();
    await page.close();
  });
});
