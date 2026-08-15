import { expect, test } from '@playwright/test';
import {
  calculateATSScoreWithBreakdown,
  calculateKeywordMatches,
} from '../../src/lib/ats-scoring';
import { extractAndParseJSON } from '../../src/lib/extract-json';
import { normalizeResumeSpelling } from '../../src/lib/utils';
import {
  callProvider,
  classifyProviderHttpError,
  sanitizeErrorMessage,
} from '../../src/background/provider-client';
import type { JobDescription, ParsedResume } from '../../src/types';

const resume: ParsedResume = {
  summary: 'Senior Software Engineer building React and TypeScript applications.',
  coreCompetencies: ['React', 'TypeScript', 'API development'],
  experience: [{
    title: 'Senior Software Engineer',
    company: 'Example Company',
    startDate: 'Jan 2020',
    endDate: 'Present',
    bullets: [
      'Built React applications used by 5,000 customers.',
      'Improved API response times by 35 percent.',
    ],
  }],
  education: [{ degree: 'Bachelor of Science', school: 'Example University' }],
  skills: ['React', 'TypeScript', 'REST APIs'],
  certifications: [],
  raw: 'Senior Software Engineer React TypeScript REST APIs',
};

const job: JobDescription = {
  title: 'Senior Software Engineer',
  company: 'Hiring Company',
  description: 'Build React applications with TypeScript and REST APIs. Improve application performance.',
  requirements: [
    'Professional React and TypeScript experience',
    'Experience building REST APIs',
  ],
  keywords: ['React', 'TypeScript', 'REST APIs'],
  url: 'https://example.com/jobs/123',
};

test.describe('ATS scoring', () => {
  test('returns a bounded score with a strong exact-title match', () => {
    const result = calculateATSScoreWithBreakdown(resume, job);

    expect(result.total).toBeGreaterThanOrEqual(10);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.formatting).toBe(20);
    expect(result.atsKeywords).toBeGreaterThan(0);
    expect(result.achievements).toBeGreaterThan(0);
  });

  test('marks present and absent job keywords', () => {
    const matches = calculateKeywordMatches(resume, {
      ...job,
      keywords: [...job.keywords, 'Kubernetes'],
    });

    expect(matches.find(match => match.keyword === 'react')).toMatchObject({
      inResume: true,
      importance: 'high',
    });
    expect(matches.find(match => match.keyword === 'kubernetes')).toMatchObject({
      inResume: false,
      importance: 'high',
    });
  });
});

test.describe('AI JSON extraction', () => {
  test('extracts fenced JSON containing braces inside strings', () => {
    const parsed = extractAndParseJSON(
      'Result:\n```json\n{"summary":"Built {reliable} APIs","items":[1,2]}\n```',
    );
    expect(parsed).toEqual({ summary: 'Built {reliable} APIs', items: [1, 2] });
  });

  test('rejects missing, malformed, and incomplete JSON', () => {
    expect(() => extractAndParseJSON('No structured response')).toThrow(/structured JSON/i);
    expect(() => extractAndParseJSON('{"value": }')).toThrow(/malformed JSON/i);
    expect(() => extractAndParseJSON('{"value": 1')).toThrow(/incomplete JSON/i);
  });
});

test.describe('generated copy conventions', () => {
  test('normalizes accented resume spellings while preserving capitalization and plurals', () => {
    expect(normalizeResumeSpelling('Résumé, résumé, RÉSUMÉS, and re\u0301sume\u0301s'))
      .toBe('Resume, resume, RESUMES, and resumes');
  });
});

test.describe('provider error sanitization', () => {
  test('redacts credentials before displaying provider errors', () => {
    const message = sanitizeErrorMessage(
      'Rejected Bearer secret-token-123456 and sk-abcdefghijklmnopqrstuvwxyz',
    );

    expect(message).not.toContain('secret-token-123456');
    expect(message).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(message).toContain('[redacted]');
  });

  test('replaces excessively long provider responses', () => {
    expect(sanitizeErrorMessage('x'.repeat(301))).toBe('Something went wrong. Please try again.');
  });

  test('classifies authentication, credits, rate limits, models, and provider outages', () => {
    expect(classifyProviderHttpError(401, 'invalid key').message).toContain('Authentication failed');
    expect(classifyProviderHttpError(402, 'payment required').message).toContain('Insufficient API credits');
    expect(classifyProviderHttpError(429, 'insufficient_quota').message).toContain('Insufficient API credits');
    expect(classifyProviderHttpError(429, 'too many requests').message).toContain('rate limit');
    expect(classifyProviderHttpError(400, 'model is unsupported').message).toContain('model is unavailable');
    expect(classifyProviderHttpError(503, 'overloaded').message).toContain('temporarily unavailable');
  });
});

test.describe('provider transport', () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;

  test.afterEach(() => {
    Object.defineProperty(globalThis, 'chrome', { configurable: true, value: originalChrome });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  });

  test('uses the Anthropic Messages API for a direct Claude configuration', async () => {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: async () => ({
              apiConfig: {
                baseUrl: 'https://api.anthropic.com/v1',
                apiKey: 'anthropic-test-key',
                model: 'claude-sonnet-4-6',
              },
            }),
          },
        },
      },
    });

    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string, init: RequestInit) => {
        requestUrl = url;
        requestInit = init;
        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    await expect(callProvider('System instructions', [{ role: 'user', content: 'Hello' }], 50, 1_000))
      .resolves.toBe('OK');
    expect(requestUrl).toBe('https://api.anthropic.com/v1/messages');
    expect(requestInit?.headers).toMatchObject({
      'x-api-key': 'anthropic-test-key',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      model: 'claude-sonnet-4-6',
      system: 'System instructions',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  test('uses the OpenAI-compatible transport and JSON mode for direct providers', async () => {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: async () => ({
              apiConfig: {
                baseUrl: 'https://api.deepseek.com',
                apiKey: 'provider-key',
                model: 'deepseek-v4-flash',
              },
            }),
          },
        },
      },
    });

    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string, init: RequestInit) => {
        requestUrl = url;
        requestInit = init;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    await expect(callProvider('System instructions', [{ role: 'user', content: 'Hello' }], 50, 1_000, 1, true))
      .resolves.toBe('OK');
    expect(requestUrl).toBe('https://api.deepseek.com/chat/completions');
    expect(requestInit?.headers).toMatchObject({ Authorization: 'Bearer provider-key' });
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'System instructions' },
        { role: 'user', content: 'Hello' },
      ],
    });
  });

  test('uses a session-only API key without requiring a persisted key', async () => {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: { get: async () => ({ apiConfig: { baseUrl: 'https://provider.test/v1', apiKey: '', model: 'model' } }) },
          session: { get: async () => ({ sessionApiKey: 'session-provider-key' }) },
        },
      },
    });
    let authorization = '';
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_url: string, init: RequestInit) => {
        authorization = (init.headers as Record<string, string>).Authorization;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    await expect(callProvider(undefined, [{ role: 'user', content: 'Hello' }], 50, 1_000)).resolves.toBe('OK');
    expect(authorization).toBe('Bearer session-provider-key');
  });

  test('reports when a configured provider is unavailable', async () => {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: async () => ({
              apiConfig: {
                baseUrl: 'https://provider.test/v1',
                apiKey: 'provider-key',
                model: 'provider-model',
              },
            }),
          },
        },
      },
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async () => { throw new TypeError('fetch failed'); },
    });

    await expect(callProvider(undefined, [{ role: 'user', content: 'Hello' }], 50, 1_000))
      .rejects.toThrow('Could not reach the AI provider. Check the base URL in Settings and your connection.');
  });

  test('reports a provider request timeout separately from network failure', async () => {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: async () => ({
              apiConfig: {
                baseUrl: 'https://provider.test/v1',
                apiKey: 'provider-key',
                model: 'provider-model',
              },
            }),
          },
        },
      },
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    });

    await expect(callProvider(undefined, [{ role: 'user', content: 'Hello' }], 50, 5))
      .rejects.toThrow('Request timed out. Please try again.');
  });
});
