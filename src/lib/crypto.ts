/**
 * AES-GCM-256 encryption with a device-persistent key.
 *
 * A 256-bit AES-GCM key is generated once and stored in chrome.storage.local,
 * so it survives browser restarts. Encrypted data (resume, optimized resumes,
 * cover letters, application history) therefore persists across restarts until
 * the user uploads a new resume or clears their data.
 *
 * Security note: because the key lives in chrome.storage.local alongside the
 * ciphertext, this is obfuscation-at-rest rather than strong encryption — anyone
 * with read access to the extension's local storage on the machine could decrypt
 * it. That tradeoff is deliberate: the data is the user's own resume on their own
 * device, it never leaves the device, and persistence-across-restart was the
 * product requirement. Users can wipe everything via Settings → Clear data.
 *
 * If chrome.storage.local is somehow unavailable, the key falls back to the
 * module-level memory cache only (data won't persist), which is harmless.
 */

const ENC_KEY_NAME = '_resumeEncKey';

// In-memory cache: avoids one chrome.storage IPC + one importKey per encrypt/decrypt call.
// Also serves as the sole key store if chrome.storage.local is unavailable.
let cachedKey: CryptoKey | null = null;

// Resolved once: null means chrome.storage.local is unavailable and we operate
// in memory-only mode (key not persisted for this run).
let keyStore: chrome.storage.StorageArea | null | undefined = undefined;

async function getKeyStore(): Promise<chrome.storage.StorageArea | null> {
  if (keyStore !== undefined) return keyStore;
  const candidate = chrome.storage.local ?? null;
  if (!candidate) {
    keyStore = null;
    return null;
  }
  try {
    await candidate.get(ENC_KEY_NAME);
    keyStore = candidate;
  } catch {
    // chrome.storage.local exists but is inaccessible from this context.
    keyStore = null;
  }
  return keyStore;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const store = await getKeyStore();

  if (store) {
    // Try to load the existing persistent key
    const stored = await store.get(ENC_KEY_NAME);
    if (stored[ENC_KEY_NAME]) {
      const raw = Uint8Array.from(
        atob(stored[ENC_KEY_NAME]),
        c => c.charCodeAt(0)
      );
      cachedKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
      return cachedKey;
    }
  }

  // No key yet — generate a fresh 256-bit AES-GCM key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  if (store) {
    // Persist to local storage so the key (and thus the data) survives restarts
    const exported = await crypto.subtle.exportKey('raw', key);
    const encoded = btoa(String.fromCharCode(...new Uint8Array(exported)));
    await store.set({ [ENC_KEY_NAME]: encoded });
  }
  // If store is null: key lives only in cachedKey (in-memory mode) for this run.

  cachedKey = key;
  return cachedKey;
}

/**
 * Encrypt a UTF-8 string. Returns a compact "iv:ciphertext" base64 string.
 */
export async function encryptText(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
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
 * Throws only if the stored ciphertext is corrupt or was written with a
 * different key (e.g. a one-time miss right after migrating from the old
 * session-scoped key). Callers treat a throw as "data unreadable, drop it".
 */
export async function decryptText(payload: string): Promise<string> {
  const key = await getEncryptionKey();
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
