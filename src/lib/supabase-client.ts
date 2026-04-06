import { createClient } from '@supabase/supabase-js';
import type { User, Session } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your values.');
}

// Custom storage adapter backed by chrome.storage.local.
// Supabase uses this to persist the auth session across extension reloads.
const chromeStorageAdapter = {
  getItem: (key: string): Promise<string | null> =>
    new Promise(resolve =>
      chrome.storage.local.get(key, result => resolve(result[key] ?? null))
    ),
  setItem: (key: string, value: string): Promise<void> =>
    new Promise(resolve =>
      chrome.storage.local.set({ [key]: value }, resolve)
    ),
  removeItem: (key: string): Promise<void> =>
    new Promise(resolve =>
      chrome.storage.local.remove(key, resolve)
    ),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // Disable URL detection — not applicable inside a Chrome extension
    detectSessionInUrl: false,
  },
});

// Keep sb_access_token in sync whenever the session is refreshed or changed.
// The service worker reads this key directly (it cannot import the full Supabase client).
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    chrome.storage.local.set({ sb_access_token: session.access_token });
  } else {
    chrome.storage.local.remove('sb_access_token');
  }
});

// ── Auth helpers ─────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<{
  user: User | null;
  error: string | null;
}> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  // Token sync is handled automatically by the onAuthStateChange listener above.
  return { user: data.user, error: null };
}

export async function signUp(email: string, password: string): Promise<{
  user: User | null;
  error: string | null;
}> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { user: null, error: error.message };
  // Token sync is handled automatically by the onAuthStateChange listener above.
  return { user: data.user, error: null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  await chrome.storage.local.remove('sb_access_token');
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

// ── Credit helpers ────────────────────────────────────────────────────────────

export interface SupabaseCredits {
  total: number;
  used: number;
  remaining: number;
}

export async function fetchCredits(userId: string): Promise<SupabaseCredits | null> {
  const { data, error } = await supabase
    .from('credits')
    .select('total, used, remaining')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Failed to fetch credits');
    return null;
  }
  return data as SupabaseCredits;
}

// ── Error logging ─────────────────────────────────────────────────────────────

/**
 * Log a client-side error to the error_logs table.
 * Requires an active session — silently no-ops if the user is not logged in.
 * Never throws.
 */
export async function logError(
  context: 'content_script' | 'react_boundary',
  action: string | null,
  errorCode: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('error_logs').insert({
      user_id: user.id,
      context,
      action,
      error_code: errorCode,
      message,
      metadata: metadata ?? null,
    });
    if (error) console.error('[logError] insert failed');
  } catch {
    // Never throw from the logger
  }
}

// ── Stripe helpers ────────────────────────────────────────────────────────────

/**
 * Call the stripe-checkout Edge Function to create a Stripe Checkout Session.
 * Returns the hosted checkout URL to open in a new tab.
 */
export async function createCheckoutSession(
  packId: string,
  returnUrl: string,
): Promise<{ url: string | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { url: null, error: 'Not logged in' };

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/stripe-checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ packId, returnUrl }),
    },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { url: null, error: data?.error ?? `Checkout error ${res.status}` };
  }
  return { url: data.url, error: null };
}

export { type User, type Session };
