import AxeBuilder from '@axe-core/playwright';
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

async function expectNoWcagViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  expect(
    results.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    }))
  ).toEqual([]);
}

test.describe('bounded accessibility release gate', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`onboarding and current shell pass WCAG automated checks in ${theme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.evaluate((value) => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(value);
      }, theme);

      await expect(page.getByRole('dialog', { name: 'Welcome' })).toBeVisible();
      await expectNoWcagViolations(page);

      await closeOnboardingIfPresent(page);
      await expectNoWcagViolations(page);
    });
  }

  for (const route of CURRENT_ROUTES) {
    test(`${route.path} exposes its current surface without automated WCAG violations`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await closeOnboardingIfPresent(page);

      await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
      await expectNoWcagViolations(page);
    });
  }
});
