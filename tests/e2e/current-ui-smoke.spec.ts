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

async function seedOffscreenBubble(page: import('@playwright/test').Page) {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('BubbleUniverse', 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['bubbles'], 'readwrite');
      transaction.objectStore('bubbles').put({
        id: 'coordinate-recovery-e2e',
        type: 'Task',
        content: 'Recovered coordinate task',
        createdAt: 1,
        updatedAt: 1,
        x: 10_000,
        y: -10_000,
        size: 0.5,
        tags: [],
        completed: false,
      });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

async function readSavedBubblePosition(
  page: import('@playwright/test').Page,
) {
  return page.evaluate(() => new Promise<{ x: number; y: number } | null>(
    (resolve, reject) => {
      const request = indexedDB.open('BubbleUniverse', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(['bubbles'], 'readonly');
        const getRequest = transaction.objectStore('bubbles')
          .get('coordinate-recovery-e2e');
        getRequest.onsuccess = () => {
          const bubble = getRequest.result as { x: number; y: number } | undefined;
          database.close();
          resolve(bubble ? { x: bubble.x, y: bubble.y } : null);
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
    },
  ));
}

async function bubbleIsInsideCanvas(page: import('@playwright/test').Page) {
  const canvas = page.getByRole('region', { name: 'Adaptive Bubble view' });
  const bubble = page.locator('[data-task-id="coordinate-recovery-e2e"]');
  const [canvasBox, bubbleBox] = await Promise.all([
    canvas.boundingBox(),
    bubble.boundingBox(),
  ]);

  if (!canvasBox || !bubbleBox) return false;
  const tolerance = 1;
  return bubbleBox.x >= canvasBox.x - tolerance
    && bubbleBox.y >= canvasBox.y - tolerance
    && bubbleBox.x + bubbleBox.width
      <= canvasBox.x + canvasBox.width + tolerance
    && bubbleBox.y + bubbleBox.height
      <= canvasBox.y + canvasBox.height + tolerance;
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

  test('saved bubble coordinates recover across mobile resize and orientation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await closeOnboardingIfPresent(page);
    await seedOffscreenBubble(page);

    await page.reload();
    await closeOnboardingIfPresent(page);

    const bubble = page.locator('[data-task-id="coordinate-recovery-e2e"]');
    await expect(bubble).toBeVisible();
    await expect.poll(() => bubbleIsInsideCanvas(page)).toBe(true);
    await expect.poll(async () => {
      const position = await readSavedBubblePosition(page);
      return position !== null
        && position.x !== 10_000
        && position.y !== -10_000;
    }).toBe(true);

    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => bubbleIsInsideCanvas(page)).toBe(true);
    await page.getByText('All tasks (1)').click();
    await expect(page.getByRole('button', {
      name: /^Open Recovered coordinate task/,
    })).toBeVisible();
  });

  test('unknown routes report an honest not-found state', async ({ page }) => {
    await page.goto('/route-that-does-not-exist');
    await closeOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
  });
});
