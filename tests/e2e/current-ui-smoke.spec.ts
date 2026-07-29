import { expect, test } from '@playwright/test';

const CURRENT_ROUTES = [
  { path: '/', heading: 'Mind Manual' },
  { path: '/list', heading: 'List View' },
  { path: '/kanban', heading: 'Kanban Board' },
  { path: '/matrix', heading: 'Eisenhower Matrix' },
] as const;

async function closeOnboardingIfPresent(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: 'Welcome' });
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
}

test.describe('current UI smoke gate', () => {
  test('canonical routes render their current surfaces without page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    for (const route of CURRENT_ROUTES) {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await closeOnboardingIfPresent(page);
      await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: '404', exact: true })).toHaveCount(0);
    }

    expect(pageErrors).toEqual([]);
  });

  test('List keyboard help remains operable without mutating task data', async ({ page }) => {
    await page.goto('/list');
    await closeOnboardingIfPresent(page);

    const shortcutsButton = page.getByRole('button', { name: 'Show keyboard shortcuts' });
    await shortcutsButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeVisible();
    await page.getByRole('button', { name: 'Got it!' }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeHidden();
  });

  test('reduced motion keeps the canvas meaningful and operable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await closeOnboardingIfPresent(page);

    await expect(page.getByRole('heading', { name: 'Mind Manual' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  });

  test('mobile root does not introduce horizontal document overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await closeOnboardingIfPresent(page);

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  test('unknown routes report an honest not-found state', async ({ page }) => {
    await page.goto('/route-that-does-not-exist');
    await closeOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
  });
});
