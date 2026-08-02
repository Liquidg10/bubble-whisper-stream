import { expect, test } from '@playwright/test';

const CURRENT_ROUTES = [
  { path: '/', heading: 'Mind Manual' },
  { path: '/list', heading: 'List View' },
  { path: '/kanban', heading: 'Kanban Board' },
  { path: '/matrix', heading: 'Eisenhower Matrix' },
] as const;

async function closeOnboardingIfPresent(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: 'Welcome' });
  const onboardingAppeared = await dialog
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true, () => false);
  if (onboardingAppeared) {
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

async function seedZoomTask(page: import('@playwright/test').Page) {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('BubbleUniverse', 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['bubbles'], 'readwrite');
      const store = transaction.objectStore('bubbles');
      store.clear();
      store.put({
        id: 'zoom-geometry-e2e',
        type: 'Task',
        content: 'Zoom geometry task',
        createdAt: 1,
        updatedAt: 1,
        x: 80,
        y: 0,
        size: 1,
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

async function seedCapacityStressTasks(
  page: import('@playwright/test').Page,
) {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('BubbleUniverse', 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['bubbles'], 'readwrite');
      const store = transaction.objectStore('bubbles');
      store.clear();

      for (let index = 0; index < 40; index += 1) {
        const leadingPositions = [-100, 0, 100];
        store.put({
          id: `capacity-task-${String(index).padStart(2, '0')}`,
          type: 'Task',
          content: `Capacity task ${String(index + 1).padStart(2, '0')}`,
          createdAt: index + 1,
          updatedAt: index + 1,
          x: leadingPositions[index]
            ?? (((index % 7) - 3) * 54),
          y: index < leadingPositions.length
            ? 0
            : (Math.floor(index / 7) - 2) * 54,
          size: 0.35,
          tags: [],
          completed: false,
        });
      }

      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

async function seedAtomicDomainTasks(
  page: import('@playwright/test').Page,
) {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('BubbleUniverse', 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['bubbles'], 'readwrite');
      const store = transaction.objectStore('bubbles');
      store.clear();
      ['finance', 'work', 'health', 'relationships', 'personal']
        .forEach((domain, index) => store.put({
          id: `atomic-${domain}`,
          type: 'Task',
          content: `${domain} action`,
          createdAt: index + 1,
          updatedAt: index + 1,
          x: 0,
          y: 0,
          size: 0.5,
          tags: [{ id: `domain-${domain}`, name: domain }],
          completed: false,
          metadata: {
            canonicalTask: {
              schemaVersion: 1,
              type: 'task',
              completed: false,
              domainLinks: [{
                id: `confirmed-domain-${domain}`,
                domainId: domain,
                label: domain[0].toUpperCase() + domain.slice(1),
                userConfirmed: true,
                source: 'user',
                strength: 'primary',
                createdAt: index + 1,
                updatedAt: index + 1,
              }],
            },
          },
        }));

      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

async function closeMilestoneIfPresent(
  page: import('@playwright/test').Page,
) {
  const tryItNow = page.getByRole('button', { name: 'Try it now' });
  if (await tryItNow.isVisible().catch(() => false)) {
    await tryItNow.click();
    await expect(tryItNow).toBeHidden();
  }
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

async function bubbleAvoidsCanvasControls(
  page: import('@playwright/test').Page,
) {
  return page.evaluate(() => {
    const bubble = document.querySelector(
      '[data-task-id="coordinate-recovery-e2e"]',
    );
    const canvas = document.querySelector(
      '[aria-label="Adaptive Bubble view"]',
    );
    if (!bubble || !canvas) return false;
    const bubbleBox = bubble.getBoundingClientRect();
    const controls = Array.from(canvas.querySelectorAll(
      'button:not([data-adaptive-bubble]), input, select, summary, a[href]',
    )).filter((element) => {
      if (element.closest('details:not([open])') && element.tagName !== 'SUMMARY') {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return controls.every((control) => {
      const controlBox = control.getBoundingClientRect();
      return bubbleBox.right <= controlBox.left
        || bubbleBox.left >= controlBox.right
        || bubbleBox.bottom <= controlBox.top
        || bubbleBox.top >= controlBox.bottom;
    });
  });
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

  test('bubble zoom controls scale predictably and wheel zoom keeps its focal task anchored', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await closeOnboardingIfPresent(page);
    await seedZoomTask(page);
    await page.reload();
    await closeOnboardingIfPresent(page);
    await closeMilestoneIfPresent(page);

    const canvas = page.getByRole('region', { name: 'Adaptive Bubble view' });
    const bubble = page.locator('[data-task-id="zoom-geometry-e2e"]');
    const readInlineGeometry = () => bubble.evaluate((element) => {
      const style = (element as HTMLElement).style;
      const width = Number.parseFloat(style.width);
      return {
        centerX: Number.parseFloat(style.left) + (width / 2),
        width,
      };
    });

    await expect(canvas).toHaveAttribute('data-viewport-scale', '1');
    await expect(bubble).toBeVisible();
    const initial = await readInlineGeometry();

    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(canvas).toHaveAttribute('data-viewport-scale', '1.2');
    const zoomed = await readInlineGeometry();
    expect(zoomed.centerX - (await canvas.boundingBox())!.width / 2)
      .toBeCloseTo((initial.centerX - (await canvas.boundingBox())!.width / 2) * 1.2, 3);
    expect(zoomed.width).toBeCloseTo(initial.width * 1.2, 3);

    await page.getByRole('button', { name: 'Reset zoom' }).click();
    await expect(canvas).toHaveAttribute('data-viewport-scale', '1');
    await expect.poll(() => bubble.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        padding: computed.padding,
        inlineWidth: Number.parseFloat((element as HTMLElement).style.width),
        renderedWidth: element.getBoundingClientRect().width,
      };
    })).toEqual({
      padding: '0px',
      inlineWidth: 100,
      renderedWidth: 100,
    });
    const beforeWheel = await bubble.boundingBox();
    if (!beforeWheel) throw new Error('Zoom task has no visible bounds');
    const focalPoint = {
      x: beforeWheel.x + (beforeWheel.width / 2),
      y: beforeWheel.y + (beforeWheel.height / 2),
    };
    await page.mouse.move(focalPoint.x, focalPoint.y);
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => Number(
      await canvas.getAttribute('data-viewport-scale'),
    )).toBeGreaterThan(1);
    const afterWheel = await bubble.boundingBox();
    if (!afterWheel) throw new Error('Zoom task disappeared after wheel zoom');
    expect(afterWheel.x + (afterWheel.width / 2)).toBeCloseTo(focalPoint.x, 0);
    expect(afterWheel.y + (afterWheel.height / 2)).toBeCloseTo(focalPoint.y, 0);
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

  test('offscreen bubble coordinates render safely without rewriting task data', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await closeOnboardingIfPresent(page);
    await seedOffscreenBubble(page);

    await page.reload();
    await closeOnboardingIfPresent(page);

    const bubble = page.locator('[data-task-id="coordinate-recovery-e2e"]');
    await expect(bubble).toBeVisible();
    await expect.poll(() => bubbleIsInsideCanvas(page)).toBe(true);
    await expect.poll(() => bubbleAvoidsCanvasControls(page)).toBe(true);
    await expect.poll(() => readSavedBubblePosition(page)).toEqual({
      x: 10_000,
      y: -10_000,
    });

    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => bubbleIsInsideCanvas(page)).toBe(true);
    await expect.poll(() => bubbleAvoidsCanvasControls(page)).toBe(true);
    await expect.poll(() => readSavedBubblePosition(page)).toEqual({
      x: 10_000,
      y: -10_000,
    });
    await page.getByLabel('All tasks (1)').click();
    await expect(page.getByRole('button', {
      name: /^Open Recovered coordinate task/,
    })).toBeVisible();
  });

  test('mobile density respects viewport capacity while all tasks stay reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await closeOnboardingIfPresent(page);
    await seedCapacityStressTasks(page);

    await page.reload();
    await closeOnboardingIfPresent(page);
    await closeMilestoneIfPresent(page);

    const canvas = page.getByRole('region', { name: 'Adaptive Bubble view' });
    const layer = page.getByTestId('adaptive-bubble-layer');
    const bubbles = layer.locator('[data-adaptive-bubble]');

    const mobileViewControls = page.getByTestId(
      'adaptive-mobile-view-controls',
    );
    const mobileViewSummary = mobileViewControls.locator('summary');
    await expect(mobileViewSummary).toBeVisible();
    await mobileViewSummary.click();
    await expect(page.getByRole('button', {
      name: 'Change bubble density. Current density: medium',
    })).toBeVisible();
    const compactCanvasControls = mobileViewControls.locator('button');
    await expect(compactCanvasControls).toHaveCount(7);
    const compactControlSizes = await compactCanvasControls.evaluateAll(
      (controls) => controls.map((control) => {
        const rect = control.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
    expect(compactControlSizes.every(({ width, height }) => (
      width >= 44 && height >= 44
    ))).toBe(true);
    await mobileViewSummary.click();
    await expect(layer).toHaveAttribute('data-density-capacity', '2');
    await expect(layer).toHaveAttribute('data-density-limited', 'true');
    await expect(bubbles).toHaveCount(2);
    await expect(layer).toHaveAttribute('data-rendered-bubble-count', '2');

    await expect(bubbles.nth(0)).toHaveAttribute(
      'data-task-id',
      'capacity-task-00',
    );
    await expect(bubbles.nth(1)).toHaveAttribute(
      'data-task-id',
      'capacity-task-01',
    );
    const geometry = await page.evaluate(() => {
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const intersects = (
        first: ReturnType<typeof box>,
        second: ReturnType<typeof box>,
      ) => first.left < second.right
        && first.right > second.left
        && first.top < second.bottom
        && first.bottom > second.top;
      const bubbleElements = Array.from(document.querySelectorAll(
        '[data-adaptive-bubble]',
      ));
      const bubbleBoxes = bubbleElements.map(box);
      const controls = Array.from(document.querySelectorAll(
        'button:not([data-adaptive-bubble]), input, select, summary, a[href]',
      )).filter((element) => {
        if (element.closest('details:not([open])') && element.tagName !== 'SUMMARY') {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      let pairwiseOverlaps = 0;
      const controlOverlaps: Array<{ taskId: string | null; control: string }> = [];

      for (let first = 0; first < bubbleBoxes.length; first += 1) {
        for (let second = first + 1; second < bubbleBoxes.length; second += 1) {
          if (intersects(bubbleBoxes[first], bubbleBoxes[second])) {
            pairwiseOverlaps += 1;
          }
        }
        controls.forEach((control) => {
          if (intersects(bubbleBoxes[first], box(control))) {
            controlOverlaps.push({
              taskId: bubbleElements[first].getAttribute('data-task-id'),
              control: control.getAttribute('aria-label')
                ?? control.textContent?.trim().slice(0, 40)
                ?? control.tagName,
            });
          }
        });
      }

      return { pairwiseOverlaps, controlOverlaps };
    });

    expect(geometry).toEqual({
      pairwiseOverlaps: 0,
      controlOverlaps: [],
    });
    await expect(canvas.getByLabel('All tasks (40)')).toBeVisible();
    await canvas.getByLabel('All tasks (40)').click();
    await expect(canvas.getByRole('list', {
      name: 'All tasks by current readiness',
    }).getByRole('button')).toHaveCount(40);
  });

  test('Atomic mobile overview keeps every life domain operable without control occlusion', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await closeOnboardingIfPresent(page);
    await seedAtomicDomainTasks(page);
    await page.reload();
    await closeOnboardingIfPresent(page);
    await closeMilestoneIfPresent(page);
    await page.getByRole('button', { name: 'Atomic view mode' }).click();

    const atomic = page.getByRole('region', {
      name: 'Atomic view (experimental)',
    });
    await expect(atomic).toBeVisible();
    await expect(page.getByTestId('atomic-overview-hint')).toBeAttached();
    await expect(atomic.locator('[data-electron]')).toHaveCount(0);
    const molecules = atomic.locator('[data-molecule]');
    await expect(molecules).toHaveCount(5);
    await expect.poll(() => molecules.evaluateAll((targets) => (
      targets.every((target) => {
        const rect = target.getBoundingClientRect();
        const centerX = rect.left + (rect.width / 2);
        const centerY = rect.top + (rect.height / 2);
        return rect.width >= 44
          && rect.width <= 64
          && rect.height >= 44
          && rect.height <= 64
          && centerX >= 0
          && centerX <= window.innerWidth
          && centerY >= 0
          && centerY <= window.innerHeight;
      })
    ))).toBe(true);

    const geometry = await page.evaluate(() => {
      const targetElements = Array.from(document.querySelectorAll<HTMLElement>(
        '[data-molecule]',
      ));
      const controls = Array.from(document.querySelectorAll<HTMLElement>(
        'summary, [data-shell-control] > button',
      )).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const overlaps = (first: DOMRect, second: DOMRect) => (
        first.left < second.right
        && first.right > second.left
        && first.top < second.bottom
        && first.bottom > second.top
      );

      return targetElements.map((target) => {
        const rect = target.getBoundingClientRect();
        const topElement = document.elementFromPoint(
          rect.left + (rect.width / 2),
          rect.top + (rect.height / 2),
        );
        return {
          width: rect.width,
          height: rect.height,
          padding: getComputedStyle(target).padding,
          centerOperable: topElement?.closest('[data-molecule]') === target,
          controlOverlaps: controls.filter(control => (
            overlaps(rect, control.getBoundingClientRect())
          )).length,
        };
      });
    });

    expect(geometry.map(({ padding }) => padding)).toEqual(
      Array.from({ length: 5 }, () => '0px'),
    );
    expect(geometry.map(({ width, height }) => (
      width >= 44 && height >= 44
    ))).toEqual(Array.from({ length: 5 }, () => true));
    expect(geometry.map(({ centerOperable }) => centerOperable)).toEqual(
      Array.from({ length: 5 }, () => true),
    );
    expect(geometry.map(({ controlOverlaps }) => controlOverlaps)).toEqual(
      Array.from({ length: 5 }, () => 0),
    );

    await page.getByText('Tasks (5)', { exact: true }).click();
    await expect(page.getByRole('list', {
      name: 'Atomic tasks by life domain and time horizon',
    }).getByRole('button')).toHaveCount(5);
  });

  test('unknown routes report an honest not-found state', async ({ page }) => {
    await page.goto('/route-that-does-not-exist');
    await closeOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
  });
});
