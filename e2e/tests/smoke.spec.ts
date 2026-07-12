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

  test('popup shows "Setup required" when no API key is stored', async ({
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

    await expect(page.locator('#user-status')).toContainText('Setup required');
    await page.close();
  });

  test('popup shows "Ready" when an API key + model are configured', async ({
    extensionContext,
    extensionId,
    extensionWorker,
  }) => {
    await extensionWorker.evaluate(() =>
      new Promise<void>(resolve =>
        chrome.storage.local.set(
          {
            apiConfig: {
              baseUrl: 'https://api.openai.com/v1',
              apiKey: 'sk-test-token',
              model: 'gpt-4o-mini',
            },
          },
          () => resolve(),
        ),
      ),
    );

    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(page.locator('#user-status')).toContainText('Ready');
    await expect(page.locator('#status-detail')).toContainText('your own API key');

    // Cleanup
    await extensionWorker.evaluate(
      () => new Promise<void>(resolve => chrome.storage.local.clear(() => resolve())),
    );
    await page.close();
  });
});
