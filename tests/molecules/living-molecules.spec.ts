import { expect, test, type Page } from '@playwright/test';

async function savedBubbles(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('BubbleUniverse');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction('bubbles').objectStore('bubbles').getAll();
      return await new Promise<
        Array<{
          id: string;
          content: string;
          caption?: string;
          completed?: boolean;
          x: number;
          y: number;
          tags: { name: string }[];
          metadata?: { bubbleGarden?: { sourceTaskId?: string } };
        }>
      >((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}

test.beforeEach(async ({ page }) => {
  // Fresh anonymous contexts; no external provider calls or personal fixtures.
  await page.route('https://**/*', (route) => route.abort());
});

test('playable launch, local suggestions, details and reload keep one connected task model', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Small actions. Connected possibilities.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Welcome', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('welcome.png') });
  await page
    .getByRole('button', { name: 'Start with 3 guide bubbles' })
    .click();
  await expect.poll(async () => (await savedBubbles(page)).length).toBe(3);
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  const guide = page.getByRole('dialog', { name: 'A small beginning' });
  await expect(
    guide.getByRole('button', { name: 'Open', exact: true }),
  ).toHaveCount(3);
  await guide
    .getByRole('button', { name: 'Open', exact: true })
    .first()
    .click();
  await expect(page.getByLabel('Notes & small steps')).toHaveValue(/Drag me/);
  await page
    .getByRole('combobox', { name: 'Time horizon', exact: true })
    .selectOption('week');
  await page.getByLabel('Notes & small steps').fill('My own guide note');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect
    .poll(async () =>
      (await savedBubbles(page))
        .find((bubble) => bubble.content === 'Try moving this bubble')
        ?.tags.some((tag) => tag.name === 'week'),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Grow ideas', exact: true }).click();
  const grow = page.getByRole('dialog', { name: 'Let a bubble grow' });
  await grow.getByRole('textbox').first().fill('Open my project notes');
  await grow
    .getByRole('button', { name: 'Add this bubble', exact: true })
    .first()
    .click();
  await expect.poll(async () => (await savedBubbles(page)).length).toBe(4);
  const child = (await savedBubbles(page)).find(
    (bubble) => bubble.content === 'Open my project notes',
  )!;
  expect(child.metadata?.bubbleGarden?.sourceTaskId).toBeTruthy();
  await grow
    .getByRole('button', { name: 'Undo last addition', exact: true })
    .click();
  await expect.poll(async () => (await savedBubbles(page)).length).toBe(3);
  await grow.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'Atomic view mode', exact: true })
    .click();
  const atomic = page.getByTestId('atomic-viewport');
  await expect(atomic.locator('[data-molecule]')).toHaveCount(3);
  await page.getByText('Connections (3)', { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('connections.png') });
  await page.getByText('Connections (3)', { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('molecules.png') });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  await expect.poll(async () => (await savedBubbles(page)).length).toBe(3);
  expect(
    (await savedBubbles(page)).find(
      (bubble) => bubble.content === 'Try moving this bubble',
    )?.caption,
  ).toBe('My own guide note');
  expect(errors).toEqual([]);
});

test('navigation, settings and movement controls stay usable without overlap', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Start with 3 guide bubbles' })
    .click();
  await expect.poll(async () => (await savedBubbles(page)).length).toBe(3);
  await page
    .getByRole('button', { name: 'More destinations', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Settings & Privacy' }),
  ).toBeVisible();
  const categorySelect = page.getByRole('combobox', {
    name: 'Settings section',
  });
  if (await categorySelect.isVisible())
    await categorySelect.selectOption('accessibility');
  else
    await page.getByRole('tab', { name: 'Accessibility', exact: true }).click();
  await expect(page).toHaveURL(/tab=accessibility/);
  await page.screenshot({ path: testInfo.outputPath('settings.png') });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'Canvas', exact: true }).click();
  await page
    .getByRole('button', { name: 'Bubble view mode', exact: true })
    .click();
  const first = page.locator('[data-adaptive-bubble]').first();
  await expect(first).toBeVisible();
  const before = await savedBubbles(page);
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () =>
      JSON.stringify(
        (await savedBubbles(page)).map((bubble) => ({
          id: bubble.id,
          x: bubble.x,
          y: bubble.y,
        })),
      ),
    )
    .not.toBe(
      JSON.stringify(
        before.map((bubble) => ({ id: bubble.id, x: bubble.x, y: bubble.y })),
      ),
    );
  await page.screenshot({ path: testInfo.outputPath('bubbles.png') });
  const bounds = await page.evaluate(() => {
    const canvas = document
      .querySelector('[data-testid="adaptive-bubble-layer"]')!
      .getBoundingClientRect();
    const dock = document
      .querySelector('[data-testid="canvas-action-dock"]')!
      .getBoundingClientRect();
    return { canvasBottom: canvas.bottom, dockTop: dock.top };
  });
  expect(bounds.canvasBottom).toBeLessThanOrEqual(bounds.dockTop + 1);
});
