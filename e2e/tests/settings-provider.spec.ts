import { expect, test } from '../fixtures/extension';
import { openJobPage, openSidebar } from '../helpers/sidebar';

test.describe('AI provider settings', () => {
  test.beforeEach(async ({ extensionWorker }) => {
    await extensionWorker.evaluate(
      () => Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]).then(() => undefined),
    );
  });

  test('Claude preset selects Anthropic and Claude Sonnet 4.6', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);
    await page.getByRole('button', { name: 'Open Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Claude', exact: true }).click();

    await expect(page.getByLabel('Base URL')).toHaveValue('https://api.anthropic.com/v1');
    await expect(page.getByLabel('Model')).toHaveValue('claude-sonnet-4-6');
    await expect(page.getByText('Claude Sonnet 4.6 via Anthropic.')).toBeVisible();
    await page.close();
  });

  test('shows only the six supported direct provider presets', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);
    await page.getByRole('button', { name: 'Open Settings', exact: true }).click();
    for (const provider of ['Claude', 'ChatGPT', 'DeepSeek', 'Qwen', 'Grok', 'Kimi']) {
      await expect(page.getByRole('button', { name: provider, exact: true })).toBeVisible();
    }
    for (const removed of ['OmniRoute (Local/Free)', 'OpenRouter', 'Groq', 'Ollama (local)']) {
      await expect(page.getByRole('button', { name: removed, exact: true })).toHaveCount(0);
    }
    await page.close();
  });

  test('never renders a stored API key into the settings DOM', async ({ extensionContext, extensionWorker }) => {
    await extensionWorker.evaluate(
      () => new Promise<void>(resolve => chrome.storage.local.set({
        apiConfig: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'super-secret-endpoint-key',
          model: 'gpt-4o',
        },
        userSettings: { onboardingCompleted: true },
      }, () => resolve())),
    );

    const page = await openJobPage(extensionContext);
    await openSidebar(page);
    await page.getByRole('button', { name: /Settings/, exact: false }).click();

    const keyInput = page.locator('input[type="password"]');
    await expect(keyInput).toHaveValue('');
    await expect(keyInput).toHaveAttribute('placeholder', 'API key saved — enter a new key to replace it');
    await expect(page.getByText('Saved key is not shown on this page.')).toBeVisible();
    expect(await page.locator('body').textContent()).not.toContain('super-secret-endpoint-key');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const storedKey = await extensionWorker.evaluate(
      () => new Promise<string>(resolve => chrome.storage.local.get('apiConfig', result => (
        resolve(result.apiConfig.apiKey)
      ))),
    );
    expect(storedKey).toBe('super-secret-endpoint-key');
    await expect(keyInput).toHaveValue('');
    await page.close();
  });

  test('can save an API key for the Chrome session only', async ({ extensionContext, extensionWorker }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);
    await page.getByRole('button', { name: 'Open Settings' }).click();
    await page.getByRole('button', { name: 'ChatGPT', exact: true }).click();
    await page.getByLabel('API Key', { exact: true }).fill('session-only-secret');
    await page.getByRole('checkbox', { name: /Remember API key/ }).uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const stored = await extensionWorker.evaluate(() => Promise.all([
      chrome.storage.local.get('apiConfig'),
      chrome.storage.session.get('sessionApiKey'),
    ]));
    expect(stored[0].apiConfig.apiKey).toBe('');
    expect(stored[1].sessionApiKey).toBe('session-only-secret');
    await page.close();
  });

  test('explains provider data sharing and exposes key-free backup controls', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);
    await page.getByRole('button', { name: 'Open Settings' }).click();

    await expect(page.getByText('Manual AI scanning may send up to 5,000 characters')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export backup' })).toBeVisible();
    await expect(page.getByText('API keys are never included.')).toBeVisible();
    await page.close();
  });

  test('downloads and restores a key-free JSON backup through Settings', async ({ extensionContext, extensionWorker }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);
    await page.getByRole('button', { name: 'Open Settings' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^tailorcv-backup-\d{4}-\d{2}-\d{2}\.json$/);

    await extensionWorker.evaluate(() => chrome.storage.local.set({
      apiConfig: { baseUrl: 'https://provider.test/v1', apiKey: 'preserved-key', model: 'old-model' },
    }));
    const backup = {
      format: 'tailorcv-backup', version: 1, exportedAt: '2025-01-01T00:00:00.000Z',
      data: {
        resume: null, optimizedResumes: [], applications: [],
        settings: { defaultTone: 'technical', autoDetectJob: false, showATSScore: true, onboardingCompleted: true, rememberApiKey: true },
        provider: { baseUrl: 'https://provider.test/v1', model: 'restored-model' },
      },
    };
    await page.getByLabel('Choose TailorCV backup file').setInputFiles({
      name: 'tailorcv-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByText('Backup restored. Your existing API key was preserved.')).toBeVisible();
    const config = await extensionWorker.evaluate(() => chrome.storage.local.get('apiConfig'));
    expect(config.apiConfig).toMatchObject({ apiKey: 'preserved-key', model: 'restored-model' });
    await page.close();
  });
});
