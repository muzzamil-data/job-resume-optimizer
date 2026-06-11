/**
 * Smoke tests — verify the extension loads and the popup renders correctly.
 * These tests require no auth and no job page.
 */
import { test, expect } from '../fixtures/extension';

test.describe('Extension smoke tests', () => {
  test('service worker is registered', ({ extensionWorker }) => {
    expect(extensionWorker.url()).toMatch(
      /chrome-extension:\/\/[a-z]+\/src\/background\/service-worker\.js$/,
    );
  });

  test('popup renders title and primary button', async ({
    extensionContext,
    extensionId,
  }) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(page.locator('h1')).toContainText('TailorCV');
    await expect(page.locator('#open-sidebar')).toBeVisible();
    await page.close();
  });

  test('popup shows "Not signed in" when no session is stored', async ({
    extensionContext,
    extensionId,
    extensionWorker,
  }) => {
    // Ensure storage is clean
    await extensionWorker.evaluate(
      () => new Promise<void>(resolve => chrome.storage.local.clear(() => resolve())),
    );

    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(page.locator('#user-status')).toContainText('Not signed in');
    await expect(page.locator('#view-credits')).toBeHidden();
    await page.close();
  });

  test('popup shows credit balance when session is present', async ({
    extensionContext,
    extensionId,
    extensionWorker,
  }) => {
    await extensionWorker.evaluate(() =>
      new Promise<void>(resolve =>
        chrome.storage.local.set(
          {
            sb_access_token: 'fake-token',
            creditBalance: { total: 100, used: 10, remaining: 90 },
          },
          () => resolve(),
        ),
      ),
    );

    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(page.locator('#user-status')).toContainText('Signed in');
    await expect(page.locator('#credits-text')).toContainText('90 credits remaining');

    // Cleanup
    await extensionWorker.evaluate(
      () => new Promise<void>(resolve => chrome.storage.local.clear(() => resolve())),
    );
    await page.close();
  });
});
