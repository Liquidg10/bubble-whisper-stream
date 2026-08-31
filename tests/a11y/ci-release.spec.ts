import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const CURRENT_ROUTES = [
  { path: '/', heading: 'Mind Manual' },
  { path: '/list', heading: 'List View' },
  { path: '/kanban', heading: 'Kanban Board' },
  { path: '/matrix', heading: 'Eisenhower Matrix' },
] as const;

async function closeFirstRunOnboarding(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: 'Welcome' });
  // Every test starts with a fresh profile. Startup now imports the app lazily,
  // and onboarding also checks IndexedDB asynchronously, so network idle does
  // not establish that the expected first-run dialog has appeared.
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

async function expectNoWcagViolations(page: import('@playwright/test').Page) {
  // Scan the rendered endpoint of entrance/theme transitions, not an opacity
  // blend mid-animation. This observes CSS and Framer Motion's Web Animations
  // without cancelling them or excluding any elements from the axe scan.
  await page.waitForFunction(() => document.getAnimations().every((animation) => (
    animation.playState !== 'running'
    || !Number.isFinite(animation.effect?.getComputedTiming().endTime)
  )), undefined, { timeout: 5_000 });

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
      await expect(page.getByRole('dialog', { name: 'Welcome' })).toBeVisible();
      await page.evaluate((value) => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(value);
      }, theme);

      await expect(page.getByRole('dialog', { name: 'Welcome' })).toBeVisible();
      await expectNoWcagViolations(page);

      await closeFirstRunOnboarding(page);
      await expectNoWcagViolations(page);
    });
  }

  for (const route of CURRENT_ROUTES) {
    test(`${route.path} exposes its current surface without automated WCAG violations`, async ({ page }) => {
      await page.goto(route.path);
      await closeFirstRunOnboarding(page);

      await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
      await expectNoWcagViolations(page);
    });
  }

  test('first-run onboarding announces steps and exposes editable choices at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const requestCounter = { count: 0 };
      Object.defineProperty(window, '__wp03MicRequestCounter', {
        value: requestCounter,
        configurable: true,
      });

      const mediaDevices = navigator.mediaDevices ?? {};
      Object.defineProperty(mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          requestCounter.count += 1;
          throw new DOMException('Blocked by WP03 test', 'NotAllowedError');
        },
      });
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: mediaDevices,
        });
      }
    });

    await page.goto('/');

    const dialog = page.getByRole('dialog');
    const status = dialog.getByRole('status');
    await expect(status).toHaveText('Step 1 of 5: Welcome');

    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(status).toHaveText('Step 2 of 5: Basic Info');

    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(status).toHaveText('Step 3 of 5: Daily Routine');
    await dialog.getByRole('button', { name: 'Add Routine' }).click();
    await expect(dialog.getByRole('textbox', {
      name: 'Routine 1',
      exact: true,
    })).toBeVisible();
    await expect(dialog.getByRole('textbox', {
      name: 'Time for routine 1 (optional)',
    })).toBeVisible();
    await expectNoWcagViolations(page);

    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(status).toHaveText('Step 4 of 5: Goals & Challenges');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(status).toHaveText('Step 5 of 5: Communication Style');

    const group = dialog.getByRole('radiogroup', {
      name: 'How do you prefer encouragement and reminders?',
    });
    const preferred = group.getByRole('radio', { name: 'Warm and supportive' });
    const alternative = group.getByRole('radio', {
      name: 'Motivating and encouraging',
    });
    await preferred.click();
    await expect(preferred).toHaveAttribute('aria-checked', 'true');
    await expect(alternative).toHaveAttribute('aria-checked', 'false');

    const overflowingLabels = await group.getByRole('radio').evaluateAll(
      (options) => options
        .filter((option) => option.scrollWidth > option.clientWidth)
        .map((option) => option.textContent?.trim()),
    );
    expect(overflowingLabels).toEqual([]);
    await expectNoWcagViolations(page);

    await page.evaluate(() => {
      const chords = [
        { ctrlKey: true },
        { altKey: true },
        { metaKey: true },
        { shiftKey: true },
      ];
      chords.forEach((modifier) => {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          code: 'Space',
          ...modifier,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
          bubbles: true,
          code: 'Space',
          ...modifier,
        }));
      });
      document.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        code: 'Space',
      }));
      document.dispatchEvent(new KeyboardEvent('keyup', {
        bubbles: true,
        code: 'Space',
      }));
    });

    await expect.poll(() => page.evaluate(() => (
      (window as Window & {
        __wp03MicRequestCounter?: { count: number };
      }).__wp03MicRequestCounter?.count ?? -1
    ))).toBe(0);
  });
});
