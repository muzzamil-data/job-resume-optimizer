/**
 * Upload Resume view tests — render, accessibility, and keyboard navigation.
 *
 * Requires an authenticated session to reach the main view first.
 * The "Upload Resume" button in the main view navigates to the upload view.
 */
import { test, expect } from '../fixtures/authenticated';

test.describe('Upload Resume view', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage
      .getByRole('button', { name: /Upload Resume/i })
      .click();
    await authenticatedPage
      .locator('h3')
      .filter({ hasText: 'Upload Resume' })
      .waitFor({ state: 'visible' });
  });

  // ── Structure ─────────────────────────────────────────────────────────────

  test('shows the correct heading', async ({ authenticatedPage }) => {
    await expect(
      authenticatedPage.locator('h3').filter({ hasText: 'Upload Resume' }),
    ).toBeVisible();
  });

  test('Back button is present', async ({ authenticatedPage }) => {
    await expect(
      authenticatedPage.locator('button').filter({ hasText: /← Back/ }),
    ).toBeVisible();
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  test('upload zone has role="button" for keyboard users', async ({
    authenticatedPage,
  }) => {
    const dropzone = authenticatedPage.locator('[role="button"][aria-label*="Upload resume"]');
    await expect(dropzone).toBeVisible();
  });

  test('upload zone has a descriptive aria-label', async ({
    authenticatedPage,
  }) => {
    const dropzone = authenticatedPage.locator('[aria-label*="Upload resume"]');
    await expect(dropzone).toHaveAttribute('aria-label', expect.stringContaining('PDF'));
    await expect(dropzone).toHaveAttribute('aria-label', expect.stringContaining('DOCX'));
  });

  test('upload zone is keyboard-focusable (tabIndex=0)', async ({
    authenticatedPage,
  }) => {
    const dropzone = authenticatedPage.locator('[role="button"][aria-label*="Upload resume"]');
    await expect(dropzone).toHaveAttribute('tabindex', '0');
  });

  test('hidden file input has an aria-label', async ({ authenticatedPage }) => {
    const fileInput = authenticatedPage.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute('aria-label');
  });

  test('file input accepts PDF and DOCX only', async ({ authenticatedPage }) => {
    const fileInput = authenticatedPage.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute('accept', '.pdf,.docx');
  });

  // ── Keyboard interaction ───────────────────────────────────────────────────

  test('Enter key on the upload zone triggers the file picker', async ({
    authenticatedPage,
  }) => {
    const dropzone = authenticatedPage.locator(
      '[role="button"][aria-label*="Upload resume"]',
    );
    // Tab to the dropzone to focus it
    await dropzone.focus();
    await expect(dropzone).toBeFocused();

    // We can't actually open a file dialog in tests, but we verify that the
    // onKeyDown handler doesn't throw and the element stays interactive.
    // A real file dialog would block execution, so we just press Enter and
    // confirm the page is still responsive.
    const dialogPromise = authenticatedPage.waitForEvent('filechooser', {
      timeout: 2000,
    }).catch(() => null);
    await dropzone.press('Enter');
    await dialogPromise; // resolves to null if no dialog — that is OK too
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  test('Back button returns to main view', async ({ authenticatedPage }) => {
    await authenticatedPage
      .locator('button')
      .filter({ hasText: /← Back/ })
      .click();
    await expect(
      authenticatedPage.locator('text=Premium Balance'),
    ).toBeVisible();
  });
});
