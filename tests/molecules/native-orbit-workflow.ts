import { expect, type CDPSession, type Locator, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sourceTitle = 'See how one action connects your life';
const reuseTitle = 'Do one tiny thing that makes today easier';
type Point = { x: number; y: number };
type Horizon = 'today' | 'week' | 'later';
interface SavedBubble {
  id: string;
  content: string;
  x: number;
  y: number;
  tags: Array<{ id: string; name: string }>;
  metadata?: { canonicalTask?: { domainLinks?: Array<{ domainId: string; label?: string; reason?: string; strength?: string }> } };
}

export async function savedBubbles(page: Page): Promise<SavedBubble[]> {
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

function horizon(bubble: SavedBubble | undefined) {
  return bubble?.tags.find(tag => ['today', 'week', 'later'].includes(tag.name))?.name;
}

async function center(element: Locator): Promise<Point> {
  const bounds = await element.boundingBox();
  expect(bounds, 'The actual pointer target must be rendered').not.toBeNull();
  return { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
}

async function scale(page: Page) {
  return page.getByTestId('atomic-world-layer').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a);
}

async function focusLearningAtZoom(page: Page) {
  const nucleus = page.getByRole('button', { name: /^Learning molecule,/ });
  const zoom = page.getByRole('button', { name: 'Zoom in on Atomic view', exact: true });
  if (await scale(page) < 0.9) await nucleus.click();
  await expect.poll(() => scale(page)).toBeGreaterThanOrEqual(0.9);
  const compactSummary = page.locator('summary').filter({ hasText: /^(View|Overview)$/ });
  const compact = !(await zoom.isVisible());
  if (compact) await compactSummary.click();
  if (Math.abs(await scale(page) - 1) < 0.01) await zoom.click();
  if (compact) await compactSummary.click();
  expect(await scale(page), 'Exercise the transform at a non-unit zoom').toBeGreaterThan(1);
  return nucleus;
}

// Chromium dispatches trusted native pointer events from these mouse/touch
// inputs. DOM dispatchEvent would bypass capture and touch-action behavior.
class NativePointer {
  constructor(private session: CDPSession, private touch: boolean) {}
  async down(point: Point) {
    if (this.touch) await this.session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 0, radiusX: 4, radiusY: 4 }] });
    else {
      await this.session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'none', buttons: 0 });
      await this.session.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    }
  }
  async move(point: Point) {
    if (this.touch) await this.session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 0, radiusX: 4, radiusY: 4 }] });
    else await this.session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'left', buttons: 1 });
  }
  async up(point: Point) {
    if (this.touch) await this.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await this.session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  }
  async cancel() {
    await this.session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  }
}

export async function prepareAnonymousGuide(page: Page, origin: string, production: boolean) {
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
  await page.getByRole('button', { name: 'Start with 3 guide bubbles', exact: true }).click();
  await expect.poll(async () => (await savedBubbles(page)).length).toBe(3);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('flags.')))).toEqual([]);
  await page.getByRole('button', { name: 'Atomic view mode', exact: true }).click();
  await expect(page.locator('[data-molecule-id]')).toHaveCount(3);
  return errors;
}

async function expectSavedHorizon(page: Page, id: string, value: Horizon) {
  await expect.poll(async () => horizon((await savedBubbles(page)).find(bubble => bubble.id === id))).toBe(value);
}

export async function nativeOrbitWorkflow(page: Page, testInfo: TestInfo, touch: boolean) {
  const before = await savedBubbles(page);
  const source = before.find(bubble => bubble.content === sourceTitle)!;
  const nucleus = await focusLearningAtZoom(page);
  const electron = page.getByRole('button', { name: new RegExp(`^${sourceTitle}\\. Learning molecule\\.`) });
  const linkedCopies = page.locator(`[data-electron-id^="elec-${source.id}-"]`);
  await expect(linkedCopies).toHaveCount(3);
  const origin = await center(nucleus);
  const ring = nucleus.locator('..').locator('[data-shell-index="1"]');
  const radius = (await ring.boundingBox())!.width / 2;
  const laterRadius = (await nucleus.locator('..').locator('[data-shell-index="2"]').boundingBox())!.width / 2;
  const initial = await center(electron);
  const grabOffset = { x: 6, y: -4 };
  const grab = { x: initial.x + grabOffset.x, y: initial.y + grabOffset.y };
  const destination = (r: number) => ({ x: origin.x + r / Math.SQRT2, y: origin.y + r / Math.SQRT2 });
  const pointerAt = (point: Point) => ({ x: point.x + grabOffset.x, y: point.y + grabOffset.y });
  const week = destination(radius);
  const later = destination(laterRadius);
  const viewport = await page.getByTestId('atomic-viewport').boundingBox();
  for (const point of [grab, pointerAt(week), pointerAt(later)]) {
    expect(point.x).toBeGreaterThan(viewport!.x);
    expect(point.x).toBeLessThan(viewport!.x + viewport!.width);
    expect(point.y).toBeGreaterThan(viewport!.y);
    expect(point.y).toBeLessThan(viewport!.y + viewport!.height);
  }
  const session = await page.context().newCDPSession(page);
  const pointer = new NativePointer(session, touch);
  // Capture browser event provenance without changing application state.
  await page.evaluate(() => {
    const receipts: Array<{ type: string; pointerType: string; trusted: boolean }> = [];
    (window as typeof window & { orbitInputReceipts: typeof receipts }).orbitInputReceipts = receipts;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
      document.addEventListener(type, event => {
        const pointer = event as PointerEvent;
        receipts.push({ type, pointerType: pointer.pointerType, trusted: pointer.isTrusted });
      }, { capture: true });
    }
  });
  await pointer.down(grab);
  await pointer.move(pointerAt(week));
  const feedback = page.getByTestId('atomic-drag-feedback');
  await expect(feedback).toHaveAttribute('data-target-horizon', 'week');
  await expect(feedback).toContainText('Release in Week');
  await expect(nucleus.locator('..').locator('[data-drop-target="true"]')).toHaveAttribute('data-shell-index', '1');
  const following = await center(electron);
  expect(Math.hypot(following.x - week.x, following.y - week.y), 'Keep the off-centre grab anchored to the pointer at zoom').toBeLessThan(2);
  const activeWorldTransform = await page.getByTestId('atomic-world-layer').getAttribute('style');
  await session.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...pointerAt(week), deltaX: 0, deltaY: -100, modifiers: 2 });
  expect(await page.getByTestId('atomic-world-layer').getAttribute('style')).toBe(activeWorldTransform);
  await page.screenshot({ path: testInfo.outputPath('native-orbit-drop-preview.png') });

  // Mobile touchEnd has no coordinates: move to its final point first. The
  // mouse release deliberately has a new endpoint without a final move event.
  if (touch) {
    await pointer.move(pointerAt(later));
    await expect(feedback).toHaveAttribute('data-target-horizon', 'later');
  }
  await electron.evaluate(button => {
    const probe = new Promise<number[]>(resolve => {
      document.addEventListener('pointerup', () => {
        const samples: number[] = [];
        const until = performance.now() + 450;
        const sample = () => {
          const particle = button.getBoundingClientRect();
          const nucleus = button.parentElement!.querySelector('[data-molecule-id]')!.getBoundingClientRect();
          samples.push(Math.hypot(particle.x + particle.width / 2 - nucleus.x - nucleus.width / 2,
            particle.y + particle.height / 2 - nucleus.y - nucleus.height / 2));
          if (performance.now() < until) requestAnimationFrame(sample);
          else resolve(samples);
        };
        sample();
      }, { once: true, capture: true });
    });
    (window as typeof window & { orbitReleaseProbe: Promise<number[]> }).orbitReleaseProbe = probe;
  });
  await pointer.up(pointerAt(later));
  await expect(feedback).toHaveCount(0);
  await expectSavedHorizon(page, source.id, 'later');
  await expect(linkedCopies).toHaveCount(3);
  for (const copy of await linkedCopies.all()) await expect(copy).toHaveAccessibleName(/Later horizon/);
  const after = await savedBubbles(page);
  expect(after.filter(bubble => bubble.id !== source.id)).toEqual(before.filter(bubble => bubble.id !== source.id));
  const moved = after.find(bubble => bubble.id === source.id)!;
  expect({ content: moved.content, x: moved.x, y: moved.y, metadata: moved.metadata })
    .toEqual({ content: source.content, x: source.x, y: source.y, metadata: source.metadata });
  const firstReceipts = await page.evaluate(() => (window as typeof window & { orbitInputReceipts: unknown[] }).orbitInputReceipts);
  expect(firstReceipts).toContainEqual({ type: 'pointerdown', pointerType: touch ? 'touch' : 'mouse', trusted: true });
  expect(firstReceipts).toContainEqual({ type: 'pointerup', pointerType: touch ? 'touch' : 'mouse', trusted: true });
  const settleRadii = await page.evaluate(() => (window as typeof window & { orbitReleaseProbe: Promise<number[]> }).orbitReleaseProbe);
  expect(settleRadii.length).toBeGreaterThan(4);
  expect(Math.min(...settleRadii), 'Release settling must stay outside the nucleus, never jump through the centre').toBeGreaterThanOrEqual(radius - 2);
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  await expectSavedHorizon(page, source.id, 'later');

  // Search works by visible life-area names as well as task title. A native
  // select is the accessible alternative when the overview hides electrons.
  const navigator = page.getByTestId('atomic-task-navigator');
  await navigator.locator('summary').click();
  const search = navigator.getByRole('searchbox', { name: 'Find a task in Atomic view', exact: true });
  await search.fill('Learning');
  await expect(navigator.getByRole('listitem')).toHaveCount(2);
  await search.fill(sourceTitle);
  await expect(navigator.getByRole('listitem')).toHaveCount(1);
  const horizonSelect = navigator.getByRole('combobox', { name: `Time horizon for ${sourceTitle}`, exact: true });
  await expect(horizonSelect).toHaveValue('2');
  await horizonSelect.selectOption('0');
  await expect(horizonSelect).toHaveValue('0');
  await expectSavedHorizon(page, source.id, 'today');
  await navigator.locator('summary').click();
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  await expectSavedHorizon(page, source.id, 'today');

  await focusLearningAtZoom(page);
  await expect(electron).toHaveAccessibleName(/Today horizon/);
  await electron.focus();
  await electron.press('ArrowRight');
  await expectSavedHorizon(page, source.id, 'week');
  await expect(electron).toBeEnabled();
  await electron.press('ArrowLeft');
  await expectSavedHorizon(page, source.id, 'today');
  await expect(electron).toBeEnabled();
  const cancelBefore = await savedBubbles(page);
  const cancelOrigin = await center(nucleus);
  const cancelStart = await center(electron);
  const cancelRadius = (await ring.boundingBox())!.width / 2;
  const cancelTarget = { x: cancelOrigin.x + cancelRadius / Math.SQRT2, y: cancelOrigin.y + cancelRadius / Math.SQRT2 };
  await pointer.down(cancelStart);
  await pointer.move(cancelTarget);
  await expect(feedback).toHaveAttribute('data-target-horizon', 'week');
  if (touch) await pointer.cancel();
  else {
    await page.keyboard.press('Escape');
    await pointer.up(cancelTarget);
  }
  await expect(feedback).toHaveCount(0);
  expect(await savedBubbles(page)).toEqual(cancelBefore);
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveCount(0);
  // A canceled capture must not poison the next ordinary activation.
  if (touch) await electron.tap();
  else await electron.click();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(sourceTitle);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await expectSavedHorizon(page, source.id, 'today');
  await testInfo.attach('native-orbit-inputs', { body: JSON.stringify({ viewport: page.viewportSize(), touch, zoomedWeekRadius: radius, settleRadii, trustedInputs: firstReceipts }), contentType: 'application/json' });
  await session.detach();
}

export async function existingAreaWorkflow(page: Page, testInfo: TestInfo) {
  const before = await savedBubbles(page);
  const target = before.find(bubble => bubble.content === reuseTitle)!;
  // Bonds are undirected; IndexedDB hydration may reverse their drawing order.
  const bonds = () => page.locator('[data-bond-id]').evaluateAll(elements => elements.map(element => ({ id: element.getAttribute('data-bond-id')!.split(':').sort().join(':'), count: Number(element.getAttribute('data-shared-task-count')) })).sort((a, b) => a.id.localeCompare(b.id)));
  const beforeBonds = await bonds();
  expect(beforeBonds).toHaveLength(3);
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await page.getByRole('dialog', { name: 'A small beginning' }).getByRole('listitem').filter({ hasText: reuseTitle }).getByRole('button', { name: 'Open', exact: true }).click();
  const editor = page.getByRole('group', { name: 'Life connections editor', exact: true });
  await editor.getByRole('button', { name: 'Choose an existing life area', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Find a life area', exact: true }).fill('Learning');
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => animation.effect && Number.isFinite(Number(animation.effect.getComputedTiming().endTime)));
    await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
  });
  const axe = await new AxeBuilder({ page }).include('[role="group"][aria-label="Life connections editor"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const violations = axe.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) }));
  await testInfo.attach('axe-expanded-life-area-picker', { body: JSON.stringify({ violations, passes: axe.passes.length }), contentType: 'application/json' });
  expect(violations).toEqual([]);
  await editor.getByRole('button', { name: 'Use life area Learning', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Connection name for Learning', exact: true })).toHaveValue('Learning');
  await expect(editor.getByRole('textbox', { name: 'Why Learning matters (optional)', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(async () => (await savedBubbles(page)).find(bubble => bubble.id === target.id)?.metadata?.canonicalTask?.domainLinks?.find(link => link.label === 'Learning')?.domainId).toBe('education');
  await page.reload();
  await expect(page.locator('[data-molecule-id]')).toHaveCount(3);
  expect(await savedBubbles(page)).toHaveLength(3);
  const afterBonds = await bonds();
  expect(afterBonds.map(bond => bond.id)).toEqual(beforeBonds.map(bond => bond.id));
  for (const prior of beforeBonds) {
    expect(afterBonds.find(bond => bond.id === prior.id)?.count).toBe(prior.count + (prior.id!.includes('education') ? 1 : 0));
  }
  await page.locator('summary').filter({ hasText: 'Connections (' }).click();
  const card = page.getByTestId('atomic-connections-panel').locator(`[data-shared-task-id="${target.id}"]`);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Learning');
  await card.getByRole('button', { name: `Trace ${reuseTitle} across its life areas`, exact: true }).click();
  await expect(page.getByTestId('atomic-trace-status')).toContainText('One task, 3 life areas');
  await page.screenshot({ path: testInfo.outputPath('reused-life-area-bonds.png') });
}
