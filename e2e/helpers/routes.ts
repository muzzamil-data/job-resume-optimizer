/**
 * Provider-route mocks and chrome.storage config injection.
 *
 * Used by the fixture to put the extension in a configured (ready-to-optimize)
 * state without hitting a real AI provider.
 */
import { type BrowserContext, type Worker } from '@playwright/test';

// ── Mock data ─────────────────────────────────────────────────────────────────

export const MOCK_API_CONFIG = {
  baseUrl: 'https://mock-provider.test/v1',
  apiKey: 'sk-test-playwright',
  model: 'mock-model',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Intercept the OpenAI-compatible chat completions endpoint so tests never make
 * a real network request. Returns a minimal, valid response envelope.
 */
export async function mockProviderRoutes(context: BrowserContext): Promise<void> {
  await context.route('**/chat/completions', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          { message: { role: 'assistant', content: '{"isJobPosting": false}' } },
        ],
      }),
    });
  });
}

/**
 * Inject a provider configuration into chrome.storage.local via the service
 * worker so the extension considers itself configured.
 */
export async function injectApiConfig(sw: Worker): Promise<void> {
  await sw.evaluate(
    (config) =>
      new Promise<void>(resolve =>
        chrome.storage.local.set({
          apiConfig: config,
          userSettings: {
            defaultTone: 'professional',
            autoDetectJob: true,
            showATSScore: true,
            onboardingCompleted: true,
          },
        }, () => resolve()),
      ),
    MOCK_API_CONFIG,
  );
}

/** Clear all extension storage keys (call in afterEach to reset state). */
export async function clearExtensionStorage(sw: Worker): Promise<void> {
  await sw.evaluate(
    () => Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]).then(() => undefined),
  );
}
