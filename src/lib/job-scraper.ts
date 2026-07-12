import type { JobDescription } from '../types';
import { sleep } from './utils';

const SPA_HYDRATE_DELAY_MS = 1500;
const SPA_HYDRATE_RETRY_DELAY_MS = 2000;
const AI_PAGE_TEXT_LIMIT = 5000;
const MIN_PAGE_TEXT_LENGTH = 150;

type ScrapedJobData = {
  isJobPosting?: boolean;
  title?: string;
  company?: string;
  description?: string;
  requirements?: string[];
  keywords?: string[];
};
type AiScrapeResponse = { success: boolean; data?: ScrapedJobData; error?: string };

export class JobScraper {
  /**
   * @param useAI When true, fall back to a Claude call if the DOM scrapers find
   *   nothing. Pass false for automatic detection (login / SPA navigation) so we
   *   never fire an API request the user didn't ask for; the AI fallback then
   *   runs only on an explicit user-initiated scan.
   */
  async scrapeCurrentPage(useAI = true): Promise<JobDescription | null> {
    const url = window.location.href;

    // Try DOM scrapers immediately
    let jobData = this.tryAllScrapers();

    if (!jobData) {
      // Wait for SPA content to hydrate
      await sleep(SPA_HYDRATE_DELAY_MS);
      jobData = this.tryAllScrapers();
    }

    if (!jobData) {
      await sleep(SPA_HYDRATE_RETRY_DELAY_MS);
      jobData = this.tryAllScrapers();
    }

    // AI fallback — works on ANY site where selectors failed.
    // Only on an explicit user-initiated scan, never on automatic detection.
    if (useAI && !jobData) {
      jobData = await this.scrapeWithAI();
    }

    if (jobData) {
      return { ...jobData, url } as JobDescription;
    }

    // No match is expected on non-job pages; keep it out of the extension error
    // panel (console.debug is not collected like warn/error).
    console.debug('[JobScraper] No job posting detected for:', url);
    return null;
  }

  private tryAllScrapers(): Partial<JobDescription> | null {
    return (
      this.scrapeLinkedIn() ||
      this.scrapeIndeed() ||
      this.scrapeGlassdoor() ||
      this.scrapeGreenhouse() ||
      this.scrapeLever() ||
      this.scrapeWorkday() ||
      this.scrapeBayt() ||
      this.scrapeNaukri() ||
      this.scrapeZipRecruiter() ||
      this.scrapeMonster() ||
      this.scrapeWellfound() ||
      this.scrapeGeneric()
    );
  }

  private getText(selectors: string[]): string | null {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        const text = el?.textContent?.trim();
        if (text && text.length > 2) return text;
      } catch {}
    }
    return null;
  }

  // ── Job boards ────────────────────────────────────────────────────────────

  private scrapeLinkedIn(): Partial<JobDescription> | null {
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

  private scrapeIndeed(): Partial<JobDescription> | null {
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

  private scrapeGlassdoor(): Partial<JobDescription> | null {
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

  private scrapeGreenhouse(): Partial<JobDescription> | null {
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

  private scrapeLever(): Partial<JobDescription> | null {
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

  private scrapeWorkday(): Partial<JobDescription> | null {
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

  private scrapeBayt(): Partial<JobDescription> | null {
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

  private scrapeNaukri(): Partial<JobDescription> | null {
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

  private scrapeZipRecruiter(): Partial<JobDescription> | null {
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

  private scrapeMonster(): Partial<JobDescription> | null {
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

  private scrapeWellfound(): Partial<JobDescription> | null {
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

  private scrapeGeneric(): Partial<JobDescription> | null {
    try {
      const title = this.getText([
        '[class*="job-title"]',
        '[class*="jobtitle"]',
        '[id*="job-title"]',
        '[class*="position-title"]',
        '[class*="role-title"]',
        'h1',
      ]);

      const descSelectors = [
        '[class*="job-description"]',
        '[id*="job-description"]',
        '[class*="jobDescription"]',
        '[id*="jobDescription"]',
        '[class*="job-details"]',
        '[id*="job-details"]',
        '[class*="description"]',
        'article',
        'main',
      ];

      let description = '';
      for (const sel of descSelectors) {
        try {
          const el = document.querySelector(sel);
          const text = el?.textContent?.trim();
          if (text && text.length > 200) { description = text; break; }
        } catch {}
      }

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

  // ── AI fallback ───────────────────────────────────────────────────────────
  /** Called when all DOM scrapers fail. Sends visible page text to Claude Haiku. */
  private async scrapeWithAI(): Promise<Partial<JobDescription> | null> {
    try {
      const pageText = this.extractPageText();
      // Only bother if the page looks like it might be a job posting
      if (pageText.length < MIN_PAGE_TEXT_LENGTH) return null;
      const hasJobSignals = /\b(apply|requirements?|qualifications?|responsibilities|salary|position|hiring|vacancy|role|candidate)\b/i.test(pageText);
      if (!hasJobSignals) return null;

      const response: AiScrapeResponse =
        await chrome.runtime.sendMessage({
          action: 'scrapeJobWithAI',
          payload: { pageText: pageText.slice(0, AI_PAGE_TEXT_LIMIT) },
        });

      if (!response.success || !response.data?.isJobPosting) return null;

      const data = response.data;
      return {
        title: data.title,
        company: data.company || this.getPageCompany(),
        description: data.description || '',
        requirements: data.requirements || [],
        keywords: this.extractKeywords(data.description || ''),
      };
    } catch (err) {
      console.warn('[JobScraper] AI fallback failed:', err);
      return null;
    }
  }

  /** Extracts all meaningful visible text from the page, stripping nav/footer/scripts */
  extractPageText(): string {
    try {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, nav, header, footer, noscript, [aria-hidden="true"]').forEach(el => el.remove());
      return (clone.innerText || clone.textContent || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } catch (err) {
      console.warn('[JobScraper] extractPageText failed:', err);
      return '';
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getPageCompany(): string {
    return (
      document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
      document.querySelector('[class*="company"]')?.textContent?.trim() ||
      document.querySelector('[class*="employer"]')?.textContent?.trim() ||
      window.location.hostname.replace('www.', '').split('.')[0] ||
      'Unknown Company'
    );
  }

  private extractRequirements(text: string): string[] {
    const reqSection = text.match(
      /(?:requirements?|qualifications?|you have|what we.re looking for|you.ll need)[:\s]+([\s\S]*?)(?=\n\n|\n[A-Z]|responsibilities|about|benefits|$)/i
    );
    if (reqSection) {
      return reqSection[1]
        .split(/\n|•|·|–|-|\*/)
        .map(r => r.trim())
        .filter(r => r.length > 10)
        .slice(0, 10);
    }
    return [];
  }

  private extractKeywords(text: string): string[] {
    if (!text) return [];

    // ── Stop words ────────────────────────────────────────────────────────────
    const STOP = new Set([
      'the','a','an','and','or','but','in','on','at','to','for','of','with',
      'by','from','is','are','was','were','be','been','have','has','had','do',
      'does','did','will','would','could','should','may','might','must','shall',
      'can','need','this','that','these','those','we','you','our','your','their',
      'its','it','as','up','out','about','into','through','during','including',
      'such','than','then','also','not','no','so','very','too','what','who',
      'how','when','where','which','whom','whose','work','working','role',
      'position','job','team','company','candidate','other','using','use','used',
      'new','within','across','between','over','well','strong','good','excellent',
      'required','preferred','plus','highly','proven','ability','understanding',
      'knowledge','skills','experience','etc','eg','ie','both','some','all',
      'any','each','more','most','own','same','few','here','there','just','only',
    ]);

    // ── Known named keywords (verbatim matching) ──────────────────────────────
    // These ensure exact capitalisation/spelling for known tools & certifications
    const NAMED: [RegExp, string][] = [
      [/\bPython\b/i,'Python'],[/\bJavaScript\b/i,'JavaScript'],[/\bTypeScript\b/i,'TypeScript'],
      [/\bJava\b/,'Java'],[/\bC\+\+/,'C++'],[/\bC#\b/,'C#'],[/\bRuby\b/i,'Ruby'],
      [/\bGolang\b|\bGo\b/,'Go'],[/\bRust\b/i,'Rust'],[/\bPHP\b/i,'PHP'],
      [/\bSwift\b/i,'Swift'],[/\bKotlin\b/i,'Kotlin'],[/\bScala\b/i,'Scala'],
      [/\bReact\b/i,'React'],[/\bAngular\b/i,'Angular'],[/\bVue\.?js\b/i,'Vue.js'],
      [/\bNext\.?js\b/i,'Next.js'],[/\bNode\.?js\b/i,'Node.js'],[/\bDjango\b/i,'Django'],
      [/\bFlask\b/i,'Flask'],[/\bSpring\b/i,'Spring'],[/\bExpress\b/i,'Express'],
      [/\bSQL\b/i,'SQL'],[/\bPostgreSQL\b/i,'PostgreSQL'],[/\bMySQL\b/i,'MySQL'],
      [/\bMongoDB\b/i,'MongoDB'],[/\bRedis\b/i,'Redis'],[/\bElasticsearch\b/i,'Elasticsearch'],
      [/\bDynamoDB\b/i,'DynamoDB'],[/\bSnowflake\b/i,'Snowflake'],
      [/\bAWS\b/i,'AWS'],[/\bAzure\b/i,'Azure'],[/\bGCP\b|Google Cloud/i,'GCP'],
      [/\bDocker\b/i,'Docker'],[/\bKubernetes\b/i,'Kubernetes'],[/\bTerraform\b/i,'Terraform'],
      [/\bCI\/CD\b/i,'CI/CD'],[/\bJenkins\b/i,'Jenkins'],[/\bGitHub Actions\b/i,'GitHub Actions'],
      [/\bMachine Learning\b/i,'Machine Learning'],[/\bDeep Learning\b/i,'Deep Learning'],
      [/\bNLP\b/,'NLP'],[/\bLLM\b/,'LLM'],[/\bData Science\b/i,'Data Science'],
      [/\bDevOps\b/i,'DevOps'],[/\bAgile\b/i,'Agile'],[/\bScrum\b/i,'Scrum'],
      [/\bREST(?:ful)?\b/i,'REST'],[/\bGraphQL\b/i,'GraphQL'],[/\bMicroservices\b/i,'Microservices'],
      [/\bITIL\b/i,'ITIL'],[/\bITSM\b/i,'ITSM'],[/\bServiceNow\b/i,'ServiceNow'],
      [/\bPMP\b/,'PMP'],[/\bPRINCE2\b/i,'PRINCE2'],[/\bSix Sigma\b/i,'Six Sigma'],
      [/\bMBA\b/,'MBA'],[/\bCPA\b/,'CPA'],[/\bCFA\b/,'CFA'],[/\bCISA\b/,'CISA'],
      [/\bExcel\b/i,'Excel'],[/\bPowerPoint\b/i,'PowerPoint'],[/\bSalesforce\b/i,'Salesforce'],
      [/\bSAP\b/i,'SAP'],[/\bTableau\b/i,'Tableau'],[/\bPower BI\b/i,'Power BI'],
      [/\bJira\b/i,'Jira'],[/\bConfluence\b/i,'Confluence'],[/\bHubSpot\b/i,'HubSpot'],
      [/\bGoogle Analytics\b/i,'Google Analytics'],[/\bSEO\b/i,'SEO'],[/\bCRM\b/i,'CRM'],
      [/\bERP\b/i,'ERP'],[/\bRPA\b/i,'RPA'],
    ];

    const found = new Set<string>();

    // Step 1 — collect named keywords that appear in text
    for (const [re, label] of NAMED) {
      if (re.test(text)) found.add(label);
    }

    // Step 2 — extract Title-Cased phrases (2-3 words) from requirements section
    const reqMatch = text.match(
      /(?:requirements?|qualifications?|you (have|will|must)|what we.re looking for|must[- ]have|key skills)[:\s]+([\s\S]*?)(?:\n\n|\n[A-Z]|responsibilities|benefits|about us|$)/i
    );
    const focusText = reqMatch ? reqMatch[2] ?? reqMatch[1] : text;

    // Title-cased 2-3 word noun phrases  e.g. "Financial Reporting", "Change Management"
    const phraseRe = /\b([A-Z][a-z]{2,})(?:\s+[A-Z][a-z]{2,}){1,2}\b/g;
    let m: RegExpExecArray | null;
    while ((m = phraseRe.exec(focusText)) !== null) {
      const phrase = m[0];
      const words = phrase.split(' ');
      if (!words.some(w => STOP.has(w.toLowerCase()))) {
        found.add(phrase);
      }
    }

    // Step 3 — single high-frequency domain words (length ≥ 4, appear ≥ 2×)
    const freq = new Map<string, number>();
    for (const w of (text.toLowerCase().match(/\b[a-z][a-z\-]{3,}\b/g) ?? [])) {
      if (!STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    const topWords = [...freq.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([w]) => w);

    for (const w of topWords) {
      const cap = w.charAt(0).toUpperCase() + w.slice(1);
      // Don't duplicate if a NAMED keyword already covers it
      if (![...found].some(k => k.toLowerCase() === w)) {
        found.add(cap);
      }
    }

    return [...found].slice(0, 35);
  }
}
