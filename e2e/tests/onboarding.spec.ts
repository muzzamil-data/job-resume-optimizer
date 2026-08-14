import { expect, test } from '../fixtures/extension';
import { openJobPage, openSidebar } from '../helpers/sidebar';

test.describe('first-run onboarding', () => {
  test.beforeEach(async ({ extensionWorker }) => {
    await extensionWorker.evaluate(
      () => Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]).then(() => undefined),
    );
  });

  test('starts with provider setup on a new installation', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    await expect(page.getByText('Step 1 of 2')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connect your AI provider' })).toBeVisible();
    await page.getByRole('button', { name: 'Open Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.close();
  });

  test('configured users are guided to resume upload', async ({ extensionContext, extensionWorker }) => {
    await extensionWorker.evaluate(() => new Promise<void>(resolve => chrome.storage.local.set({
      apiConfig: { baseUrl: 'https://api.openai.com/v1', apiKey: 'test-key', model: 'gpt-4o' },
    }, () => resolve())));
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    await expect(page.getByText('Step 2 of 2')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add your resume' })).toBeVisible();
    await page.getByRole('button', { name: 'Upload Resume' }).click();
    await expect(page.getByRole('heading', { name: 'Upload Resume' })).toBeVisible();
    await page.close();
  });

  test('resume onboarding can be skipped without hiding the normal upload control', async ({ extensionContext, extensionWorker }) => {
    await extensionWorker.evaluate(() => new Promise<void>(resolve => chrome.storage.local.set({
      apiConfig: { baseUrl: 'https://api.openai.com/v1', apiKey: 'test-key', model: 'gpt-4o' },
    }, () => resolve())));
    const page = await openJobPage(extensionContext);
    await openSidebar(page);

    await page.getByRole('button', { name: 'Do this later' }).click();
    await expect(page.getByText('Current Resume')).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload Resume/i })).toBeVisible();
    const completed = await extensionWorker.evaluate(() => new Promise<boolean>(resolve => (
      chrome.storage.local.get('userSettings', result => resolve(result.userSettings.onboardingCompleted))
    )));
    expect(completed).toBe(true);
    await page.close();
  });
});
