/**
 * AES-GCM-256 encryption using a session key.
 *
 * The key is generated once per browser session and stored only in
 * chrome.storage.local — which is in-memory and cleared when the browser
 * closes. It is never written to disk, so encrypted data at rest cannot be
 * read without the live session key.
 *
 * If the browser is restarted, a new key is generated and any previously
 * encrypted data becomes unreadable. The user will need to re-upload their
 * resume to create a new encrypted copy for the new session.
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
      'Session expired — your resume data was encrypted with a previous session key. ' +
      'Please re-upload your resume.'
    );
  }
}
