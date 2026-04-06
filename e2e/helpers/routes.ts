/**
 * Supabase network-route mocks and chrome.storage session injection.
 *
 * Used by the "authenticated" fixture to put the extension in a logged-in
 * state without a real Supabase backend.
 */
import fs from 'fs';
import path from 'path';
import { type BrowserContext, type Worker } from '@playwright/test';

// ── Mock data ─────────────────────────────────────────────────────────────────

export const MOCK_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'test@example.com',
  role: 'authenticated',
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
};

export const MOCK_SESSION = {
  access_token: 'mock-access-token-for-playwright-tests',
  token_type: 'bearer',
  expires_in: 3600,
  // Expire one hour from now so the client won't attempt a token refresh
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: MOCK_USER,
};

export const MOCK_CREDITS = { total: 100, used: 5, remaining: 95 };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Read VITE_SUPABASE_URL from env var or .env.local; returns null if absent. */
export function readSupabaseUrl(): string | null {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  const envFile = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envFile)) return null;
  const line = fs
    .readFileSync(envFile, 'utf-8')
    .split('\n')
    .find(l => l.startsWith('VITE_SUPABASE_URL='));
  if (!line) return null;
  return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

/**
 * Intercept all Supabase API calls (auth + REST + Edge Functions) so tests
 * run without a live backend.
 */
export async function mockSupabaseRoutes(context: BrowserContext): Promise<void> {
  // Auth endpoints (/auth/v1/*)
  await context.route('**/auth/v1/**', async route => {
    const url = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.includes('/user') ? MOCK_USER : MOCK_SESSION),
    });
  });

  // PostgREST endpoints (/rest/v1/*)
  await context.route('**/rest/v1/**', async route => {
    const url = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.includes('credits') ? MOCK_CREDITS : []),
    });
  });

  // Edge Functions (/functions/v1/*)
  await context.route('**/functions/v1/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

/**
 * Inject a fake Supabase auth session into chrome.storage.local via the
 * service worker so the extension considers the user logged in.
 *
 * The Supabase JS client (v2) stores auth under:
 *   sb-{projectRef}-auth-token
 * where projectRef is the first subdomain of the Supabase project URL.
 */
export async function injectAuthSession(
  sw: Worker,
  supabaseUrl: string,
): Promise<void> {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionJson = JSON.stringify(MOCK_SESSION);
  const { access_token } = MOCK_SESSION;

  // The callback runs inside the service worker — chrome.* is available there.
  await sw.evaluate(
    (args: string[]) => {
      const [key, value, token] = args;
      return new Promise<void>(resolve =>
        chrome.storage.local.set({ [key]: value, sb_access_token: token }, () =>
          resolve(),
        ),
      );
    },
    [storageKey, sessionJson, access_token],
  );
}

/** Clear all extension storage keys (call in afterEach to reset state). */
export async function clearExtensionStorage(sw: Worker): Promise<void> {
  await sw.evaluate(
    () => new Promise<void>(resolve => chrome.storage.local.clear(() => resolve())),
  );
}
