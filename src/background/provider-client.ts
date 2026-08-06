import type { ApiConfig } from '../types';

export type ProviderMessage = { role: string; content: string };

export const ACTION_TIMEOUT_MS: Record<string, number> = {
  optimizeResumeWithAI: 90_000,
  generateTextWithAI: 60_000,
  parseResume: 60_000,
  scrapeJobWithAI: 30_000,
};

export const DEFAULT_TIMEOUT_MS = 60_000;

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_\-]{16,}/g,
  /eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
  /Bearer\s+[A-Za-z0-9._\-]{8,}/gi,
];

export function sanitizeErrorMessage(message: string): string {
  let sanitized = String(message ?? '');
  for (const pattern of SECRET_PATTERNS) sanitized = sanitized.replace(pattern, '[redacted]');
  return sanitized.length > 300 ? 'Something went wrong. Please try again.' : sanitized;
}

async function getApiConfig(): Promise<ApiConfig> {
  const result = await chrome.storage.local.get('apiConfig');
  const config = (result?.apiConfig ?? {}) as Partial<ApiConfig>;
  return {
    baseUrl: config.baseUrl || 'https://api.openai.com/v1',
    apiKey: config.apiKey || '',
    model: config.model || '',
  };
}

/** Call the user's configured OpenAI-compatible chat-completions endpoint. */
export async function callProvider(
  system: string | undefined,
  messages: ProviderMessage[],
  maxTokens: number,
  timeoutMs: number,
  attempt = 1,
): Promise<string> {
  const config = await getApiConfig();
  if (!config.apiKey) throw new Error('Add your API key in Settings to start optimizing.');
  if (!config.model) throw new Error('Choose a model in Settings to start optimizing.');

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const fullMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(config.baseUrl);
  const effectiveTimeout = isLocal ? Math.max(timeoutMs, 300_000) : timeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, max_tokens: maxTokens, messages: fullMessages }),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw new Error('Could not reach the AI provider. Check the base URL in Settings and your connection.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const status = response.status;
    if ((status === 429 || status === 503 || status === 529) && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, attempt * 3000));
      return callProvider(system, messages, maxTokens, timeoutMs, attempt + 1);
    }
    const body = await response.json().catch(() => null);
    const providerMessage = body && (body.error?.message || (typeof body.error === 'string' ? body.error : null) || body.message);
    if (status === 401 || status === 403) throw new Error('Your API key was rejected. Check the key in Settings.');
    if (status === 404) throw new Error('Model or endpoint not found. Check the model name and base URL in Settings.');
    if (status === 429) throw new Error('Rate limit or quota reached on your provider. Please wait and try again.');
    throw new Error(typeof providerMessage === 'string' && providerMessage ? providerMessage : `Provider error ${status}`);
  }

  const data = await response.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('Unexpected response from the AI provider. Please try again.');
  return text;
}
