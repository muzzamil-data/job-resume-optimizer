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

const BILLING_PATTERN = /insufficient|credit|billing|balance|payment|funds|quota exhausted|quota exceeded/i;
const MODEL_PATTERN = /model.*(not found|does not exist|invalid|unsupported|unavailable|access)|unknown model/i;

/** Convert provider-specific HTTP failures into safe, actionable user messages. */
export function classifyProviderHttpError(status: number, providerMessage?: string): Error {
  const detail = typeof providerMessage === 'string' ? providerMessage : '';

  if (status === 401 || (status === 403 && !BILLING_PATTERN.test(detail))) {
    return new Error('Authentication failed. Replace the API key in Settings with an active key from this provider.');
  }
  if (status === 402 || BILLING_PATTERN.test(detail)) {
    return new Error('Insufficient API credits or quota. Add credits or check billing in your provider account.');
  }
  if (status === 404 || MODEL_PATTERN.test(detail)) {
    return new Error('The selected model is unavailable. Check the model name or choose another provider preset.');
  }
  if (status === 429) {
    return new Error('The provider rate limit was reached. Wait a moment, then try again.');
  }
  if (status >= 500) {
    return new Error('The AI provider is temporarily unavailable. Please try again shortly.');
  }
  if (status === 400) {
    return new Error('The provider rejected the request. Check the selected model and provider settings.');
  }
  return new Error(`The AI provider returned an unexpected error (${status}). Please try again.`);
}

async function getApiConfig(): Promise<ApiConfig> {
  const [localResult, sessionResult] = await Promise.all([
    chrome.storage.local.get('apiConfig'),
    chrome.storage.session?.get
      ? chrome.storage.session.get('sessionApiKey')
      : Promise.resolve({}),
  ]);
  const config = (localResult?.apiConfig ?? {}) as Partial<ApiConfig>;
  const sessionKey = (sessionResult as Record<string, unknown>)?.sessionApiKey;
  return {
    baseUrl: config.baseUrl || 'https://api.openai.com/v1',
    apiKey: typeof sessionKey === 'string' && sessionKey ? sessionKey : config.apiKey || '',
    model: config.model || '',
  };
}

function isAnthropicEndpoint(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === 'api.anthropic.com';
  } catch {
    return false;
  }
}

/** Call the configured OpenAI-compatible endpoint or Anthropic Messages API. */
export async function callProvider(
  system: string | undefined,
  messages: ProviderMessage[],
  maxTokens: number,
  timeoutMs: number,
  attempt = 1,
  jsonMode = false,
): Promise<string> {
  const config = await getApiConfig();
  if (!config.apiKey) throw new Error('Add your API key in Settings to start optimizing.');
  if (!config.model) throw new Error('Choose a model in Settings to start optimizing.');

  const anthropic = isAnthropicEndpoint(config.baseUrl);
  const url = `${config.baseUrl.replace(/\/+$/, '')}/${anthropic ? 'messages' : 'chat/completions'}`;
  const fullMessages = system && !anthropic ? [{ role: 'system', content: system }, ...messages] : messages;
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(config.baseUrl);
  const effectiveTimeout = isLocal ? Math.max(timeoutMs, 300_000) : timeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

  let response: Response;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (anthropic) {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }
    const body = anthropic
      ? { model: config.model, max_tokens: maxTokens, messages, ...(system ? { system } : {}) }
      : {
          model: config.model,
          max_tokens: maxTokens,
          messages: fullMessages,
          stream: false,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        };

    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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
    const body = await response.json().catch(() => null);
    const providerMessage = body && (body.error?.message || (typeof body.error === 'string' ? body.error : null) || body.message);
    const classified = classifyProviderHttpError(status, providerMessage);
    const retryable = status === 429 && !BILLING_PATTERN.test(String(providerMessage ?? '')) || status === 503 || status === 529;
    if (retryable && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, attempt * 3000));
      return callProvider(system, messages, maxTokens, timeoutMs, attempt + 1, jsonMode);
    }
    throw classified;
  }

  const data = await response.json().catch(() => null);
  if (anthropic) {
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((block: unknown): block is { type: string; text: string } => (
            typeof block === 'object' && block !== null &&
            (block as { type?: unknown }).type === 'text' &&
            typeof (block as { text?: unknown }).text === 'string'
          ))
          .map((block: { text: string }) => block.text)
          .join('')
      : '';
    if (text) return text;
  } else {
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === 'string') return text;
  }
  throw new Error('The provider returned an unsupported response. Check the model or choose another provider.');
}
