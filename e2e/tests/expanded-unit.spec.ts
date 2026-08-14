import { expect, test } from '@playwright/test';
import { CURRENT_STORAGE_SCHEMA_VERSION, storage } from '../../src/lib/storage';
import { ResumeParser } from '../../src/lib/resume-parser';
import { BoardScrapers } from '../../src/lib/job-scrapers/boards';
import { JobScraper } from '../../src/lib/job-scraper';
import { DocumentGenerator } from '../../src/lib/document-generator';
import { formatApplicationDate } from '../../src/content/views/HistoryView';
import type { ParsedResume } from '../../src/types';

type Store = Record<string, unknown>;

function installStorageMock(initial: Store = {}): Store {
  const data = { ...initial };
  const sessionData: Store = {};
  const createArea = (target: Store) => ({
    async get(keys: string | string[]) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.filter(key => key in target).map(key => [key, target[key]]));
    },
    async set(items: Store) { Object.assign(target, items); },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete target[key];
    },
  });
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: { storage: { local: createArea(data), session: createArea(sessionData) } },
  });
  Object.defineProperty(data, '__session', { value: sessionData, enumerable: false });
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
  test('versions existing storage without deleting data and is idempotent', async () => {
    const data = installStorageMock({
      masterResume: { id: 'existing-resume' },
      applications: [{ id: 'existing-application' }],
    });

    await storage.initialize();
    await storage.initialize();

    expect(data.storageSchemaVersion).toBe(CURRENT_STORAGE_SCHEMA_VERSION);
    expect(data.masterResume).toEqual({ id: 'existing-resume', uploadedAt: null });
    expect(data.applications).toEqual([{ id: 'existing-application', appliedAt: null }]);
  });

  test('does not downgrade storage written by a newer extension version', async () => {
    const data = installStorageMock({ storageSchemaVersion: CURRENT_STORAGE_SCHEMA_VERSION + 1 });
    await storage.initialize();
    expect(data.storageSchemaVersion).toBe(CURRENT_STORAGE_SCHEMA_VERSION + 1);
  });

  test('migrates legacy dates to ISO strings and marks malformed dates unavailable', async () => {
    const data = installStorageMock({
      storageSchemaVersion: 1,
      masterResume: { id: 'resume', uploadedAt: '2025-02-03T10:15:00Z' },
      optimizedResumes: [
        { id: 'optimized-valid', createdAt: 1_700_000_000_000 },
        { id: 'optimized-invalid', createdAt: {} },
      ],
      applications: [
        { id: 'application-valid', appliedAt: '2025-06-12' },
        { id: 'application-invalid', appliedAt: 'not-a-date' },
        { id: 'application-missing' },
      ],
    });

    await storage.initialize();

    expect(data.storageSchemaVersion).toBe(2);
    expect((data.masterResume as { uploadedAt: string }).uploadedAt).toBe('2025-02-03T10:15:00.000Z');
    expect((data.optimizedResumes as Array<{ createdAt: string | null }>).map(item => item.createdAt)).toEqual([
      '2023-11-14T22:13:20.000Z',
      null,
    ]);
    expect((data.applications as Array<{ appliedAt: string | null }>).map(item => item.appliedAt)).toEqual([
      '2025-06-12T00:00:00.000Z',
      null,
      null,
    ]);
  });

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

  test('can keep an API key in session storage without persisting it locally', async () => {
    const data = installStorageMock();
    await storage.saveApiConfig({
      baseUrl: 'https://provider.test/v1',
      apiKey: 'session-secret',
      model: 'test-model',
    }, { rememberApiKey: false });

    expect((data.apiConfig as { apiKey: string }).apiKey).toBe('');
    expect((data.__session as Store).sessionApiKey).toBe('session-secret');
    expect((await storage.getApiConfig()).apiKey).toBe('session-secret');

    await storage.saveApiConfig({ apiKey: '' }, { rememberApiKey: false });
    expect((data.__session as Store).sessionApiKey).toBeUndefined();
  });

  test('rejects malformed records and restores safe setting defaults', async () => {
    installStorageMock({
      masterResume: { id: 'broken' },
      optimizedResumes: [{ id: 'broken' }],
      applications: [
        { id: 'broken', status: 'unknown' },
        {
          id: 'valid', jobTitle: 'Engineer', company: 'Example', url: 'https://example.com/job',
          resumeId: 'resume', status: 'applied', appliedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      userSettings: { defaultTone: 'invalid', autoDetectJob: 'yes', rememberApiKey: 'yes' },
      apiConfig: { baseUrl: 42, apiKey: {}, model: null },
    });

    expect(await storage.getResume()).toBeNull();
    expect(await storage.getOptimizedResumes()).toEqual([]);
    expect((await storage.getApplications()).map(item => item.id)).toEqual(['valid']);
    expect(await storage.getSettings()).toMatchObject({
      defaultTone: 'professional', autoDetectJob: true, showATSScore: true, rememberApiKey: true,
    });
    expect(await storage.getApiConfig()).toEqual({
      baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '',
    });
  });

  test('exports and restores validated backups without exposing or replacing API keys', async () => {
    const data = installStorageMock({
      apiConfig: { baseUrl: 'https://provider.test/v1', apiKey: 'private-key', model: 'model-a' },
      masterResume: {
        id: 'resume', fileName: 'resume.pdf', fileType: 'pdf', content: 'content',
        parsedData: parsedResume, uploadedAt: '2025-01-01T00:00:00.000Z',
      },
      applications: [{
        id: 'application', jobTitle: 'Engineer', company: 'Example', url: 'https://example.com/job',
        resumeId: 'resume', status: 'applied', appliedAt: '2025-01-02T00:00:00.000Z',
      }],
    });

    const backup = await storage.createBackup();
    expect(JSON.stringify(backup)).not.toContain('private-key');
    expect(backup.data.provider).toEqual({ baseUrl: 'https://provider.test/v1', model: 'model-a' });

    backup.data.provider.model = 'model-from-backup';
    await storage.restoreBackup(backup);
    expect((data.apiConfig as { apiKey: string; model: string })).toEqual(expect.objectContaining({
      apiKey: 'private-key', model: 'model-from-backup',
    }));
    expect((await storage.getApplications())[0].id).toBe('application');
    await expect(storage.restoreBackup({ format: 'unknown' })).rejects.toThrow('not a supported');
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
        createdAt: new Date(index).toISOString(),
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

test.describe('application history dates', () => {
  test('shows a safe fallback instead of Invalid Date', () => {
    expect(formatApplicationDate(null)).toBe('Date unavailable');
    expect(formatApplicationDate('not-a-date')).toBe('Date unavailable');
    expect(formatApplicationDate('2025-06-12T00:00:00.000Z')).not.toBe('Date unavailable');
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

  test('expands and extracts a complete LinkedIn description', () => {
    let expanded = false;
    const description = 'Build reliable distributed systems with TypeScript and Kubernetes. '.repeat(3);
    const nodes: Record<string, string> = {
      '.job-details-jobs-unified-top-card__job-title h1': 'Platform Engineer',
      '.job-details-jobs-unified-top-card__company-name': 'Example Corp',
      '#job-details': description,
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { hostname: 'www.linkedin.com' } },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: () => ({ click: () => { expanded = true; } }) },
    });
    const adapters = new BoardScrapers({
      getText: selectors => selectors.map(selector => nodes[selector]).find(Boolean) ?? null,
      getPageCompany: () => 'LinkedIn',
      extractRequirements: () => ['TypeScript', 'Kubernetes'],
      extractKeywords: () => ['TypeScript', 'Kubernetes'],
    });

    expect(adapters.scrapeCurrentBoard()).toMatchObject({
      title: 'Platform Engineer',
      company: 'Example Corp',
      description,
    });
    expect(expanded).toBe(true);
  });

  test('extracts LinkedIn generated-class layouts using semantic fallbacks', () => {
    const description = 'Own product initiatives from discovery through launch. Requirements include product management, SaaS experience, agile delivery, analytics, and stakeholder communication. Work closely with design and engineering teams.';
    const descriptionContainer = { textContent: `About the job ${description}`, parentElement: null };
    const headingParent = { textContent: 'About the job', parentElement: descriptionContainer };
    const heading = { textContent: 'About the job', parentElement: headingParent };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { hostname: 'www.linkedin.com' } },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        title: 'Junior Product Manager | LearnWise AI | LinkedIn',
        querySelector: () => null,
        querySelectorAll: (selector: string) => selector === 'h1, h2, h3' ? [heading] : [],
      },
    });
    const adapters = new BoardScrapers({
      getText: () => null,
      getPageCompany: () => 'LinkedIn',
      extractRequirements: () => ['SaaS experience'],
      extractKeywords: () => ['SaaS', 'Agile'],
    });

    expect(adapters.scrapeCurrentBoard()).toMatchObject({
      title: 'Junior Product Manager',
      company: 'LearnWise AI',
      description,
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

test.describe('job scanning fallback', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalChrome = globalThis.chrome;

  test.afterEach(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, 'chrome', { configurable: true, value: originalChrome });
  });

  test('uses AI on a manual scan when selectors cannot extract the posting', async () => {
    const pageText = 'We are hiring a Backend Engineer. Apply now. Requirements include Node.js, SQL, and cloud experience. Responsibilities include building reliable APIs, reviewing code, monitoring production services, and collaborating with product teams.';
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { href: 'https://www.linkedin.com/jobs/view/123', hostname: 'www.linkedin.com' } },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        querySelector: () => null,
        body: {
          cloneNode: () => ({
            innerText: pageText,
            querySelectorAll: () => [],
          }),
        },
      },
    });
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          sendMessage: async () => ({
            success: true,
            data: {
              isJobPosting: true,
              title: 'Backend Engineer',
              company: 'Example Corp',
              description: pageText,
              requirements: ['Node.js', 'SQL'],
            },
          }),
        },
      },
    });

    await expect(new JobScraper().scrapeCurrentPage('manual')).resolves.toMatchObject({
      title: 'Backend Engineer',
      company: 'Example Corp',
    });
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
