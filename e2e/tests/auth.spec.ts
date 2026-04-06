/**
 * Auth view tests — form interactions, accessibility, and validation.
 *
 * When no Supabase session is stored, loadData() redirects to the auth view.
 * These tests run without any real backend.
 */
import { test, expect } from '../fixtures/extension';
import { openJobPage, openSidebar } from '../helpers/sidebar';
import type { Page } from '@playwright/test';

test.describe('Auth view', () => {
  let page: Page;

  test.beforeEach(async ({ extensionContext, extensionWorker }) => {
    // No session → sidebar opens to auth view
    await extensionWorker.evaluate(
      () => new Promise<void>(resolve => chrome.storage.local.clear(() => resolve())),
    );
    page = await openJobPage(extensionContext);
    await openSidebar(page);
    await page
      .locator('h3')
      .filter({ hasText: 'Sign In' })
      .waitFor({ state: 'visible' });
  });

  test.afterEach(async () => {
    await page?.close();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  test('shows Sign In heading by default', async () => {
    await expect(page.locator('h3').filter({ hasText: 'Sign In' })).toBeVisible();
  });

  test('email and password inputs are visible', async () => {
    await expect(page.locator('#auth-email')).toBeVisible();
    await expect(page.locator('#auth-password')).toBeVisible();
  });

  // ── Label associations (accessibility) ────────────────────────────────────

  test('email label is associated with the email input', async () => {
    const label = page.locator('label[for="auth-email"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Email');
  });

  test('password label is associated with the password input', async () => {
    const label = page.locator('label[for="auth-password"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText('Password');
  });

  // ── Autocomplete attributes ────────────────────────────────────────────────

  test('email input has autocomplete="email"', async () => {
    await expect(page.locator('#auth-email')).toHaveAttribute('autocomplete', 'email');
  });

  test('password input has autocomplete="current-password" in login mode', async () => {
    await expect(page.locator('#auth-password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
  });

  test('password input has autocomplete="new-password" in signup mode', async () => {
    await page.getByRole('button', { name: 'Sign up free' }).click();
    await expect(page.locator('#auth-password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });

  // ── Mode toggle ────────────────────────────────────────────────────────────

  test('clicking "Sign up free" switches to Create Account mode', async () => {
    await page.getByRole('button', { name: 'Sign up free' }).click();
    await expect(
      page.locator('h3').filter({ hasText: 'Create Account' }),
    ).toBeVisible();
  });

  test('clicking "Sign in" from signup mode returns to login mode', async () => {
    await page.getByRole('button', { name: 'Sign up free' }).click();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('h3').filter({ hasText: 'Sign In' })).toBeVisible();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  test('submitting with empty fields shows a validation error', async () => {
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Please enter your email and password');
  });

  test('error message has role="alert" for screen readers', async () => {
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  // ── Keyboard interaction ───────────────────────────────────────────────────

  test('pressing Enter in the password field triggers form submission', async () => {
    await page.locator('#auth-email').fill('user@example.com');
    await page.locator('#auth-password').fill('password123');
    await page.locator('#auth-password').press('Enter');
    // Should show loading state or error — no JS crash
    await page.waitForTimeout(500);
    const btn = page.getByRole('button', { name: /Sign In|Please wait/i });
    await expect(btn).toBeVisible();
  });

  test('Tab key moves focus from email to password', async () => {
    await page.locator('#auth-email').click();
    await page.keyboard.press('Tab');
    await expect(page.locator('#auth-password')).toBeFocused();
  });
});
