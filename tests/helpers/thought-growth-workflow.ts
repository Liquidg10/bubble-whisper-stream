import { expect, type Locator, type Page } from '@playwright/test';

const capturedWords = 'A window garden might be nice\n- [ ] Check the light\n- Choose one herb';
const reviewedStep = 'Check the kitchen window for five minutes of sunlight';

interface SavedBubble {
  id: string;
  type: string;
  content?: string;
  metadata?: {
    canonicalTask?: { type?: string };
    bubbleGarden?: { sourceTaskId?: string; sproutKey?: string };
  };
}

async function savedBubbles(page: Page): Promise<SavedBubble[]> {
  return page.evaluate(async () => {
    const request = indexedDB.open('BubbleUniverse');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction('bubbles').objectStore('bubbles').getAll();
      return await new Promise<SavedBubble[]>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally { db.close(); }
  });
}

async function activate(control: Locator, touch: boolean) {
  if (touch) await control.tap();
  else await control.click();
}

/** Ordinary UI writes only; IndexedDB is inspected read-only for durable receipts. */
export async function thoughtGrowthWorkflow(page: Page, origin: string, production: boolean, touch: boolean) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request();
    return new URL(request.url()).origin === origin && ['GET', 'HEAD'].includes(request.method())
      ? route.continue() : route.abort();
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  const response = await page.goto(origin);
  if (production) {
    const html = await response!.text();
    expect(html).toMatch(/src="\/assets\/index-[\w-]+\.js"/u);
    expect(html).not.toContain('/@vite/client');
  }
  await expect(page.getByRole('button', { name: 'Start with 3 guide bubbles', exact: true })).toBeVisible();
  expect(await savedBubbles(page)).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('flags.')))).toEqual([]);

  await activate(page.getByRole('button', { name: 'Capture thought', exact: true }), touch);
  await activate(page.getByRole('button', { name: 'Text', exact: true }), touch);
  await page.getByPlaceholder("What's on your mind?", { exact: true }).fill(capturedWords);
  await activate(page.getByRole('button', { name: 'Save', exact: true }), touch);
  await expect.poll(async () => (await savedBubbles(page)).length).toBe(1);
  const original = (await savedBubbles(page))[0];
  expect(original).toMatchObject({ type: 'Thought', content: capturedWords });

  const openThought = async () => {
    await activate(page.locator(`[data-adaptive-bubble][data-task-id="${original.id}"]`), touch);
    await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(capturedWords);
  };
  await openThought();
  await activate(page.getByRole('button', { name: 'Grow ideas from this bubble', exact: true }), touch);
  let grow = page.getByRole('dialog', { name: 'Let a bubble grow' });
  await expect(grow.getByRole('combobox', { name: 'Bubble to grow', exact: true })).toHaveValue(original.id);
  await expect(grow.getByRole('textbox')).toHaveCount(2);
  await expect(grow.getByRole('textbox').first()).toHaveValue('Check the light');
  await expect(grow.getByRole('textbox').first()).toHaveAccessibleName(/from your notes/);
  await grow.getByRole('textbox').first().fill(reviewedStep);
  expect(await savedBubbles(page)).toEqual([original]);
  await activate(grow.getByRole('button', { name: 'Add this bubble', exact: true }).first(), touch);
  await expect.poll(async () => (await savedBubbles(page)).length).toBe(2);
  const saved = await savedBubbles(page);
  const child = saved.find(bubble => bubble.id !== original.id)!;
  expect(child).toMatchObject({
    type: 'Task', content: reviewedStep,
    metadata: { canonicalTask: { type: 'task' }, bubbleGarden: { sourceTaskId: original.id } },
  });
  expect(saved.find(bubble => bubble.id === original.id)).toEqual(original);
  await expect(grow.getByRole('textbox')).toHaveCount(1);
  await activate(grow.getByRole('button', { name: `Open grown bubble: ${reviewedStep}`, exact: true }), touch);
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(reviewedStep);
  await activate(page.getByRole('button', { name: /^Open source bubble:/ }), touch);
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(capturedWords);
  await activate(page.getByRole('button', { name: 'Done', exact: true }), touch);

  await page.reload();
  await expect.poll(async () => (await savedBubbles(page)).length).toBe(2);
  await openThought();
  await activate(page.getByRole('button', { name: 'Grow ideas from this bubble', exact: true }), touch);
  grow = page.getByRole('dialog', { name: 'Let a bubble grow' });
  await expect(grow.getByRole('textbox')).toHaveCount(1);
  await expect(grow.getByRole('textbox')).toHaveValue('Choose one herb');
  await expect(grow.getByRole('list', { name: 'Steps grown from this bubble', exact: true }).getByRole('listitem')).toHaveCount(1);
  await activate(grow.getByRole('button', { name: `Open grown bubble: ${reviewedStep}`, exact: true }), touch);
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(reviewedStep);
  await activate(page.getByRole('button', { name: /^Open source bubble:/ }), touch);
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(capturedWords);
  expect((await savedBubbles(page)).find(bubble => bubble.id === original.id)).toEqual(original);
  expect((await savedBubbles(page)).filter(bubble => bubble.metadata?.bubbleGarden?.sproutKey === child.metadata?.bubbleGarden?.sproutKey)).toHaveLength(1);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('flags.')))).toEqual([]);
  expect(errors).toEqual([]);
}
