import { expect, test } from '@playwright/test';
import { storage } from '../../src/lib/storage';
import { ResumeParser } from '../../src/lib/resume-parser';
import { BoardScrapers } from '../../src/lib/job-scrapers/boards';
import { DocumentGenerator } from '../../src/lib/document-generator';
import type { ParsedResume } from '../../src/types';

type Store = Record<string, unknown>;

function installStorageMock(initial: Store = {}): Store {
  const data = { ...initial };
  const local = {
    async get(keys: string | string[]) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.filter(key => key in data).map(key => [key, data[key]]));
    },
    async set(items: Store) { Object.assign(data, items); },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: { storage: { local } },
  });
  return data;
}

const parsedResume: ParsedResume = {
  name: 'Jane Candidate',
  email: 'jane@example.com',
  phone: '+1 555-123-4567',
  location: 'Vilnius, Lithuania',
  summary: 'Software engineer focused on reliable web applications.',
  experience: [{
    title: 'Software Engineer',
    company: 'Example Ltd',
    startDate: 'Jan 2020',
    endDate: 'Present',
    bullets: ['Built applications used by 1,000 customers.'],
  }],
  education: [{ degree: 'BSc Computer Science', school: 'Example University' }],
  skills: ['TypeScript', 'React'],
  certifications: ['Cloud Certificate'],
  raw: 'resume',
};

test.describe('storage operations', () => {
  test('merges partial settings and provider configuration', async () => {
    const data = installStorageMock();
    await storage.updateSettings({ autoDetectJob: false });
    await storage.saveApiConfig({ model: 'test-model' });

    expect(data.userSettings).toMatchObject({
      defaultTone: 'professional',
      autoDetectJob: false,
      showATSScore: true,
    });
    expect(data.apiConfig).toMatchObject({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'test-model',
    });
  });

  test('caps optimization history at ten and updates existing records', async () => {
    installStorageMock();
    for (let index = 0; index < 12; index++) {
      await storage.saveOptimizedResume({
        id: `resume-${index}`,
        originalResumeId: 'master',
        jobDescriptionUrl: `https://example.com/${index}`,
        optimizedContent: parsedResume,
        atsScore: index,
        keywordMatches: [],
        createdAt: new Date(index),
      });
    }
    expect((await storage.getOptimizedResumes()).map(item => item.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `resume-${index + 2}`),
    );

    const existing = (await storage.getOptimizedResumes())[3];
    await storage.saveOptimizedResume({ ...existing, atsScore: 99 });
    expect((await storage.getOptimizedResumes()).find(item => item.id === existing.id)?.atsScore).toBe(99);
  });

  test('clearAll preserves API credentials while removing personal data', async () => {
    const data = installStorageMock({
      apiConfig: { baseUrl: 'https://provider.test/v1', apiKey: 'secret', model: 'model' },
      masterResume: { id: 'resume' },
      optimizedResumes: [{}],
      applications: [{}],
      userSettings: {},
    });
    await storage.clearAll();
    expect(data.apiConfig).toBeDefined();
    expect(data.masterResume).toBeUndefined();
    expect(data.optimizedResumes).toBeUndefined();
    expect(data.applications).toBeUndefined();
  });
});

test.describe('local resume parsing', () => {
  test('extracts contact details, sections, experience, education, and skills', () => {
    const result = new ResumeParser().extractLocally(`Jane Candidate
jane@example.com | +1 555-123-4567 | Vilnius, Lithuania
Professional Summary
Software engineer building reliable customer-facing products.
Core Competencies
Delivery | Stakeholder Management | Agile
Professional Experience
Software Engineer | Example Ltd | 2020 - Present | Vilnius, Lithuania
- Built customer applications used by more than 1,000 people each month.
Education
BSc Computer Science | Example University | 2019
Skills
TypeScript, React, REST APIs
Certifications
- Cloud Certificate`);

    expect(result).toMatchObject({
      name: 'Jane Candidate',
      email: 'jane@example.com',
      location: 'Vilnius, Lithuania',
      skills: ['TypeScript', 'React', 'REST APIs'],
      certifications: ['Cloud Certificate'],
    });
    expect(result.coreCompetencies).toContain('Stakeholder Management');
    expect(result.experience[0]).toMatchObject({ title: 'Software Engineer', company: 'Example Ltd' });
    expect(result.education[0]).toMatchObject({ degree: 'BSc Computer Science', school: 'Example University' });
  });

  test('returns empty collections when optional sections are absent', () => {
    const result = new ResumeParser().extractLocally('Jane Candidate\njane@example.com');
    expect(result.experience).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.certifications).toEqual([]);
  });
});

test.describe('job-board adapters', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  test.afterEach(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  });

  test('extracts an Indeed posting from selector-based page data', () => {
    const nodes: Record<string, string> = {
      '[data-testid="jobsearch-JobInfoHeader-title"]': 'Frontend Engineer',
      '[data-testid="inlineHeader-companyName"]': 'Example Corp',
      '#jobDescriptionText': 'Build React applications. Requirements include TypeScript experience.',
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { hostname: 'www.indeed.com' } },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: (selector: string) => nodes[selector] ? { textContent: nodes[selector] } : null },
    });
    const adapters = new BoardScrapers({
      getText: selectors => {
        for (const selector of selectors) {
          const text = nodes[selector];
          if (text) return text;
        }
        return null;
      },
      getPageCompany: () => 'Fallback Company',
      extractRequirements: text => text.includes('Requirements') ? ['TypeScript experience'] : [],
      extractKeywords: () => ['React', 'TypeScript'],
    });

    expect(adapters.scrapeCurrentBoard()).toMatchObject({
      title: 'Frontend Engineer',
      company: 'Example Corp',
      keywords: ['React', 'TypeScript'],
    });
  });

  test('returns null for an unsupported hostname', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { hostname: 'example.com' } },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: () => null },
    });
    const adapters = new BoardScrapers({
      getText: () => null,
      getPageCompany: () => '',
      extractRequirements: () => [],
      extractKeywords: () => [],
    });
    expect(adapters.scrapeCurrentBoard()).toBeNull();
  });
});

test.describe('document generation', () => {
  test('generates non-empty PDF and DOCX resumes with valid signatures', async () => {
    const generator = new DocumentGenerator();
    const [pdf, docx] = await Promise.all([
      generator.generatePDF(parsedResume, 'Software Engineer'),
      generator.generateDOCX(parsedResume, 'Software Engineer'),
    ]);
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
    const docxBytes = new Uint8Array(await docx.arrayBuffer());
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe('%PDF-');
    expect(Array.from(docxBytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(pdf.size).toBeGreaterThan(1_000);
    expect(docx.size).toBeGreaterThan(1_000);
  });

  test('generates non-empty cover-letter documents', async () => {
    const generator = new DocumentGenerator();
    const content = 'Dear Hiring Manager,\n\nI am applying for the role. My experience closely matches your needs.\n\nSincerely,\nJane Candidate';
    const [pdf, docx] = await Promise.all([
      generator.generateCoverLetterPDF(content, 'Jane Candidate', 'jane@example.com'),
      generator.generateCoverLetterDOCX(content, 'Jane Candidate', 'jane@example.com'),
    ]);
    expect(pdf.size).toBeGreaterThan(500);
    expect(docx.size).toBeGreaterThan(500);
  });
});
