import { expect, test } from '@playwright/test';
import {
  calculateATSScoreWithBreakdown,
  calculateKeywordMatches,
} from '../../src/lib/ats-scoring';
import { extractAndParseJSON } from '../../src/lib/extract-json';
import { sanitizeErrorMessage } from '../../src/background/provider-client';
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
    expect(() => extractAndParseJSON('No structured response')).toThrow(/no JSON object/i);
    expect(() => extractAndParseJSON('{"value": }')).toThrow(/malformed JSON/i);
    expect(() => extractAndParseJSON('{"value": 1')).toThrow(/incomplete JSON/i);
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
});
