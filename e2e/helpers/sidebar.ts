/**
 * Helpers for opening the sidebar in tests.
 *
 * The sidebar is injected as a Shadow DOM into the host page.
 * Playwright automatically pierces open shadow roots so standard
 * locators work inside the shadow tree without any special handling.
 */
import { type BrowserContext, type Page } from '@playwright/test';

/** A fake job posting URL — contains "jobs" so the indicator appears. */
export const JOB_PAGE_URL =
  'https://careers.example-test.com/jobs/software-engineer-123';

const JOB_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Software Engineer – Acme Corp</title>
</head>
<body>
  <h1>Software Engineer</h1>
  <section>
    <h2>About the Role</h2>
    <p>We are looking for a Software Engineer with 3+ years of experience in
       TypeScript, React, and Node.js to join our growing team.</p>
    <h2>Requirements</h2>
    <ul>
      <li>3+ years of TypeScript / JavaScript experience</li>
      <li>Proficiency with React and modern frontend tooling</li>
      <li>Familiarity with REST APIs and cloud infrastructure</li>
    </ul>
  </section>
</body>
</html>`;

/**
 * Open a new page at the fake job URL (served locally via route interception).
 * The content script injects because the URL matches https:/‌/‌*\/*.
 * The "jobs" keyword in the path triggers the floating job-page indicator.
 */
export async function openJobPage(extensionContext: BrowserContext): Promise<Page> {
  const page = await extensionContext.newPage();
  await page.route(JOB_PAGE_URL, route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: JOB_PAGE_HTML,
    }),
  );
  await page.goto(JOB_PAGE_URL, { waitUntil: 'domcontentloaded' });
  return page;
}

/**
 * Click the floating job-page indicator to open the sidebar, then wait for
 * the React header to appear inside the shadow host.
 */
export async function openSidebar(page: Page): Promise<void> {
  const indicator = page.locator('#job-optimizer-indicator');
  await indicator.waitFor({ state: 'visible', timeout: 10_000 });
  await indicator.click();
  // Playwright pierces open shadow roots — this locator works inside the shadow tree.
  await page
    .locator('h2')
    .filter({ hasText: 'Resume Optimizer' })
    .waitFor({ state: 'visible', timeout: 10_000 });
}
