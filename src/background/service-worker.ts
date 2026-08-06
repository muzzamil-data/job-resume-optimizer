import mammoth from 'mammoth';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — legacy build has no public type declarations but is required for
// MV3 service workers: (1) it does not call new Worker() or dynamic import(),
// (2) it tolerates a wider range of real-world PDF XRef formats.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { extractAndParseJSON } from '../lib/extract-json';
import { sanitizeUserContent } from '../lib/utils';
import type { BackgroundRequest } from '../types/runtime-messages';
import {
  ACTION_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  callProvider,
  sanitizeErrorMessage,
} from './provider-client';
import {
  SYSTEM_PROMPTS,
  buildJobScrapePrompt,
  buildResumeParsePrompt,
} from './prompts';

// Background service worker for the extension.
//
// This is a fully local, bring-your-own-key tool: there is no backend. The
// worker reads the user's provider configuration (base URL + API key + model)
// from chrome.storage.local and calls the OpenAI-compatible /chat/completions
// endpoint directly. The key is sent only to the endpoint the user chose.

// MV3 service workers are themselves workers — neither new Worker() nor dynamic
// import() is available inside them. pdfjs checks globalThis.pdfjsWorker first;
// when it finds the WorkerMessageHandler already loaded it skips both paths and
// uses its LoopbackPort fake-worker, which runs in the service-worker thread.
(globalThis as Record<string, unknown>).pdfjsWorker = { WorkerMessageHandler };
pdfjsLib.GlobalWorkerOptions.workerSrc = 'unused';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      userSettings: {
        defaultTone: 'professional',
        autoDetectJob: true,
        showATSScore: true,
      },
      apiConfig: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: '',
      },
    });
  }
});

// Redact anything that looks like a secret before an error reaches the UI, and
// cap length. The provider's own error text is otherwise passed through so the
// user can debug their key/model/base URL.
// ── Provider transport (OpenAI-compatible chat completions) ─────────────────────

// Per-action timeouts (ms).
// Call the user's configured OpenAI-compatible endpoint and return the assistant
// text. Retries 429/503/529 up to 3 attempts. Never leaks the key.
// Extract PII from raw text locally — the provider receives no PII
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
const MAX_OUTPUT_TOKENS = 8192;

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

function clampTokens(value: unknown, fallback: number): number {
  return Math.min(Number(value) || fallback, MAX_OUTPUT_TOKENS);
}

// Message handler
chrome.runtime.onMessage.addListener((request: BackgroundRequest, sender, sendResponse) => {
  // Only accept messages from this extension's own scripts
  if (sender.id !== chrome.runtime.id) return;

  if (request.action === 'scrapeJobWithAI') {
    try {
      const pageText = requireString(request.payload?.pageText, 'pageText');
      const sanitized = sanitizeUserContent(pageText.slice(0, 5000));
      const prompt = buildJobScrapePrompt(sanitized);
      callProvider(undefined, [{ role: 'user', content: prompt }], 1500, ACTION_TIMEOUT_MS.scrapeJobWithAI)
        .then(text => sendResponse({ success: true, data: extractAndParseJSON(text) }))
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
      const prompt = buildResumeParsePrompt(sanitizedResume);
      callProvider(undefined, [{ role: 'user', content: prompt }], 8192, ACTION_TIMEOUT_MS.parseResume)
        .then(text => {
          const data = extractAndParseJSON(text);
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
        // buffer arrives as a base64 string — chrome.runtime.sendMessage uses JSON
        // serialization which drops ArrayBuffer. Decode it back to bytes here.
        if (typeof buffer !== 'string') {
          throw new Error('Invalid buffer format');
        }
        const binaryStr = atob(buffer);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const ab = bytes.buffer;

        let rawText: string;
        if (fileType === 'docx') {
          let result: { value: string };
          try {
            result = await mammoth.extractRawText({ arrayBuffer: ab });
          } catch {
            throw new Error('Could not read the DOCX file. Try re-saving it in Word and uploading again.');
          }
          rawText = result.value;
        } else {
          const loadingTask = pdfjsLib.getDocument({ data: bytes });
          let pdf: Awaited<typeof loadingTask.promise>;
          try {
            pdf = await loadingTask.promise;
          } catch (err: unknown) {
            console.error('[parseFile] pdfjs error:', err instanceof Error ? err.message : err);
            await loadingTask.destroy();
            throw new Error('Could not read the PDF file. Try converting it to DOCX and uploading that instead.');
          }
          const pages: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            let lastY: number | null = null;
            const lineChunks: string[] = [];
            for (const item of content.items as Array<{ str: string; transform: number[] }>) {
              if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
                lineChunks.push('\n');
              } else if (lineChunks.length > 0 && item.str.length > 0) {
                const prev = lineChunks[lineChunks.length - 1];
                if (!prev.endsWith(' ') && !item.str.startsWith(' ')) {
                  lineChunks.push(' ');
                }
              }
              lineChunks.push(item.str);
              lastY = item.transform[5];
            }
            pages.push(lineChunks.join(''));
          }
          rawText = pages.join('\n');
          await pdf.destroy();
        }
        sendResponse({ success: true, rawText });
      })().catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    } catch (err: any) {
      sendResponse({ success: false, error: sanitizeErrorMessage(err.message) });
    }
    return true;
  }

  if (request.action === 'optimizeResumeWithAI' || request.action === 'generateTextWithAI') {
    try {
      const messages = validateMessages(request.payload?.messages);
      const { maxTokens, system: systemId } = request.payload ?? {};

      // Optimization may reference a named system prompt (e.g. "__optimize__").
      // General text generation carries the full prompt in the user message.
      let system: string | undefined;
      if (systemId !== undefined && systemId !== null) {
        system = SYSTEM_PROMPTS[systemId as string];
        if (!system) {
          throw new Error('Invalid payload: unknown system prompt');
        }
      }

      const fallbackTokens = request.action === 'optimizeResumeWithAI' ? 4096 : 2000;
      const timeoutMs = ACTION_TIMEOUT_MS[request.action] ?? DEFAULT_TIMEOUT_MS;
      callProvider(system, messages, clampTokens(maxTokens, fallbackTokens), timeoutMs)
        .then(text => sendResponse({ success: true, data: { text } }))
        .catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    } catch (err: any) {
      sendResponse({ success: false, error: sanitizeErrorMessage(err.message) });
      return true;
    }
    return true;
  }
});

export {};
