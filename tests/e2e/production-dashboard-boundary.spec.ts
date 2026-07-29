import { expect, test } from '@playwright/test';

async function closeOnboardingIfPresent(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: 'Welcome' });
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
}

test('production dashboard exposes an inert CI-receipt boundary in the browser', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/dev/production');
  await page.waitForLoadState('networkidle');
  await closeOnboardingIfPresent(page);

  await expect(page.getByRole('heading', { name: 'Production Dashboard' })).toBeVisible();
  await expect(
    page.getByText('browser clients cannot execute the P20 Playwright suite', { exact: false })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Create Deployment Plan' }).click();
  const receiptButtons = page.getByRole('button', { name: 'CI receipt required' });
  await expect(receiptButtons).toHaveCount(2);
  for (const button of await receiptButtons.all()) {
    await expect(button).toBeDisabled();
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => /child_process|execSync/i.test(message))).toEqual([]);
});
