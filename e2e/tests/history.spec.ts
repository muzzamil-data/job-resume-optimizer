/**
 * Application History view tests.
 *
 * Requires an authenticated session.
 * The "History" button in the main view navigates to this view.
 */
import { test, expect } from '../fixtures/authenticated';

test.describe('Application History view', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage
      .getByRole('button', { name: 'History' })
      .click();
    await authenticatedPage
      .locator('h3')
      .filter({ hasText: 'Application History' })
      .waitFor({ state: 'visible' });
  });

  test('shows correct heading', async ({ authenticatedPage }) => {
    await expect(
      authenticatedPage.locator('h3').filter({ hasText: 'Application History' }),
    ).toBeVisible();
  });

  test('shows empty-state message when no applications exist', async ({
    authenticatedPage,
  }) => {
    await expect(
      authenticatedPage.locator('text=No applications yet'),
    ).toBeVisible();
  });

  test('empty state includes guidance copy', async ({ authenticatedPage }) => {
    await expect(
      authenticatedPage.locator('text=After you optimize a resume and apply'),
    ).toBeVisible();
  });

  test('shows application count (0 when empty)', async ({ authenticatedPage }) => {
    await expect(
      authenticatedPage.locator('text=0 applications tracked'),
    ).toBeVisible();
  });

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
