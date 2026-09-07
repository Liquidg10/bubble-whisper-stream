import { expect, test, type Page } from '@playwright/test';

async function layout(page: Page) {
  return page.locator('[data-adaptive-bubble]').evaluateAll(elements => elements.map(element => {
    const target = element.getBoundingClientRect();
    const caption = element.querySelector('[data-bubble-caption]')!.getBoundingClientRect();
    return {
      id: element.getAttribute('data-task-id')!,
      x: target.x, y: target.y, width: target.width,
      caption: { x: caption.x, y: caption.y, right: caption.right, bottom: caption.bottom },
    };
  }));
}

function expectSeparatedCaptions(positions: Awaited<ReturnType<typeof layout>>) {
  for (let left = 0; left < positions.length; left++) {
    for (let right = left + 1; right < positions.length; right++) {
      const a = positions[left].caption;
      const b = positions[right].caption;
      const overlaps = Math.min(a.right, b.right) > Math.max(a.x, b.x)
        && Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y);
      expect(overlaps, `Captions for ${positions[left].id} and ${positions[right].id} overlap`).toBe(false);
    }
  }
}

test('a keyboard move preserves untouched guide positions and readable captions', async ({ page }, testInfo) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with 3 guide bubbles' }).click();
  // The existing mobile density limit deliberately draws two of the three
  // guides; the navigator keeps all three reachable.
  await expect(page.getByLabel('All tasks (3)')).toBeVisible();
  await expect(page.locator('[data-adaptive-bubble]')).toHaveCount(testInfo.project.name === 'mobile' ? 2 : 3);
  const before = await layout(page);
  expectSeparatedCaptions(before);
  before.forEach(position => expect(position.width).toBeGreaterThanOrEqual(72));
  const moved = before[0];
  const target = page.locator(`[data-task-id="${moved.id}"]`);
  await target.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await target.boundingBox())?.x).toBeCloseTo(moved.x + 10);
  // Wait for canonical persistence too: the old bug only appeared when that
  // update caused the remaining origin tasks to be laid out a second time.
  await expect.poll(async () => page.evaluate(async id => {
    const request = indexedDB.open('BubbleUniverse');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction('bubbles').objectStore('bubbles').get(id);
      return await new Promise<boolean>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result?.x !== 0 || read.result?.y !== 0);
        read.onerror = () => reject(read.error);
      });
    } finally { db.close(); }
  }, moved.id)).toBe(true);
  const after = await layout(page);
  for (const previous of before.filter(position => position.id !== moved.id)) {
    const current = after.find(position => position.id === previous.id)!;
    expect({ x: current.x, y: current.y }).toEqual({ x: previous.x, y: previous.y });
  }
  expectSeparatedCaptions(after);
  await page.screenshot({ path: testInfo.outputPath('stable-bubble-placement.png') });
});
