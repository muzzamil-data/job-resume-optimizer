/**
 * AES-GCM-256 encryption with a session-scoped key.
 *
 * A 256-bit AES-GCM key is generated once per browser session and stored in
 * chrome.storage.session (cleared when the browser closes). The key and the
 * encrypted data therefore never co-exist on disk. If the browser is closed
 * and reopened, a new key is generated and previously encrypted data becomes
 * unreadable — users must re-upload their resume after restarting the browser.
 * On Chrome builds that do not support chrome.storage.session, falls back to
 * chrome.storage.local to avoid breaking existing installs.
 */

const SESSION_KEY_NAME = '_resumeEncKey';

// chrome.storage.session is MV3-only and clears when the browser closes,
// so the key never persists to disk alongside the ciphertext it protects.
// Fall back to chrome.storage.local only if session storage is unavailable
// (e.g., older Chrome builds) to avoid breaking existing installs.
const keyStore = chrome.storage.session ?? chrome.storage.local;

// In-memory cache: avoids one chrome.storage IPC + one importKey per encrypt/decrypt call.
let cachedKey: CryptoKey | null = null;

async function getSessionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const stored = await keyStore.get(SESSION_KEY_NAME);

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

  // Generate a fresh 256-bit AES-GCM key for this browser session
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  const encoded = btoa(String.fromCharCode(...new Uint8Array(exported)));
  await keyStore.set({ [SESSION_KEY_NAME]: encoded });

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
