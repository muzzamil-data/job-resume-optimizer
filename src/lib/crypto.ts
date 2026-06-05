/**
 * AES-GCM-256 encryption with a session-scoped key.
 *
 * A 256-bit AES-GCM key is generated once per browser session and stored in
 * chrome.storage.session (cleared when the browser closes). The key and the
 * encrypted data therefore never co-exist on disk. If the browser is closed
 * and reopened, a new key is generated and previously encrypted data becomes
 * unreadable — users must re-upload their resume after restarting the browser.
 *
 * Security note: if chrome.storage.session is unavailable (Chrome 102-111
 * content script contexts), the key is kept ONLY in the module-level memory
 * cache and never written to chrome.storage.local. This means encrypted data
 * does not survive page navigation on those builds, but it prevents the key
 * and ciphertext from co-existing on disk where a local attacker could read both.
 */

const SESSION_KEY_NAME = '_resumeEncKey';

// In-memory cache: avoids one chrome.storage IPC + one importKey per encrypt/decrypt call.
// Also serves as the sole key store when chrome.storage.session is unavailable.
let cachedKey: CryptoKey | null = null;

// Resolved once: null means chrome.storage.session is unavailable and we operate
// in memory-only mode (key not persisted — safer than falling back to local storage).
let sessionStore: chrome.storage.StorageArea | null | undefined = undefined;

async function getSessionStore(): Promise<chrome.storage.StorageArea | null> {
  if (sessionStore !== undefined) return sessionStore;
  const candidate = chrome.storage.session ?? null;
  if (!candidate) {
    sessionStore = null;
    return null;
  }
  try {
    await candidate.get(SESSION_KEY_NAME);
    sessionStore = candidate;
  } catch {
    // chrome.storage.session exists but is inaccessible from this context
    // (Chrome 102-111 content scripts). Never fall back to local storage —
    // that would store the raw key alongside the ciphertext on disk.
    sessionStore = null;
  }
  return sessionStore;
}

async function getSessionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const store = await getSessionStore();

  if (store) {
    // Try to load an existing key from session storage
    const stored = await store.get(SESSION_KEY_NAME);
    if (stored[SESSION_KEY_NAME]) {
      const raw = Uint8Array.from(
        atob(stored[SESSION_KEY_NAME]),
        c => c.charCodeAt(0)
      );
      cachedKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
      return cachedKey;
    }
  }

  // Generate a fresh 256-bit AES-GCM key for this browser session
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  if (store) {
    // Persist to session storage so the key survives service worker suspension
    const exported = await crypto.subtle.exportKey('raw', key);
    const encoded = btoa(String.fromCharCode(...new Uint8Array(exported)));
    await store.set({ [SESSION_KEY_NAME]: encoded });
  }
  // If store is null: key lives only in cachedKey (in-memory mode).
  // Data will not survive page reload on this Chrome build, which is acceptable.

  cachedKey = key;
  return cachedKey;
}

/**
 * Encrypt a UTF-8 string. Returns a compact "iv:ciphertext" base64 string.
 */
export async function encryptText(plaintext: string): Promise<string> {
  const key = await getSessionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const ivB64   = btoa(String.fromCharCode(...iv));
  const dataB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  return `${ivB64}:${dataB64}`;
}

/**
 * Decrypt a string produced by encryptText().
 * Throws if the session key has changed (browser was restarted).
 */
export async function decryptText(payload: string): Promise<string> {
  const key = await getSessionKey();
  const colonIdx = payload.indexOf(':');
  const ivB64   = payload.slice(0, colonIdx);
  const dataB64 = payload.slice(colonIdx + 1);
  const iv   = Uint8Array.from(atob(ivB64),   c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error(
      'Your resume data could not be decrypted (extension storage may have been cleared). ' +
      'Please re-upload your resume.'
    );
  }
}
