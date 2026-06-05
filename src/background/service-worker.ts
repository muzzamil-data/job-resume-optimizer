import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Background service worker for Chrome extension
// Proxies all AI calls through the Supabase Edge Function (claude-proxy).
// The Edge Function owns the Anthropic API key — it never touches the client.
//
// System prompts live in the Edge Function (server-side only).
// The service worker sends only prompt IDs (e.g. "__optimize__") — the full
// prompt text is resolved by the Edge Function and never appears in network
// requests or this bundle, so it cannot be read via DevTools.

// pdfjs needs to know where to load its worker. The fake-worker fallback in pdfjs
// also imports this URL inline when Worker is unavailable (e.g. older MV3 contexts).
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const EDGE_FN_URL  = `${SUPABASE_URL}/functions/v1/claude-proxy`;


chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      userSettings: {
        defaultTone: 'professional',
        autoDetectJob: true,
        showATSScore: true,
      },
    });
  }
});

// Strip XML-special characters so user-supplied text cannot escape tag boundaries.
// Escape & first so &lt; in input doesn't become < after entity decode.
function sanitizeUserContent(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Sanitize error messages before sending to the content script.
// Prevents system prompts, API keys, or internal details from leaking to the UI.
const SAFE_ERROR_PATTERNS = [
  'no credits remaining',
  'session expired',
  'not logged in',
  'please sign in',
  'extension was reloaded',
  'checkout error',
  'rate limit',
  'please wait',
  'not configured',
  'optimization failed',
];

// Patterns that indicate internal/sensitive content that must NEVER reach the UI
const BLOCKED_PATTERNS = [
  /sk[-_]ant[-_]/i,             // Anthropic API key prefix
  /sk[-_](live|test)[-_]/i,     // Stripe key prefix
  /eyJ[A-Za-z0-9_-]{10,}/,     // JWT / base64 tokens
  /supabase\.co/i,              // Supabase URLs
  /anthropic\.com/i,            // Anthropic URLs
  /api[_-]?key/i,               // API key references
  /STAGE\s+\d/,                 // System prompt stage markers
  /═/,                          // System prompt formatting
  /service[_-]?role/i,          // Service role references
  /Bearer\s+\S/i,              // Auth tokens
  /function\s*\(/,              // Stack traces
  /at\s+\w+\s*\(/,             // Stack trace frames
  /https?:\/\/[^\s]{20,}/,     // Long URLs (internal endpoints)
];

function sanitizeErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  // Check for blocked patterns first — these ALWAYS get suppressed
  if (BLOCKED_PATTERNS.some(p => p.test(message))) {
    console.error('[service-worker] Blocked sensitive error (length=%d)', message.length);
    return 'Something went wrong. Please try again.';
  }
  // Allow known safe/user-friendly messages through as-is
  if (SAFE_ERROR_PATTERNS.some(p => lower.includes(p))) return message;
  // Short, clean messages are safe to pass through
  if (message.length < 150) return message;
  // Everything else gets suppressed
  console.error('[service-worker] Suppressed long error (length=%d)', message.length);
  return 'Something went wrong. Please try again.';
}

// Retrieve the Supabase access token stored by the auth flow in the content script.
async function getAccessToken(): Promise<string | null> {
  return new Promise(resolve => {
    chrome.storage.local.get('sb_access_token', result => {
      resolve(result.sb_access_token ?? null);
    });
  });
}

// Per-action timeouts (ms). Optimization produces up to 4 096 tokens and can
// take 60-90 s end-to-end through the Edge Function. Scraping is fast (<10 s).
const ACTION_TIMEOUT_MS: Record<string, number> = {
  callClaude:       90_000,   // resume optimization — largest prompt + 4096 tokens
  callClaudeFree:   60_000,   // cover letter — 2000 tokens
  parseResume:      60_000,   // AI resume parse
  scrapeJobWithAI:  30_000,   // page scrape — small prompt + small output
};
const DEFAULT_TIMEOUT_MS = 60_000;

// Proxy a request to the Supabase Edge Function.
// Handles 429/529 retries on the client side as a belt-and-suspenders measure
// (the Edge Function also retries, but network-level timeouts may surface here).
async function callEdgeFunction(
  action: string,
  payload: Record<string, any>,
  attempt = 1
): Promise<any> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('You are not logged in. Please sign in to use the optimizer.');
  }

  const timeoutMs = ACTION_TIMEOUT_MS[action] ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      // deductCredit is intentionally NOT sent — credit cost is enforced
      // server-side by the Edge Function's CREDIT_COST map.
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const status = response.status;
    const err = await response.json().catch(() => ({}));

    if ((status === 429 || status === 529) && attempt < 3) {
      const delay = attempt * 3000;
      await new Promise(r => setTimeout(r, delay));
      return callEdgeFunction(action, payload, attempt + 1);
    }

    if (status === 402) {
      throw new Error(err?.error || 'No credits remaining. Please purchase more credits.');
    }
    if (status === 401) {
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(err?.error || `Edge Function error ${status}`);
  }

  return response.json();
}

// Extract PII from raw text locally — Claude (via Edge Function) receives no PII
function extractLocalPII(rawText: string): {
  name: string; email: string; phone: string; redacted: string;
} {
  const emailMatch = rawText.match(/[\w.+\-]+@[\w\-]+\.[\w.]+/);
  const email = emailMatch ? emailMatch[0] : '';

  const phoneMatch = rawText.match(
    /(\+?(\d[\s.-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]\d{4}))|(\+\d{1,3}[\s\-]\d{2,4}[\s\-]\d{3,4}[\s\-]\d{3,4})/
  );
  const phone = phoneMatch ? phoneMatch[0] : '';

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const nameLine = lines.find(
    l =>
      !l.includes('@') &&
      !/^\+?[\d\s\-().]{7,}$/.test(l) &&
      !/^https?:/.test(l) &&
      l.length < 60 &&
      /^[A-Z]/.test(l)
  );
  const name = nameLine || '';

  let redacted = rawText;
  if (email) redacted = redacted.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[EMAIL]');
  if (phone) redacted = redacted.replace(new RegExp(phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[PHONE]');
  if (name)  redacted = redacted.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[CANDIDATE]');

  redacted = redacted.replace(/[\w.+\-]+@[\w\-]+\.[\w.]+/g, '[EMAIL]');
  redacted = redacted.replace(/(\+?(\d[\s.-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]\d{4}))/g, '[PHONE]');
  redacted = redacted.replace(/\+\d{1,3}[\s\-]\d{2,4}[\s\-]\d{3,4}[\s\-]\d{3,4}/g, '[PHONE]');

  return { name, email, phone, redacted };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid payload: "${field}" must be a non-empty string`);
  }
  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid payload: "${field}" must be a non-empty array`);
  }
  return value;
}

const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 12_000;

function validateMessages(value: unknown): Array<{ role: string; content: string }> {
  const arr = requireArray(value, 'messages') as any[];
  if (arr.length > MAX_MESSAGES) {
    throw new Error('Invalid payload: too many messages');
  }
  for (const msg of arr) {
    if (!msg || !['user', 'assistant'].includes(msg.role)) {
      throw new Error('Invalid payload: invalid message role');
    }
    if (typeof msg.content !== 'string' || msg.content.length > MAX_MESSAGE_CHARS) {
      throw new Error('Invalid payload: message content too large');
    }
  }
  return arr;
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only accept messages from this extension's own scripts
  if (sender.id !== chrome.runtime.id) return;

  if (request.action === 'scrapeJobWithAI') {
    try {
      const pageText = requireString(request.payload?.pageText, 'pageText');
      const sanitized = sanitizeUserContent(pageText.slice(0, 5000));
      const wrapped = `<page_content>\n${sanitized}\n</page_content>`;
      callEdgeFunction('scrapeJobWithAI', { pageText: wrapped })
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    } catch (err: any) {
      sendResponse({ success: false, error: sanitizeErrorMessage(err.message) });
      return true;
    }
    return true;
  }

  if (request.action === 'parseResume') {
    try {
      const rawText = requireString(request.payload?.rawText, 'rawText');
      const localPII = extractLocalPII(rawText);
      const sanitizedResume = sanitizeUserContent(localPII.redacted);
      const wrappedResume = `<resume_content>\n${sanitizedResume}\n</resume_content>`;
      callEdgeFunction('parseResume', { rawText: wrappedResume })
        .then(data => {
          // Restore PII from local extraction — overwrite anything the AI may have guessed
          if (localPII.name)  data.name  = localPII.name;
          if (localPII.email) data.email = localPII.email;
          if (localPII.phone) data.phone = localPII.phone;
          sendResponse({ success: true, data });
        })
        .catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    } catch (err: any) {
      sendResponse({ success: false, error: sanitizeErrorMessage(err.message) });
      return true;
    }
    return true;
  }

  if (request.action === 'parseFile') {
    try {
      const { buffer, fileType } = request.payload ?? {};
      if (!buffer || !fileType) {
        sendResponse({ success: false, error: 'Missing buffer or fileType' });
        return true;
      }
      (async () => {
        let rawText: string;
        if (fileType === 'docx') {
          const result = await mammoth.extractRawText({ arrayBuffer: buffer as ArrayBuffer });
          rawText = result.value;
        } else {
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer as ArrayBuffer) }).promise;
          const pages: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            let lastY: number | null = null;
            const lineChunks: string[] = [];
            for (const item of content.items as Array<{ str: string; transform: number[] }>) {
              if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
                lineChunks.push('\n');
              }
              lineChunks.push(item.str);
              lastY = item.transform[5];
            }
            pages.push(lineChunks.join(''));
          }
          rawText = pages.join('\n');
        }
        sendResponse({ success: true, rawText });
      })().catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    } catch (err: any) {
      sendResponse({ success: false, error: sanitizeErrorMessage(err.message) });
    }
    return true;
  }

  if (request.action === 'callClaude') {
    try {
      const messages = validateMessages(request.payload?.messages);
      const { maxTokens, model, system } = request.payload ?? {};
      // system is a prompt ID (e.g. "__optimize__") — the Edge Function resolves
      // it to the actual text server-side, so the prompt never appears on the wire.
      // Credit deduction is enforced server-side by the Edge Function's CREDIT_COST
      // map — callClaude always costs 1 credit regardless of what the client sends.
      callEdgeFunction('callClaude', { messages, maxTokens, model, system })
        .then(result => sendResponse({ success: true, data: result }))
        .catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    } catch (err: any) {
      sendResponse({ success: false, error: sanitizeErrorMessage(err.message) });
      return true;
    }
    return true;
  }

  if (request.action === 'callClaudeFree') {
    try {
      const messages = validateMessages(request.payload?.messages);
      const { maxTokens, model, system } = request.payload ?? {};
      // callClaudeFree is a distinct action — Edge Function maps it to 0 credits.
      callEdgeFunction('callClaudeFree', { messages, maxTokens, model, system })
        .then(result => sendResponse({ success: true, data: result }))
        .catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    } catch (err: any) {
      sendResponse({ success: false, error: sanitizeErrorMessage(err.message) });
      return true;
    }
    return true;
  }
});

export {};
