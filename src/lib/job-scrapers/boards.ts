import type { JobDescription } from '../../types';

export type JobScraperContext = {
  getText(selectors: string[]): string | null;
  getPageCompany(): string;
  extractRequirements(text: string): string[];
  extractKeywords(text: string): string[];
};

export class BoardScrapers {
  constructor(private readonly context: JobScraperContext) {}

  scrapeCurrentBoard(): Partial<JobDescription> | null {
    const scrapers = [
      this.scrapeLinkedIn,
      this.scrapeIndeed,
      this.scrapeGlassdoor,
      this.scrapeGreenhouse,
      this.scrapeLever,
      this.scrapeWorkday,
      this.scrapeBayt,
      this.scrapeNaukri,
      this.scrapeZipRecruiter,
      this.scrapeMonster,
      this.scrapeWellfound,
    ];

    for (const scrape of scrapers) {
      const result = scrape.call(this);
      if (result) return result;
    }
    return null;
  }

  private getText(selectors: string[]): string | null {
    return this.context.getText(selectors);
  }

  private getPageCompany(): string {
    return this.context.getPageCompany();
  }

  private extractRequirements(text: string): string[] {
    return this.context.extractRequirements(text);
  }

  private extractKeywords(text: string): string[] {
    return this.context.extractKeywords(text);
  }

  scrapeLinkedIn(): Partial<JobDescription> | null {
    if (!window.location.hostname.includes('linkedin.com')) return null;
    try {
      // Expand truncated description — LinkedIn hides it behind "See more"
      const seeMore = document.querySelector<HTMLElement>(
        'button.jobs-description__footer-button, ' +
        '[aria-label="Click to see more description"], ' +
        '.jobs-description__content button[aria-expanded="false"], ' +
        '.jobs-description footer button, ' +
        'button.inline-show-more-text__button'
      );
      if (seeMore) { seeMore.click(); }

      const title = this.getText([
        'h1.t-24',
        'h1.t-24.t-bold',
        '.job-details-jobs-unified-top-card__job-title h1',
        '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title h1',
        '.jobs-unified-top-card__job-title',
        '[data-test-job-title]',
        '.topcard__title',
        'h1',
      ]);

      const company = this.getText([
        '.job-details-jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__company-name',
        '.topcard__org-name-link',
        '.topcard__flavor a',
        '[data-test-employer-name]',
      ]);

      const description = this.getText([
        '#job-details',
        '.jobs-description__content .jobs-box__html-content',
        '.jobs-description__content',
        '.jobs-description',
        '.description__text',
        '.show-more-less-html__markup',
        '[data-job-description]',
      ]);

      if (!title) return null;
      const desc = description || 'See job posting for full description';
      return {
        title,
        company: company || this.getPageCompany(),
        description: desc,
        requirements: this.extractRequirements(desc),
        keywords: this.extractKeywords(desc),
      };
    } catch { return null; }
  }

  scrapeIndeed(): Partial<JobDescription> | null {
    if (!window.location.hostname.includes('indeed.com')) return null;
    try {
      // Expand "Show more" if present
      const showMore = document.querySelector<HTMLElement>(
        '[data-testid="show-more-button"], button[aria-label*="more"], .ia-continueButton'
      );
      if (showMore) { showMore.click(); }

      const title = this.getText([
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        '.jobsearch-JobInfoHeader-title',
        'h1[data-testid="job-title"]',
        'h1',
      ]);
      const company = this.getText([
        '[data-testid="inlineHeader-companyName"] a',
        '[data-testid="inlineHeader-companyName"]',
        '[data-company-name="true"]',
        '.jobsearch-InlineCompanyRating-companyHeader a',
      ]);
      const description = this.getText([
        '#jobDescriptionText',
        '[data-testid="job-description"]',
        '.jobsearch-jobDescriptionText',
      ]);
      if (!title || !description) return null;
      return {
        title,
        company: company || this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }

  scrapeGlassdoor(): Partial<JobDescription> | null {
    if (!window.location.hostname.includes('glassdoor.com')) return null;
    try {
      const title = this.getText(['[data-test="job-title"]', '.job-title', 'h1']);
      const company = this.getText([
        '[data-test="employer-name"]',
        '.employer-name',
        '[class*="employerName"]',
      ]);
      const description = this.getText([
        '[class*="jobDescriptionContent"]',
        '[data-test="description"]',
        '.desc',
      ]);
      if (!title || !description) return null;
      return {
        title,
        company: company || this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }

  scrapeGreenhouse(): Partial<JobDescription> | null {
    if (
      !window.location.hostname.includes('greenhouse.io') &&
      !window.location.hostname.includes('boards.greenhouse')
    ) return null;
    try {
      const title = this.getText(['.app-title', 'h1']);
      const company = this.getText(['.company-name', '.greenhouse-logo']);
      const description = this.getText(['#content', '.content']);
      if (!title || !description) return null;
      return {
        title,
        company: company || this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }

  scrapeLever(): Partial<JobDescription> | null {
    if (
      !window.location.hostname.includes('lever.co') &&
      !window.location.hostname.includes('jobs.lever')
    ) return null;
    try {
      const title = this.getText(['.posting-headline h2', 'h2', 'h1']);
      const company = this.getText(['.main-header-text', '.main-header-text-item']);
      const description = this.getText(['.content', 'main']);
      if (!title || !description) return null;
      return {
        title,
        company: company || this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }

  scrapeWorkday(): Partial<JobDescription> | null {
    if (
      !window.location.hostname.includes('myworkdayjobs.com') &&
      !window.location.hostname.includes('workday.com')
    ) return null;
    try {
      const title = this.getText([
        '[data-automation-id="jobPostingHeader"]',
        'h2.css-m7vi8e',
        'h2',
        'h1',
      ]);
      const description = this.getText([
        '[data-automation-id="jobPostingDescription"]',
        '.job-description',
        'main',
      ]);
      if (!title || !description) return null;
      return {
        title,
        company: this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }

  scrapeBayt(): Partial<JobDescription> | null {
    if (!window.location.hostname.includes('bayt.com')) return null;
    try {
      const title = this.getText([
        'h1.t-large',
        'h1[class*="job-title"]',
        '.job-title',
        'h1',
      ]);
      const company = this.getText([
        '.t-default.t-bold',
        '[class*="company-name"]',
        'h2.t-default',
      ]);
      const description = this.getText([
        '#the-job',
        '[class*="job-description"]',
        '.jobDescription',
        '.t-break-all',
      ]);
      if (!title || !description) return null;
      return {
        title,
        company: company || this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }

  scrapeNaukri(): Partial<JobDescription> | null {
    if (!window.location.hostname.includes('naukri.com')) return null;
    try {
      const title = this.getText([
        'h1.jd-header-title',
        '.jd-header-title',
        '[class*="jobTitle"]',
        'h1',
      ]);
      const company = this.getText([
        '.jd-header-comp-name a',
        '.jd-header-comp-name',
        '[class*="comp-name"]',
      ]);
      const description = this.getText([
        '.job-desc',
        '[class*="job-description"]',
        '#job_description',
        '.dang-inner-html',
      ]);
      if (!title || !description) return null;
      return {
        title,
        company: company || this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }

  scrapeZipRecruiter(): Partial<JobDescription> | null {
    if (!window.location.hostname.includes('ziprecruiter.com')) return null;
    try {
      const title = this.getText([
        'h1[class*="job_title"]',
        '.job_title',
        '[data-testid="job-title"]',
        'h1',
      ]);
      const company = this.getText([
        '[class*="hiring_company"] a',
        '[class*="hiring_company"]',
        '[data-testid="hiring-company"]',
      ]);
      const description = this.getText([
        '[class*="job_description"]',
        '#job_description',
        '.jobDescriptionSection',
      ]);
      if (!title || !description) return null;
      return {
        title,
        company: company || this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }

  scrapeMonster(): Partial<JobDescription> | null {
    if (!window.location.hostname.includes('monster.com')) return null;
    try {
      const title = this.getText([
        'h1.title',
        '[class*="job-title"]',
        'h1',
      ]);
      const company = this.getText([
        '.name',
        '[class*="company-name"]',
      ]);
      const description = this.getText([
        '[class*="job-description"]',
        '#JobDescription',
        '.details-content',
      ]);
      if (!title || !description) return null;
      return {
        title,
        company: company || this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }

  scrapeWellfound(): Partial<JobDescription> | null {
    if (
      !window.location.hostname.includes('wellfound.com') &&
      !window.location.hostname.includes('angel.co')
    ) return null;
    try {
      const title = this.getText([
        'h1[class*="title"]',
        '.job-title',
        'h1',
      ]);
      const company = this.getText([
        '[class*="company-name"]',
        '[class*="startup-name"]',
        'h2',
      ]);
      const description = this.getText([
        '[class*="description"]',
        '.job-description',
        'main',
      ]);
      if (!title || !description) return null;
      return {
        title,
        company: company || this.getPageCompany(),
        description,
        requirements: this.extractRequirements(description),
        keywords: this.extractKeywords(description),
      };
    } catch { return null; }
  }
}
