import { expect, test } from '@playwright/test';
import { prepareOutboundFixture, readOutboundFixture } from '../helpers/calendar-outbound-fixture';

const CURRENT_ROUTES = [
  { path: '/', heading: 'Mind Manual' },
  { path: '/list', heading: 'List View' },
  { path: '/kanban', heading: 'Kanban Board' },
  { path: '/matrix', heading: 'Eisenhower Matrix' },
] as const;

for (const outcome of ['written', 'lost', 'disabled'] as const) {
  test(`synthetic reviewed Calendar update: ${outcome}`, async ({ page }, testInfo) => {
    const fixture = await prepareOutboundFixture(page, outcome);
    await closeOnboardingIfPresent(page);
    await page.getByRole('tab', { name: 'Updates', exact: true }).click();
    expect(fixture.calls).toEqual([]);
    await page.getByRole('button', { name: 'Refresh linked tasks', exact: true }).click();
    await expect(page.getByText('Linked tasks in this list: 1', { exact: true })).toBeVisible();
    expect(fixture.calls).toEqual([]);
    await page.getByRole('button', { name: 'Review calendar update for linked task 1', exact: true }).click();
    if (outcome === 'disabled') {
      await expect(page.getByText('Reviewed Google updates are not enabled on this server. No update was sent.', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Confirm Google Calendar update', exact: true })).toHaveCount(0);
      expect(fixture.calls).toHaveLength(1);
    } else {
      await expect(page.getByRole('cell', { name: 'Title before', exact: true })).toHaveText('Synthetic provider title');
      await expect(page.getByRole('cell', { name: 'Title after', exact: true })).toHaveText(fixture.bubble.content);
      await page.setViewportSize({ width: 1280, height: 1200 });
      await page.getByRole('heading', { name: 'Review all calendar fields', exact: true }).scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: 'Confirm Google Calendar update', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`calendar-outbound-${outcome}-review.png`), fullPage: true });
      await page.getByRole('button', { name: 'Confirm Google Calendar update', exact: true }).click();
      if (outcome === 'written') {
        await expect(page.getByText('Google Calendar update confirmed. Saved task contents remain unchanged. Refresh linked tasks to inspect the current state.', { exact: true })).toBeVisible();
      } else {
        await expect(page.getByText('The Google Calendar outcome is unconfirmed and may have changed. This task needs outcome review; do not retry the update.', { exact: true })).toBeVisible();
        await page.reload();
        await closeOnboardingIfPresent(page);
        await page.getByRole('tab', { name: 'Updates', exact: true }).click();
        await page.getByRole('button', { name: 'Refresh linked tasks', exact: true }).click();
        await expect(page.getByText('This task needs outcome review. Do not retry the update.', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Review calendar update for linked task 1', exact: true })).toBeDisabled();
      }
      expect(fixture.calls).toHaveLength(2);
      expect(fixture.calls[1].action).toBe('confirm_reviewed_update');
      expect(fixture.calls[1].operationId).toBe(fixture.calls[0].operationId);
    }
    const saved = await readOutboundFixture(page, fixture.owner, fixture.taskId);
    expect(saved.row).toEqual(fixture.bubble);
    expect(saved.envelope).toEqual(fixture.envelope);
    if (outcome === 'disabled') expect(saved.journal).toBeNull();
    else expect(saved.journal.receipts[0].outcome).toBe(outcome === 'written' ? 'written' : 'pending');
    expect(fixture.errors).toEqual([]);
  });
}

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

  test('signed-out calendar sync is visible but cannot start work', async ({ page }, testInfo) => {
    // Isolated unauthenticated UI proof; do not contact hosted services.
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/calendar');
    await closeOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: 'Local Calendar Status', exact: true })).toBeVisible();
    await expect(page.getByText('Google writes', { exact: true })).toBeVisible();
    await expect(page.getByText('Not verified', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Calendar Sync Manager', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Full Sync', exact: true })).toBeDisabled();
    await expect(page.getByText('Sign in and wait for the calendar manager to be ready for your account.')).toBeVisible();
    await expect(page.getByText('Calendar imports update owned local tasks only. Outbound calendar changes are sent only after explicit review and confirmation in Updates.')).toBeVisible();
    await page.getByRole('tab', { name: 'Updates', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Refresh linked tasks', exact: true })).toBeDisabled();
    await page.getByRole('heading', { name: 'Calendar Sync Manager', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('calendar-sync-signed-out.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('unknown routes report an honest not-found state', async ({ page }) => {
    await page.goto('/route-that-does-not-exist');
    await closeOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
  });

  for (const changeAfterReview of [false, true]) {
    test(`synthetic signed-in recovery ${changeAfterReview ? 'preserves a hold when the saved task changes' : 'restores only the verified saved link'}`, async ({ page }, testInfo) => {
      // Real built application + IndexedDB + Web Locks; auth and metadata are
      // synthetic route responses. No request may reach a hosted service.
      const owner = '11111111-1111-4111-8111-111111111111';
      const account = '33333333-3333-4333-8333-333333333333';
      const eventId = 'browser-recovery-event';
      const calendar = { startTime: '2030-01-01T10:00:00.000Z', durationMin: 60, calendarId: account };
      const provenance = { userId: owner, calendarImport: { calendarAccountId: account, eventId } };
      const bubble = { id: 'browser-recovery-task', content: 'Synthetic saved calendar task', type: 'Task',
        x: 0, y: 0, size: 0.5, tags: [], completed: false, createdAt: 1, updatedAt: 2,
        metadata: { ...provenance, calendar, canonicalTask: { schemaVersion: 1, type: 'event', completed: false,
          metadata: provenance, view: { calendar } } } };
      const event = { user_id: owner, calendar_account_id: account, external_event_id: eventId, title: bubble.content,
        start_time: calendar.startTime, end_time: '2030-01-01T11:00:00.000Z', location: null, description: null };
      const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test',
        email_confirmed_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z', app_metadata: {}, user_metadata: {}, identities: [] };
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const syntheticToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: expiry })}.synthetic-not-a-valid-signature`;
      await page.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
        if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
          return route.fulfill({ json: { access_token: syntheticToken, token_type: 'bearer', expires_in: 3600, expires_at: expiry, refresh_token: 'synthetic-local-only-refresh', user } });
        }
        if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return route.fulfill({ json: user });
        if (url.pathname.startsWith('/rest/v1/') && request.method() === 'GET') {
          const single = request.headers().accept?.includes('vnd.pgrst.object');
          const row = url.pathname.endsWith('/calendar_accounts') ? { id: account, user_id: owner, sync_enabled: true } : url.pathname.endsWith('/calendar_events') ? event : null;
          return route.fulfill({ json: single ? row : row ? [row] : [] });
        }
        return route.abort();
      });
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto('/login');
      await closeOnboardingIfPresent(page);
      await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
      await page.getByLabel('Password', { exact: true }).fill('synthetic-local-password');
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await closeOnboardingIfPresent(page);
      const storageKey = `calendar-task-sync:v1:${owner}`;
      await page.evaluate(async ({ bubble, storageKey, owner, account, eventId }) => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('BubbleUniverse', 4);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('bubbles', 'readwrite');
            tx.objectStore('bubbles').put(bubble);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => { db.close(); reject(new Error('Synthetic seed failed')); };
          };
        });
        localStorage.setItem(storageKey, JSON.stringify({ version: 1, ownerUserId: owner, mappings: [], conflicts: [], unresolvedOperations: [JSON.stringify([account, eventId])] }));
      }, { bubble, storageKey, owner, account, eventId });
      await page.goto('/calendar');
      await closeOnboardingIfPresent(page);
      await page.getByRole('tab', { name: 'Recovery', exact: true }).click();
      await page.getByRole('button', { name: 'Refresh recovery list', exact: true }).click();
      await expect(page.getByText('Known unresolved imports in this list: 1')).toBeVisible();
      await page.getByRole('button', { name: 'Review saved task link for unresolved import 1', exact: true }).click();
      await expect(page.getByText('Saved task: Synthetic saved calendar task', { exact: true })).toBeVisible();
      if (changeAfterReview) {
        await page.evaluate(async bubble => {
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('BubbleUniverse', 4);
            request.onsuccess = () => {
              const db = request.result; const tx = db.transaction('bubbles', 'readwrite');
              tx.objectStore('bubbles').put({ ...bubble, updatedAt: 99, content: 'Synthetic changed task' });
              tx.oncomplete = () => { db.close(); resolve(); };
              tx.onabort = () => reject(new Error('Synthetic edit failed'));
            };
          });
        }, bubble);
      }
      await page.getByRole('button', { name: 'Restore saved task link', exact: true }).click();
      if (changeAfterReview) {
        await expect(page.getByText('Recovery was not confirmed. The hold is preserved; review the saved task again.', { exact: true })).toBeVisible();
      } else {
        await expect(page.getByText('Saved task link restored. The existing task and its content were preserved. No Google calendar changes were sent.', { exact: true })).toBeVisible();
      }
      const result = await page.evaluate(async ({ storageKey, taskId }) => {
        const row = await new Promise<unknown>((resolve, reject) => {
          const request = indexedDB.open('BubbleUniverse', 4);
          request.onsuccess = () => {
            const db = request.result; const tx = db.transaction('bubbles', 'readonly');
            const read = tx.objectStore('bubbles').get(taskId);
            tx.oncomplete = () => { db.close(); resolve(read.result); };
            tx.onabort = () => reject(new Error('Synthetic read failed'));
          };
        });
        return { row, envelope: JSON.parse(localStorage.getItem(storageKey)!) };
      }, { storageKey, taskId: bubble.id });
      expect(result.row).toEqual(changeAfterReview ? { ...bubble, updatedAt: 99, content: 'Synthetic changed task' } : bubble);
      expect(result.envelope.unresolvedOperations).toHaveLength(changeAfterReview ? 1 : 0);
      expect(result.envelope.mappings).toHaveLength(changeAfterReview ? 0 : 1);
      await page.getByRole('heading', { name: 'Recover a saved calendar import link', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`calendar-recovery-${changeAfterReview ? 'held' : 'restored'}.png`), fullPage: true });
      expect(pageErrors).toEqual([]);
    });
  }
});
