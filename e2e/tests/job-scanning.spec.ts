import { expect, test } from '../fixtures/extension';
import { openJobPage, openSidebar } from '../helpers/sidebar';

test.describe('job description scanning', () => {
  test.beforeEach(async ({ extensionWorker }) => {
    await extensionWorker.evaluate(async () => {
      await Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]);
      await chrome.storage.local.set({ userSettings: { onboardingCompleted: true, autoDetectJob: true } });
    });
  });

  test('manual re-scan is not suppressed by the initial automatic scan', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);
    await expect(page.getByText('Job Detected')).toBeVisible();

    await page.evaluate(() => {
      const title = document.querySelector('.job-details-jobs-unified-top-card__job-title h1');
      const description = document.querySelector('#job-details');
      if (title) title.textContent = 'Senior Platform Engineer';
      if (description) description.textContent =
        'Lead platform engineering for distributed cloud services. Requirements include Kubernetes, TypeScript, observability, incident response, and close partnership with product teams. Build reliable systems used by customers around the world.';
    });
    await page.getByRole('button', { name: 'Re-scan page for job description' }).click();

    await expect(page.locator('#tailorcv-root').getByText('Senior Platform Engineer')).toBeVisible();
    await page.close();
  });

  test('SPA navigation discards the previous job and automatically scans the new URL', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);
    const sidebar = page.locator('#tailorcv-root');
    await expect(sidebar.getByText('Software Engineer', { exact: true })).toBeVisible();

    await page.evaluate(() => {
      history.pushState({}, '', '/jobs/view/data-engineer-456');
      const title = document.querySelector('.job-details-jobs-unified-top-card__job-title h1');
      const description = document.querySelector('#job-details');
      if (title) title.textContent = 'Data Engineer';
      if (description) description.textContent =
        'Build dependable data platforms and batch pipelines for analytics teams. Requirements include Python, SQL, cloud infrastructure, data modeling, monitoring, testing, and collaboration with product stakeholders.';
    });

    await expect(sidebar.getByText('Data Engineer', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByText('Software Engineer', { exact: true })).toBeHidden();
    await page.close();
  });

  test('manual scan surfaces missing provider configuration when DOM extraction fails', async ({ extensionContext }) => {
    const page = await openJobPage(extensionContext);
    await openSidebar(page);
    await expect(page.getByText('Job Detected')).toBeVisible();

    await page.evaluate(() => {
      document.querySelectorAll('#job-details, .job-details-jobs-unified-top-card__job-title').forEach(node => node.remove());
      document.body.insertAdjacentHTML('afterbegin', '<h1>Careers</h1><div>We are hiring and invite qualified candidates to apply for this position. Responsibilities and requirements are described on this careers page. The successful candidate will work with our team and contribute to customer projects while collaborating across the company.</div>');
    });
    await page.getByRole('button', { name: 'Re-scan page for job description' }).click();

    await expect(page.getByRole('alert')).toContainText('Add your API key in Settings', { timeout: 10_000 });
    await page.close();
  });
});
