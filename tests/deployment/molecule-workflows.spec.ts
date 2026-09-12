import { expect, test, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';

const ownerOrigin = 'http://127.0.0.1:4181';
const sourceTitle = 'See how one action connects your life';
const customArea = 'Creative practice';
const literalReason = 'A small shared project makes room for curiosity at home.';
const childTitle = 'Put one blank page beside my project notes';

interface SavedBubble {
  id: string;
  content: string;
  metadata?: {
    canonicalTask?: {
      domainLinks?: Array<{ domainId: string; label?: string; reason?: string }>;
    };
    bubbleGarden?: {
      sourceTaskId?: string;
      review?: { dismissedSproutKeys?: string[] };
    };
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

async function openSource(page: Page) {
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  const guide = page.getByRole('dialog', { name: 'A small beginning' });
  await guide.getByRole('listitem').filter({ hasText: sourceTitle })
    .getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(sourceTitle);
}

async function closeDetails(page: Page) {
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveCount(0);
}

async function openSourceGrow(page: Page, sourceId: string) {
  await openSource(page);
  await page.getByRole('button', { name: 'Grow ideas from this bubble', exact: true }).click();
  const grow = page.getByRole('dialog', { name: 'Let a bubble grow' });
  await expect(grow.getByRole('combobox', { name: 'Bubble to grow', exact: true })).toHaveValue(sourceId);
  return grow;
}

async function activate(control: Locator, touch: boolean) {
  if (touch) await control.tap();
  else await control.click();
}

async function expectAccessible(page: Page, selector: string, name: string) {
  // Measure the presented state, after the dialog's finite opacity transition.
  // Ongoing decorative animations are deliberately excluded from this wait.
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation =>
      animation.effect && Number.isFinite(Number(animation.effect.getComputedTiming().endTime)));
    await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
  });
  const results = await new AxeBuilder({ page }).include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const path = test.info().outputPath(`axe-${name}.json`);
  await writeFile(path, JSON.stringify(results, null, 2));
  await test.info().attach(`axe-${name}`, { contentType: 'application/json', path });
  expect(results.violations.map(violation => ({
    id: violation.id,
    nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })),
  }))).toEqual([]);
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000, touch: false },
  { name: 'mobile', width: 390, height: 844, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.touch, hasTouch: viewport.touch, reducedMotion: 'reduce' });

    test('production guide links, trace and grown family survive ordinary use and reload', async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      page.setDefaultTimeout(10_000);
      const errors: string[] = [];
      const localAssets: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      // The configured server builds an isolated, synthetic owner fixture. A
      // new Playwright context supplies empty storage, without flag overrides.
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== ownerOrigin) return route.abort();
        if (url.pathname.startsWith('/assets/')) localAssets.push(url.pathname);
        return route.continue();
      });
      await page.routeWebSocket(/.*/, socket => socket.close());
      const response = await page.goto(ownerOrigin);
      const html = await response!.text();
      expect(html).toMatch(/src="\/assets\/index-[\w-]+\.js"/u);
      expect(html).not.toContain('/@vite/client');
      await expect(page.getByRole('button', { name: 'Start with 3 guide bubbles' })).toBeVisible();
      expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('flags.')))).toEqual([]);
      await page.getByRole('button', { name: 'Start with 3 guide bubbles' }).click();
      await expect.poll(async () => (await savedBubbles(page)).length).toBe(3);
      const sourceId = (await savedBubbles(page)).find(bubble => bubble.content === sourceTitle)!.id;

      await openSource(page);
      const editor = page.getByRole('group', { name: 'Life connections editor', exact: true });
      await expect(editor).toBeVisible();
      await editor.getByRole('textbox', { name: 'Add your own connection', exact: true }).fill(customArea);
      await editor.getByRole('button', { name: 'Add connection', exact: true }).click();
      await editor.getByRole('textbox', { name: `Why ${customArea} matters (optional)`, exact: true }).fill(literalReason);
      // Done must commit the focused inline field and the task itself.
      await closeDetails(page);
      await expect.poll(async () => (await savedBubbles(page)).find(bubble => bubble.id === sourceId)
        ?.metadata?.canonicalTask?.domainLinks?.find(link => link.label === customArea)?.reason).toBe(literalReason);
      await page.reload();
      await openSource(page);
      await expect(editor.getByRole('textbox', { name: `Why ${customArea} matters (optional)`, exact: true })).toHaveValue(literalReason);
      await expectAccessible(page, '[role="group"][aria-label="Life connections editor"]', 'life-connections');
      await editor.getByRole('button', { name: 'Remove Learning', exact: true }).click();
      await expect(editor.getByRole('textbox', { name: 'Connection name for Learning', exact: true })).toHaveCount(0);
      await editor.getByRole('button', { name: 'Undo removing Learning', exact: true }).click();
      await expect(editor.getByRole('textbox', { name: 'Connection name for Learning', exact: true })).toBeVisible();
      await editor.getByRole('button', { name: 'Remove Learning', exact: true }).click();
      await closeDetails(page);
      await expect.poll(async () => (await savedBubbles(page)).find(bubble => bubble.id === sourceId)
        ?.metadata?.canonicalTask?.domainLinks?.some(link => link.label === 'Learning')).toBe(false);

      await page.getByRole('button', { name: 'Atomic view mode', exact: true }).click();
      await expect(page.getByTestId('atomic-viewport')).toBeVisible();
      await page.locator('summary').filter({ hasText: 'Connections (' }).click();
      const connections = page.getByTestId('atomic-connections-panel');
      const sourceCard = connections.locator(`[data-shared-task-id="${sourceId}"]`);
      await expect(sourceCard).toHaveCount(1);
      await expect(sourceCard).toContainText(literalReason);
      await expectAccessible(page, '[data-testid="atomic-connections-panel"]', 'shared-connections');
      await page.screenshot({ path: testInfo.outputPath('production-readable-connections.png'), fullPage: true });
      const beforeTrace = await savedBubbles(page);
      await activate(sourceCard.getByRole('button', { name: `Trace ${sourceTitle} across its life areas`, exact: true }), viewport.touch);
      await expect(page.getByRole('button', { name: 'Clear trace', exact: true })).toBeVisible();
      await expect(page.getByTestId('atomic-trace-status')).toContainText('One task, 3 life areas');
      expect(await savedBubbles(page)).toEqual(beforeTrace);
      await page.screenshot({ path: testInfo.outputPath('production-touch-trace.png'), fullPage: true });
      await activate(page.getByRole('button', { name: 'Clear trace', exact: true }), viewport.touch);
      await page.locator('summary').filter({ hasText: 'Connections (' }).click();
      await sourceCard.getByRole('button', { name: `Edit connections for ${sourceTitle}`, exact: true }).click();
      await expect(editor).toBeFocused();
      await expect(editor.getByRole('textbox', { name: `Why ${customArea} matters (optional)`, exact: true })).toHaveValue(literalReason);
      await closeDetails(page);

      await page.locator('summary').filter({ hasText: 'Connections (' }).click();
      const connectTask = connections.getByRole('button', { name: 'Connect a task', exact: true });
      await connectTask.scrollIntoViewIfNeeded();
      expect(await connectTask.evaluate(button => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit === button || button.contains(hit);
      })).toBe(true);
      await activate(connectTask, viewport.touch);
      await connections.getByRole('searchbox', { name: 'Find a task to connect', exact: true }).fill(sourceTitle);
      await connections.getByRole('list', { name: 'Tasks available to connect', exact: true })
        .getByRole('button', { name: `Edit connections for ${sourceTitle}`, exact: true }).click();
      await expect(editor).toBeFocused();
      await closeDetails(page);

      let grow = await openSourceGrow(page, sourceId);
      const firstDraft = grow.getByRole('article').first();
      const dismissedTitle = await firstDraft.getByRole('textbox').inputValue();
      await firstDraft.getByRole('button', { name: 'Dismiss', exact: true }).click();
      await expect.poll(async () => (await savedBubbles(page)).find(bubble => bubble.id === sourceId)
        ?.metadata?.bubbleGarden?.review?.dismissedSproutKeys?.length).toBe(1);
      await grow.getByRole('button', { name: 'Close', exact: true }).click();
      await page.reload();
      grow = await openSourceGrow(page, sourceId);
      expect(await grow.getByRole('textbox').evaluateAll(nodes => nodes.map(node => (node as HTMLTextAreaElement).value))).not.toContain(dismissedTitle);
      await grow.getByRole('button', { name: 'Restore suggestions', exact: true }).click();
      await expect.poll(async () => grow.getByRole('textbox').evaluateAll(nodes => nodes.map(node => (node as HTMLTextAreaElement).value))).toContain(dismissedTitle);
      // Restoring reinstates the original order; select the first restored draft.
      await expect(grow.getByRole('textbox').first()).toHaveValue(dismissedTitle);
      await grow.getByRole('textbox').first().fill(childTitle);
      await grow.getByRole('button', { name: 'Add this bubble', exact: true }).first().click();
      await expect.poll(async () => (await savedBubbles(page)).length).toBe(4);
      const child = (await savedBubbles(page)).find(bubble => bubble.content === childTitle)!;
      expect(child.metadata?.bubbleGarden?.sourceTaskId).toBe(sourceId);
      await grow.getByRole('button', { name: `Open grown bubble: ${childTitle}`, exact: true }).click();
      await expect(page.getByRole('button', { name: `Open source bubble: ${sourceTitle}`, exact: true })).toBeVisible();
      await closeDetails(page);
      await page.reload();
      await openSource(page);
      await page.getByRole('button', { name: `Open grown bubble: ${childTitle}`, exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(childTitle);
      await page.getByRole('button', { name: `Open source bubble: ${sourceTitle}`, exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(sourceTitle);
      const familyLink = page.getByRole('button', { name: `Open grown bubble: ${childTitle}`, exact: true });
      await expect(familyLink).toBeEnabled();
      await familyLink.scrollIntoViewIfNeeded();
      const familyGeometry = await familyLink.evaluate(button => {
        const title = button.querySelector<HTMLElement>('.garden-family-title')!;
        const status = button.querySelector<HTMLElement>('.garden-family-status')!;
        const titleBounds = title.getBoundingClientRect();
        const statusBounds = status.getBoundingClientRect();
        return { titleRight: titleBounds.right, statusLeft: statusBounds.left,
          contentWidth: title.scrollWidth, availableWidth: title.clientWidth };
      });
      expect(familyGeometry.titleRight).toBeLessThanOrEqual(familyGeometry.statusLeft + 1);
      expect(familyGeometry.contentWidth).toBeLessThanOrEqual(familyGeometry.availableWidth + 1);
      await expectAccessible(page, '.garden-family', 'family');
      await page.screenshot({ path: testInfo.outputPath('production-persistent-family.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('flags.')))).toEqual([]);
      expect(localAssets.some(path => path.includes('mountApplication'))).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
