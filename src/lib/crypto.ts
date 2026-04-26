/**
 * AES-GCM-256 encryption with a device-bound key.
 *
 * A 256-bit AES-GCM key is generated once and persisted in
 * chrome.storage.local (on-disk, scoped to this extension). Both the key and
 * the encrypted data live in extension storage, so resume content is never
 * stored in plaintext. The key survives browser restarts within the same
 * Chrome profile; if extension storage is cleared, all encrypted data becomes
 * unreadable and the user must re-upload their resume.
 */

const SESSION_KEY_NAME = '_resumeEncKey';

async function getSessionKey(): Promise<CryptoKey> {
  // Restore key from session storage if it exists (survives service worker
  // restarts within the same browser session)
  const stored = await chrome.storage.local.get(SESSION_KEY_NAME);

  if (stored[SESSION_KEY_NAME]) {
    const raw = Uint8Array.from(
      atob(stored[SESSION_KEY_NAME]),
      c => c.charCodeAt(0)
    );
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
  }

  // Generate a fresh 256-bit AES-GCM key for this browser session
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  // Export and persist to session storage so service worker restarts don't
  // invalidate already-encrypted data within the same session
  const exported = await crypto.subtle.exportKey('raw', key);
  const encoded = btoa(String.fromCharCode(...new Uint8Array(exported)));
  await chrome.storage.local.set({ [SESSION_KEY_NAME]: encoded });

  return key;
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
