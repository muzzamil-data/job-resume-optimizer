/**
 * Paste Job Description view tests.
 *
 * Requires an authenticated session so we reach the main view first.
 * The "Paste JD" button in the main view navigates to the paste-job view.
 */
import { test, expect } from '../fixtures/authenticated';

test.describe('Paste Job Description view', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Navigate from main view to the paste-job view. Both entry points call
    // setView('paste-job'): "Paste JD" in the no-job-detected state, and the
    // "Edit job description" pencil once a job has been auto-detected. Use
    // whichever is present so the test is robust to detection timing.
    const pasteJd = authenticatedPage.getByRole('button', { name: /Paste JD/i });
    const editJob = authenticatedPage.locator('button[aria-label="Edit job description"]');
    await pasteJd.or(editJob).first().click();
    await authenticatedPage
      .locator('h3')
      .filter({ hasText: 'Paste Job Description' })
      .waitFor({ state: 'visible' });
  });

  // ── Structure ─────────────────────────────────────────────────────────────

  test('shows the correct heading', async ({ authenticatedPage }) => {
    await expect(
      authenticatedPage.locator('h3').filter({ hasText: 'Paste Job Description' }),
    ).toBeVisible();
  });

  test('Back button is present', async ({ authenticatedPage }) => {
    await expect(
      authenticatedPage.locator('button').filter({ hasText: /← Back/ }),
    ).toBeVisible();
  });

  // ── Label associations (accessibility) ───────────────────────────────────

  test('Job Title label is associated with its input', async ({ authenticatedPage }) => {
    const label = authenticatedPage.locator('label[for="paste-job-title"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Job Title');
  });

  test('Company label is associated with its input', async ({ authenticatedPage }) => {
    const label = authenticatedPage.locator('label[for="paste-job-company"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Company');
  });

  test('Job Description label is associated with its textarea', async ({
    authenticatedPage,
  }) => {
    const label = authenticatedPage.locator('label[for="paste-job-description"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Job Description');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  test('submit button is disabled when required fields are empty', async ({
    authenticatedPage,
  }) => {
    await expect(
      authenticatedPage.getByRole('button', { name: 'Use This Job Description' }),
    ).toBeDisabled();
  });

  test('submit button is disabled when only title is filled', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage
      .locator('#paste-job-title')
      .fill('Senior Software Engineer');
    await expect(
      authenticatedPage.getByRole('button', { name: 'Use This Job Description' }),
    ).toBeDisabled();
  });

  test('submit button is disabled when only description is filled', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage
      .locator('#paste-job-description')
      .fill('Looking for a great engineer with TypeScript experience.');
    await expect(
      authenticatedPage.getByRole('button', { name: 'Use This Job Description' }),
    ).toBeDisabled();
  });

  test('submit button enables when both required fields have values', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage
      .locator('#paste-job-title')
      .fill('Senior Software Engineer');
    await authenticatedPage
      .locator('#paste-job-description')
      .fill('Looking for a great engineer with TypeScript experience.');
    await expect(
      authenticatedPage.getByRole('button', { name: 'Use This Job Description' }),
    ).toBeEnabled();
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  test('Back button returns to main view', async ({ authenticatedPage }) => {
    await authenticatedPage
      .locator('button')
      .filter({ hasText: /← Back/ })
      .click();
    await expect(
      authenticatedPage.locator('text=Current Resume'),
    ).toBeVisible();
  });

  test('submitting valid data returns to main view', async ({ authenticatedPage }) => {
    await authenticatedPage
      .locator('#paste-job-title')
      .fill('Frontend Developer');
    await authenticatedPage
      .locator('#paste-job-description')
      .fill('We need a React developer with 3+ years of experience.');
    await authenticatedPage
      .getByRole('button', { name: 'Use This Job Description' })
      .click();
    // Should navigate back to main and show the job title
    await expect(
      authenticatedPage.locator('text=Frontend Developer'),
    ).toBeVisible({ timeout: 5_000 });
  });
});
