import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { prepareAnonymousGuide, savedBubbles } from '../molecules/native-orbit-workflow';
import { closestSpatialOrbit, createSpatialDragPlane, moveOnSpatialDragPlane, SPATIAL_FIELD_OF_VIEW, type SpatialPoint, type SpatialShell } from '../../src/experimental/atomic/spatialGeometry';

const guestKey = 'mind-manual:atomic-layout:v1:guest';
interface Pose { x: number; y: number; z: number }
interface SpatialUndoInput {
  type: string; phase: string; trusted: boolean; pointerType: string;
  label: string | null; target: string; toastState: string | null;
  time: number; defaultPrevented: boolean; x: number | null; y: number | null;
  path: string[]; swipe: string | null;
}
interface SpatialUndoProbe { inputs: SpatialUndoInput[]; startedAt: number; toastShownAt: number | null }
interface Layout {
  version: 1;
  molecules: Record<string, Pose>;
  orbits: Record<string, { domainId: string; taskId: string; shell: 'today' | 'week' | 'later'; angle: number }>;
}
const emptyLayout = (): Layout => ({ version: 1, molecules: {}, orbits: {} });

async function savedLayout(page: Page): Promise<Layout> {
  const raw = await page.evaluate(key => sessionStorage.getItem(key), guestKey);
  if (raw === null) return emptyLayout();
  const parsed = JSON.parse(raw);
  expect(parsed.scope).toBe('guest');
  expect(parsed.version).toBe(1);
  return { version: parsed.version, molecules: parsed.molecules, orbits: parsed.orbits };
}

async function tasks(page: Page) {
  return (await savedBubbles(page)).sort((a, b) => a.id.localeCompare(b.id));
}

async function press(control: Locator, touch: boolean) {
  if (touch) await control.tap(); else await control.click();
}

async function revealViewControl(page: Page, control: Locator, touch: boolean) {
  if (await control.isVisible()) return;
  const summary = page.locator('summary').filter({ hasText: /^(View|Overview)$/ });
  await press(summary, touch);
  await expect(control).toBeVisible();
}

async function closeCompactViewControls(page: Page, touch: boolean) {
  const summary = page.locator('summary').filter({ hasText: /^(View|Overview)$/ });
  if (await summary.count() && await summary.locator('..').getAttribute('open') !== null) {
    await press(summary, touch);
  }
}

async function openLayout(page: Page, touch: boolean) {
  const trigger = page.getByRole('button', { name: 'Arrange molecule layout', exact: true });
  await revealViewControl(page, trigger, touch);
  await press(trigger, touch);
  const panel = page.getByTestId('atomic-layout-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Molecule layout', exact: true })).toBeVisible();
  await panel.getByRole('combobox', { name: 'Life area to arrange', exact: true }).selectOption({ label: 'Learning' });
  return panel;
}

async function panelPose(panel: Locator): Promise<Pose> {
  return panel.getByTestId('atomic-layout-position').evaluate(element => ({
    x: Number(element.getAttribute('data-x')),
    y: Number(element.getAttribute('data-y')),
    z: Number(element.getAttribute('data-z')),
  }));
}

async function closeLayout(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('atomic-layout-panel')).toHaveCount(0);
}

async function compactLayoutTargets(page: Page, panel: Locator, testInfo: TestInfo) {
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const button of await panel.getByRole('button').all()) {
      if (await button.isDisabled()) continue;
      await button.scrollIntoViewIfNeeded();
      await button.focus();
      await expect(button).toBeFocused();
      const geometry = await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
          width: rect.width, height: rect.height,
          inViewport: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
          receivesPointer: hit === element || (hit !== null && element.contains(hit)),
        };
      });
      expect(geometry.width).toBeGreaterThanOrEqual(24);
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.inViewport).toBe(true);
      expect(geometry.receivesPointer).toBe(true);
    }
    await accessible(page, '[data-testid="atomic-layout-panel"]', testInfo, `layout-${viewport.width}x${viewport.height}`);
    await page.screenshot({ path: testInfo.outputPath(`layout-${viewport.width}x${viewport.height}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function accessible(page: Page, selector: string, testInfo: TestInfo, name: string) {
  await expect(page.locator('[role="dialog"][data-state="closed"]')).toHaveCount(0);
  await expect(page.locator(selector)).toBeVisible();
  await page.locator(selector).evaluate(async element => {
    const animations = element.getAnimations({ subtree: true }).filter(animation =>
      Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)));
    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
  });
  await expect(page.locator(selector)).toHaveCSS('opacity', '1');
  const result = await new AxeBuilder({ page }).include(selector).analyze();
  await testInfo.attach(`axe-${name}`, {
    contentType: 'application/json',
    body: JSON.stringify({ violations: result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) })) }),
  });
  expect(result.violations).toEqual([]);
}

async function enable3d(page: Page, touch: boolean) {
  const toggle = page.getByRole('button', { name: '3D view', exact: true });
  await revealViewControl(page, toggle, touch);
  await press(toggle, touch);
  return page.getByTestId('atomic-spatial-scene');
}

async function pickPoint(page: Page, moleculeId: string) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const canvas = await page.getByTestId('spatial-atomic-canvas').boundingBox();
  expect(canvas).not.toBeNull();
  const point = await page.getByTestId('atomic-spatial-scene')
    .locator(`[data-molecule-label][data-molecule-id="${moleculeId}"]`).evaluate(element => ({
      x: Number(element.getAttribute('data-screen-x')),
      y: Number(element.getAttribute('data-screen-y')),
    }));
  expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
  const screen = { x: canvas!.x + point.x, y: canvas!.y + point.y };
  expect(await page.evaluate(position => document.elementFromPoint(position.x, position.y)?.getAttribute('data-testid'), screen),
    'The projected pick center must reach the canvas, without a control covering it').toBe('spatial-atomic-canvas');
  return screen;
}

async function backgroundPoint(page: Page) {
  return page.getByTestId('atomic-spatial-scene').evaluate(scene => {
    const canvas = scene.querySelector('[data-testid="spatial-atomic-canvas"]')!;
    const bounds = canvas.getBoundingClientRect();
    const centers = Array.from(scene.querySelectorAll('[data-screen-x][data-screen-y]')).map(element => ({
      x: bounds.x + Number(element.getAttribute('data-screen-x')),
      y: bounds.y + Number(element.getAttribute('data-screen-y')),
    }));
    for (const [horizontal, vertical] of [[0.8, 0.22], [0.2, 0.65], [0.8, 0.72], [0.5, 0.12]]) {
      const point = { x: bounds.x + bounds.width * horizontal, y: bounds.y + bounds.height * vertical };
      if (document.elementFromPoint(point.x, point.y) === canvas && centers.every(center => Math.hypot(point.x - center.x, point.y - center.y) > 70)) return point;
    }
    return null;
  });
}

async function nativeDrag(page: Page, touch: boolean, from: { x: number; y: number }, to: { x: number; y: number }, cancel = false) {
  if (touch) {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 0, radiusX: 4, radiusY: 4 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 0, radiusX: 4, radiusY: 4 }] });
      await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    } finally { await session.detach(); }
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 4 });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
}

function taskMeaning(task: Awaited<ReturnType<typeof tasks>>[number]) {
  const result = { ...task } as Record<string, unknown>;
  delete result.updatedAt;
  result.tags = task.tags.filter(tag => !['today', 'week', 'later'].includes(tag.name));
  return result;
}

async function planParticleDrop(page: Page, taskId: string, shell: SpatialShell) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const scene = page.getByTestId('atomic-spatial-scene');
  const canvas = (await page.getByTestId('spatial-atomic-canvas').boundingBox())!;
  const particle = scene.locator(`[data-spatial-particle-id][data-molecule-id="mol-education"][data-task-id="${taskId}"]`);
  await expect(particle).toHaveAttribute('data-visible', 'true');
  const source = await particle.evaluate(element => ({
    x: Number(element.getAttribute('data-screen-x')), y: Number(element.getAttribute('data-screen-y')),
    world: { x: Number(element.getAttribute('data-world-x')), y: Number(element.getAttribute('data-world-y')), z: Number(element.getAttribute('data-world-z')) },
    angle: Number(element.getAttribute('data-angle')),
  }));
  const pose = (await savedLayout(page)).molecules.education;
  const cameraPosition = JSON.parse((await scene.getAttribute('data-camera-position'))!) as SpatialPoint;
  const cameraTarget = JSON.parse((await scene.getAttribute('data-camera-target'))!) as SpatialPoint;
  const camera = new PerspectiveCamera(SPATIAL_FIELD_OF_VIEW, canvas.width / canvas.height, 0.1, 1_000_000);
  camera.position.set(cameraPosition.x, -cameraPosition.y, cameraPosition.z);
  camera.lookAt(cameraTarget.x, -cameraTarget.y, cameraTarget.z);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const raycaster = new Raycaster();
  const toApp = (point: Vector3): SpatialPoint => ({ x: point.x, y: -point.y, z: point.z });
  const ray = (point: { x: number; y: number }) => {
    raycaster.setFromCamera(new Vector2(point.x / canvas.width * 2 - 1, 1 - point.y / canvas.height * 2), camera);
    return { origin: toApp(raycaster.ray.origin), direction: toApp(raycaster.ray.direction) };
  };
  const from = { x: source.x + 3, y: source.y - 2 };
  const plane = createSpatialDragPlane(ray(from), source.world, toApp(camera.getWorldDirection(new Vector3())))!;
  expect(plane).toBeDefined();
  const center = new Vector3(pose.x, -pose.y, pose.z).project(camera);
  const candidates: Array<{ x: number; y: number; distance: number; angle: number }> = [];
  // Plan a reachable drop on the particle's camera-facing drag plane. The
  // browser still performs the actual GPU hit and trusted pointer gesture.
  for (const radius of [20, 28, 40, 56, 80, 112, 144, 176]) for (let step = 0; step < 32; step++) {
    const angle = step * Math.PI / 16;
    const point = { x: (center.x + 1) * canvas.width / 2 + Math.cos(angle) * radius,
      y: (1 - center.y) * canvas.height / 2 + Math.sin(angle) * radius };
    if (point.x < 20 || point.y < 20 || point.x > canvas.width - 20 || point.y > canvas.height - 20) continue;
    const world = moveOnSpatialDragPlane(ray(point), plane);
    if (!world) continue;
    const relative = { x: world.x - pose.x, y: world.y - pose.y, z: world.z - pose.z };
    const closest = closestSpatialOrbit(relative, source.angle);
    const angleChange = Math.abs(Math.atan2(Math.sin(closest.angle - source.angle), Math.cos(closest.angle - source.angle)));
    if (closest.shell !== shell || angleChange < 0.8 || Math.hypot(point.x - from.x, point.y - from.y) < 12) continue;
    candidates.push({ x: canvas.x + point.x, y: canvas.y + point.y,
      distance: Math.hypot(relative.x - closest.position.x, relative.y - closest.position.y, relative.z - closest.position.z), angle: closest.angle });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const to = await page.evaluate(points => points.find(point => document.elementFromPoint(point.x, point.y)?.getAttribute('data-testid') === 'spatial-atomic-canvas') ?? null, candidates);
  expect(to, `A visible, reachable drop on shell ${shell} must exist`).not.toBeNull();
  const grab = { x: canvas.x + from.x, y: canvas.y + from.y };
  expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.getAttribute('data-testid'), grab)).toBe('spatial-atomic-canvas');
  return { from: grab, to: { x: to!.x, y: to!.y }, pose };
}

async function proveNativeParticleMoves(page: Page, touch: boolean, beforeTasks: Awaited<ReturnType<typeof tasks>>, testInfo: TestInfo) {
  const source = beforeTasks.find(task => task.content === 'Try moving this bubble')!;
  const orbitKey = JSON.stringify(['education', source.id]);
  const same = await planParticleDrop(page, source.id, 0);
  await nativeDrag(page, touch, same.from, same.to);
  await expect.poll(async () => (await savedLayout(page)).orbits[orbitKey]?.shell).toBe('today');
  expect(await tasks(page)).toEqual(beforeTasks);
  const week = await planParticleDrop(page, source.id, 1);
  await page.evaluate(({ taskId, pose }) => {
    const probe = new Promise<number[]>(resolve => {
      document.addEventListener('pointerup', () => {
        const samples: number[] = [];
        const frame = () => {
          const particle = document.querySelector(`[data-spatial-particle-id][data-molecule-id="mol-education"][data-task-id="${taskId}"]`);
          if (particle) samples.push(Math.hypot(Number(particle.getAttribute('data-world-x')) - pose.x,
            Number(particle.getAttribute('data-world-y')) - pose.y, Number(particle.getAttribute('data-world-z')) - pose.z));
          if (samples.length < 20) requestAnimationFrame(frame); else resolve(samples);
        };
        requestAnimationFrame(frame);
      }, { capture: true, once: true });
    });
    (window as typeof window & { spatialDropProbe: Promise<number[]> }).spatialDropProbe = probe;
    const undo: SpatialUndoProbe = { inputs: [], startedAt: performance.now(), toastShownAt: null };
    (window as typeof window & { spatialUndoProbe: SpatialUndoProbe }).spatialUndoProbe = undo;
    const observer = new MutationObserver(() => {
      if (document.querySelector('[aria-label="Undo moving Try moving this bubble to Week"]')) {
        undo.toastShownAt = performance.now(); observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture', 'touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'click']) {
      for (const capture of [true, false]) window.addEventListener(type, event => {
        const target = event.target as Element;
        const pointer = event as PointerEvent;
        undo.inputs.push({ type, phase: capture ? 'capture' : 'bubble', trusted: event.isTrusted,
          pointerType: pointer.pointerType ?? '', label: target.closest('button')?.getAttribute('aria-label') ?? null,
          target: target.tagName, time: performance.now(), defaultPrevented: event.defaultPrevented,
          x: Number.isFinite(pointer.clientX) ? pointer.clientX : null, y: Number.isFinite(pointer.clientY) ? pointer.clientY : null,
          path: event.composedPath().filter(item => item instanceof Element).slice(0, 6).map(item => (item as Element).tagName),
          swipe: target.closest('[data-swipe-direction]')?.getAttribute('data-swipe') ?? null,
          toastState: target.closest('[data-swipe-direction]')?.getAttribute('data-state') ?? null });
      }, { capture });
    }
  }, { taskId: source.id, pose: week.pose });
  await nativeDrag(page, touch, week.from, week.to);
  await expect.poll(async () => (await tasks(page)).find(task => task.id === source.id)?.tags.filter(tag => ['today', 'week', 'later'].includes(tag.name)).map(tag => tag.name)).toEqual(['week']);
  const after = await tasks(page);
  expect(after.filter(task => task.id !== source.id)).toEqual(beforeTasks.filter(task => task.id !== source.id));
  expect(taskMeaning(after.find(task => task.id === source.id)!)).toEqual(taskMeaning(source));
  const samples = await page.evaluate(() => (window as typeof window & { spatialDropProbe: Promise<number[]> }).spatialDropProbe);
  expect(samples).toHaveLength(20);
  expect(Math.min(...samples), 'The 3D electron must never detour through its nucleus after release').toBeGreaterThan(30);
  // Undo is a time-limited user action. Capture its trusted input before doing
  // screenshot work that can consume the notification's five-second lifetime.
  const undo = page.getByRole('button', { name: 'Undo moving Try moving this bubble to Week', exact: true });
  if (touch) await undo.tap({ trial: true });
  const beforeTap = await undo.evaluate(button => {
    const probe = (window as typeof window & { spatialUndoProbe: SpatialUndoProbe }).spatialUndoProbe;
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const toast = button.closest('[data-swipe-direction]')!;
    return { time: performance.now(), toastAge: probe.toastShownAt === null ? null : performance.now() - probe.toastShownAt,
      rect: rect.toJSON(), receivesPointer: hit === button || (hit !== null && button.contains(hit)),
      hit: { tag: hit?.tagName, label: hit?.closest('button')?.getAttribute('aria-label') },
      toastState: toast.getAttribute('data-state'), toastOpacity: getComputedStyle(toast).opacity,
      toastTransform: getComputedStyle(toast).transform,
      buttons: Array.from(toast.querySelectorAll('button')).map(item => ({ label: item.getAttribute('aria-label'), text: item.textContent, rect: item.getBoundingClientRect().toJSON() })) };
  });
  try {
    if (touch) {
      expect(beforeTap.receivesPointer).toBe(true);
      const session = await page.context().newCDPSession(page);
      try {
        // Playwright's Chromium tap sends start/end concurrently. Use the
        // browser's native 50ms touch gesture so Linux synthesizes its click.
        await session.send('Input.synthesizeTapGesture', {
          x: beforeTap.rect.x + beforeTap.rect.width / 2,
          y: beforeTap.rect.y + beforeTap.rect.height / 2,
          duration: 50, tapCount: 1, gestureSourceType: 'touch',
        });
      } finally { await session.detach(); }
    } else await press(undo, false);
    await expect.poll(() => page.evaluate(() => (window as typeof window & { spatialUndoProbe: SpatialUndoProbe }).spatialUndoProbe.inputs
      .filter(input => input.phase === 'capture' && input.type === 'click' && input.label === 'Undo moving Try moving this bubble to Week').length),
    { message: 'The native Undo gesture must synthesize exactly one click on its button' }).toBe(1);
    const undoInputs = (await page.evaluate(() => (window as typeof window & { spatialUndoProbe: SpatialUndoProbe }).spatialUndoProbe)).inputs
      .filter(input => input.phase === 'capture' && input.label === 'Undo moving Try moving this bubble to Week');
    expect(undoInputs.filter(input => input.type === 'click')).toHaveLength(1);
    expect(undoInputs.every(input => input.trusted && input.toastState === 'open')).toBe(true);
    expect(undoInputs.filter(input => input.type === 'pointerdown' || input.type === 'pointerup').map(input => input.pointerType))
      .toEqual([touch ? 'touch' : 'mouse', touch ? 'touch' : 'mouse']);
    await expect.poll(async () => (await tasks(page)).find(task => task.id === source.id)?.tags.filter(tag => ['today', 'week', 'later'].includes(tag.name)).map(tag => tag.name)).toEqual(['today']);
  } finally {
    const probe = await page.evaluate(() => (window as typeof window & { spatialUndoProbe: SpatialUndoProbe }).spatialUndoProbe);
    const path = testInfo.outputPath('spatial-native-undo-input.json');
    await writeFile(path, JSON.stringify({ beforeTap, ...probe }, null, 2));
    await testInfo.attach('spatial-native-undo-input', { contentType: 'application/json', path });
  }
  expect((await tasks(page)).map(taskMeaning)).toEqual(beforeTasks.map(taskMeaning));
  await page.screenshot({ path: testInfo.outputPath('spatial-native-electron-undone.png') });
  await testInfo.attach('spatial-native-particle-receipt', { contentType: 'application/json', body: JSON.stringify({ nativeSameShell: true, nativeCrossHorizon: 'week', undoneHorizon: 'today', canonicalIdentityAndLinksPreserved: true, otherTasksUnchanged: true, radialSamplesAfterRelease: samples }) });
}

async function verify3dTraceControls(page: Page, touch: boolean, testInfo: TestInfo) {
  const connections = page.locator('summary').filter({ hasText: /Connections \(/ });
  await press(connections, touch);
  await press(page.getByRole('button', { name: 'Trace See how one action connects your life across its life areas', exact: true }), touch);
  const trace = page.getByTestId('atomic-trace-status');
  await expect(trace).toBeVisible();
  const clear = page.getByRole('button', { name: 'Clear trace', exact: true });
  await expect(clear).toBeFocused();
  const checks: Array<{ name: string; receivesPointer: boolean }> = [];
  for (const name of touch ? ['Clear trace'] : ['Turn view up', 'Turn view down', 'Clear trace']) {
    const button = page.getByRole('button', { name, exact: true });
    const receivesPointer = await button.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return hit === element || (hit !== null && element.contains(hit));
    });
    checks.push({ name, receivesPointer });
    expect(receivesPointer, `${name} must remain uncovered while the 3D trace is visible`).toBe(true);
    if (name !== 'Clear trace') {
      const scene = page.getByTestId('atomic-spatial-scene');
      const before = await scene.getAttribute('data-camera-position');
      await press(button, touch);
      await expect.poll(() => scene.getAttribute('data-camera-position')).not.toBe(before);
    }
  }
  await page.screenshot({ path: testInfo.outputPath('spatial-trace-camera-controls.png') });
  await press(clear, touch);
  await expect(trace).toHaveCount(0);
  await expect(connections).toBeFocused();
  await testInfo.attach('spatial-trace-controls-receipt', { contentType: 'application/json', body: JSON.stringify({ checks, traceCleared: true, focusReturned: true }) });
}

export async function savedSpatialLayoutWorkflow(page: Page, origin: string, production: boolean, touch: boolean, testInfo: TestInfo) {
  const errors = await prepareAnonymousGuide(page, origin, production);
  const beforeTasks = await tasks(page);
  let panel = await openLayout(page, touch);
  const initialPose = await panelPose(panel);
  await press(panel.getByRole('button', { name: 'Move life area right', exact: true }), touch);
  await expect.poll(async () => (await savedLayout(page)).molecules.education).toEqual({ ...initialPose, x: initialPose.x + 24 });
  await press(panel.getByRole('button', { name: 'Move life area down', exact: true }), touch);
  await expect.poll(async () => (await savedLayout(page)).molecules.education.y).toBe(initialPose.y + 24);
  const beforeDepth = await savedLayout(page);
  await press(panel.getByRole('button', { name: 'Move life area farther', exact: true }), touch);
  await expect.poll(async () => (await savedLayout(page)).molecules.education.z).toBe(initialPose.z - 24);
  await press(panel.getByRole('button', { name: 'Undo layout change', exact: true }), touch);
  await expect.poll(() => savedLayout(page)).toEqual(beforeDepth);
  await press(panel.getByRole('button', { name: 'Move particle clockwise', exact: true }), touch);
  await expect.poll(async () => Object.keys((await savedLayout(page)).orbits).length).toBe(1);
  const arranged = await savedLayout(page);
  expect(await tasks(page)).toEqual(beforeTasks);
  await accessible(page, '[data-testid="atomic-layout-panel"]', testInfo, 'saved-layout-controls');
  await page.screenshot({ path: testInfo.outputPath('saved-layout-controls.png') });
  if (touch) await compactLayoutTargets(page, panel, testInfo);
  await closeLayout(page);
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  expect(await savedLayout(page)).toEqual(arranged);
  panel = await openLayout(page, touch);
  expect(await panelPose(panel)).toEqual(arranged.molecules.education);
  await press(panel.getByRole('button', { name: 'Reset molecule layout', exact: true }), touch);
  await expect.poll(() => savedLayout(page)).toEqual(emptyLayout());
  await press(panel.getByRole('button', { name: 'Undo layout change', exact: true }), touch);
  await expect.poll(() => savedLayout(page)).toEqual(arranged);
  await closeLayout(page);
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  expect(await savedLayout(page)).toEqual(arranged);
  expect(await tasks(page)).toEqual(beforeTasks);
  expect(errors).toEqual([]);
  await testInfo.attach('saved-spatial-layout-receipt', { contentType: 'application/json', body: JSON.stringify({ guestScope: true, reload: true, resetUndone: true, canonicalTasksUnchanged: true, moleculeCount: Object.keys(arranged.molecules).length, orbitCount: Object.keys(arranged.orbits).length, pageErrors: errors }) });
}

export async function spatial3dWorkflow(page: Page, origin: string, production: boolean, touch: boolean, testInfo: TestInfo) {
  const errors = await prepareAnonymousGuide(page, origin, production);
  const beforeTasks = await tasks(page);
  const scene = await enable3d(page, touch);
  await expect(scene).toHaveAttribute('data-renderer-status', 'ready');
  const beforeCamera = await scene.getAttribute('data-camera-position');
  const turn = page.getByRole('button', { name: 'Turn view right', exact: true });
  await revealViewControl(page, turn, touch);
  await press(turn, touch);
  await expect.poll(() => scene.getAttribute('data-camera-position')).not.toBe(beforeCamera);
  const panel = await openLayout(page, touch);
  const pose = await panelPose(panel);
  await press(panel.getByRole('button', { name: 'Move life area nearer', exact: true }), touch);
  await expect.poll(async () => (await savedLayout(page)).molecules.education.z).toBe(pose.z + 24);
  await closeLayout(page);
  await closeCompactViewControls(page, touch);
  const beforeDrag = await savedLayout(page);
  const cameraBeforeGesture = await scene.getAttribute('data-camera-position');
  const background = await backgroundPoint(page);
  expect(background, 'A visible empty canvas area must be available for camera gestures').not.toBeNull();
  await nativeDrag(page, touch, background!, { x: background!.x - 28, y: background!.y + 16 });
  await expect.poll(() => scene.getAttribute('data-camera-position')).not.toBe(cameraBeforeGesture);
  expect(await savedLayout(page)).toEqual(beforeDrag);
  let point = await pickPoint(page, 'mol-education');
  await nativeDrag(page, touch, point, { x: point.x + 36, y: point.y + 24 }, true);
  expect(await savedLayout(page)).toEqual(beforeDrag);
  point = await pickPoint(page, 'mol-education');
  await nativeDrag(page, touch, point, { x: point.x + 42, y: point.y + 24 });
  await expect.poll(() => savedLayout(page)).not.toEqual(beforeDrag);
  let moved = await savedLayout(page);
  expect(Object.keys(moved.molecules)).toEqual(['education']);
  expect(await tasks(page)).toEqual(beforeTasks);
  await proveNativeParticleMoves(page, touch, beforeTasks, testInfo);
  moved = await savedLayout(page);
  await verify3dTraceControls(page, touch, testInfo);
  await accessible(page, '[data-reduced-motion]', testInfo, 'spatial-3d-controls');
  await page.screenshot({ path: testInfo.outputPath('spatial-3d-rotated-layout.png') });
  const flat = page.getByRole('button', { name: 'Flat view', exact: true });
  await revealViewControl(page, flat, touch);
  await press(flat, touch);
  await expect(page.getByTestId('atomic-world-layer')).toBeVisible();
  expect(await savedLayout(page)).toEqual(moved);
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  expect(await savedLayout(page)).toEqual(moved);
  expect((await tasks(page)).map(taskMeaning)).toEqual(beforeTasks.map(taskMeaning));
  expect(errors).toEqual([]);
  await testInfo.attach('spatial-3d-receipt', { contentType: 'application/json', body: JSON.stringify({ cameraRotated: true, nativeCameraOrbit: true, depthSaved: true, nativeDragSaved: true, nativeCancelUnchanged: true, flatSharesLayout: true, nativeHorizonMoveUndone: true, canonicalTaskMeaningPreserved: true, pageErrors: errors }) });
}

export async function noWebGlWorkflow(page: Page, origin: string, production: boolean, touch: boolean, testInfo: TestInfo) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(args[0])) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  const errors = await prepareAnonymousGuide(page, origin, production);
  const beforeTasks = await tasks(page);
  const scene = await enable3d(page, touch);
  await expect(scene).toHaveCount(0);
  await expect(page.getByTestId('atomic-world-layer')).toBeVisible();
  await expect(page.getByText('3D is unavailable here. Flat view is ready, and your saved layout is safe.', { exact: true })).toBeVisible();
  const panel = await openLayout(page, touch);
  const pose = await panelPose(panel);
  await press(panel.getByRole('button', { name: 'Move life area left', exact: true }), touch);
  await expect.poll(async () => (await savedLayout(page)).molecules.education.x).toBe(pose.x - 24);
  await closeLayout(page);
  const navigator = page.getByTestId('atomic-task-navigator');
  if (await navigator.getAttribute('open') === null) await press(navigator.locator('summary'), touch);
  await press(navigator.getByRole('button', { name: /^Open See how one action connects your life\./ }), touch);
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('See how one action connects your life');
  await page.screenshot({ path: testInfo.outputPath('no-webgl-usable-task-details.png') });
  expect(await tasks(page)).toEqual(beforeTasks);
  expect(errors).toEqual([]);
  await testInfo.attach('no-webgl-receipt', { contentType: 'application/json', body: JSON.stringify({ rendererUnavailable: true, layoutControlsWork: true, tasksRemainReachable: true, canonicalTasksUnchanged: true, pageErrors: errors }) });
}

export async function layoutStorageFailureWorkflow(page: Page, origin: string, production: boolean, touch: boolean, testInfo: TestInfo) {
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && !document.documentElement.hasAttribute('data-test-layout-storage-restored')) {
        throw new DOMException('Synthetic layout storage denied', 'QuotaExceededError');
      }
      return original.call(this, name, value);
    };
  }, guestKey);
  const errors = await prepareAnonymousGuide(page, origin, production);
  const beforeTasks = await tasks(page);
  const panel = await openLayout(page, touch);
  const before = await panelPose(panel);
  await press(panel.getByRole('button', { name: 'Move life area right', exact: true }), touch);
  await expect(panel.getByTestId('atomic-layout-status')).toContainText('not verified');
  expect(await savedLayout(page)).toEqual(emptyLayout());
  expect(await panelPose(panel)).toEqual(before);
  expect(await tasks(page)).toEqual(beforeTasks);
  await page.screenshot({ path: testInfo.outputPath('layout-storage-failure.png') });
  await page.evaluate(() => document.documentElement.setAttribute('data-test-layout-storage-restored', ''));
  await press(panel.getByRole('button', { name: 'Retry saving layout', exact: true }), touch);
  await expect.poll(async () => (await savedLayout(page)).molecules.education).toEqual({ ...before, x: before.x + 24 });
  await expect(panel.getByRole('button', { name: 'Retry saving layout', exact: true })).toHaveCount(0);
  expect(await tasks(page)).toEqual(beforeTasks);
  expect(errors).toEqual([]);
  await testInfo.attach('layout-storage-retry-receipt', { contentType: 'application/json', body: JSON.stringify({ failureVisible: true, failureDidNotMove: true, retrySaved: true, canonicalTasksUnchanged: true, pageErrors: errors }) });
}

export async function spatialMotionAndContextLossWorkflow(page: Page, origin: string, production: boolean, touch: boolean, testInfo: TestInfo) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await prepareAnonymousGuide(page, origin, production);
  const beforeTasks = await tasks(page);
  await expect(page.locator('[data-reduced-motion]')).toHaveAttribute('data-reduced-motion', 'true');
  const scene = await enable3d(page, touch);
  await expect(scene).toHaveAttribute('data-renderer-status', 'ready');
  const motion = page.getByRole('button', { name: 'Motion disabled by reduced-motion preference', exact: true });
  await revealViewControl(page, motion, touch);
  await expect(motion).toBeDisabled();
  const readProjection = () => scene.locator('[data-spatial-particle-id][data-visible="true"]').evaluateAll(elements => elements.map(element => ({
    id: element.getAttribute('data-spatial-particle-id'),
    x: element.getAttribute('data-screen-x'), y: element.getAttribute('data-screen-y'),
  })).sort((a, b) => (a.id ?? '').localeCompare(b.id ?? '')));
  await expect.poll(async () => (await readProjection()).length).toBeGreaterThan(0);
  const stillProjection = await readProjection();
  const stillCamera = await scene.getAttribute('data-camera-position');
  // Observe successive rendered frames; this is a motion measurement window,
  // not a delay used to make an unsettled interaction pass.
  await page.evaluate(() => new Promise<void>(resolve => {
    let remaining = 20;
    const frame = () => { if (--remaining === 0) resolve(); else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }));
  expect(await readProjection()).toEqual(stillProjection);
  expect(await scene.getAttribute('data-camera-position')).toBe(stillCamera);
  await press(page.getByRole('button', { name: 'Turn view right', exact: true }), touch);
  await expect.poll(() => scene.getAttribute('data-camera-position')).not.toBe(stillCamera);
  const panel = await openLayout(page, touch);
  await press(panel.getByRole('button', { name: 'Move life area nearer', exact: true }), touch);
  await expect.poll(async () => Object.keys((await savedLayout(page)).molecules).length).toBe(1);
  const beforeLoss = await savedLayout(page);
  await closeLayout(page);
  const contextWasLost = await page.getByTestId('spatial-atomic-canvas').evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('webgl2');
    const extension = context?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(contextWasLost, 'Chromium must exercise actual WebGL context loss, not a synthetic DOM event').toBe(true);
  await expect(scene).toHaveCount(0);
  await expect(page.getByTestId('atomic-world-layer')).toBeVisible();
  await expect(page.getByText('The 3D view lost graphics support. Flat view is ready, and your saved layout is safe.', { exact: true })).toBeVisible();
  expect(await savedLayout(page)).toEqual(beforeLoss);
  await openLayout(page, touch);
  await expect(page.getByTestId('atomic-layout-position')).toHaveAttribute('data-z', String(beforeLoss.molecules.education.z));
  await accessible(page, '[data-testid="atomic-layout-panel"]', testInfo, 'context-loss-layout-controls');
  await page.screenshot({ path: testInfo.outputPath('context-loss-preserved-layout.png') });
  expect(await tasks(page)).toEqual(beforeTasks);
  expect(errors).toEqual([]);
  await testInfo.attach('spatial-motion-context-loss-receipt', { contentType: 'application/json', body: JSON.stringify({ reducedMotion: true, stationaryForFrames: 20, explicitCameraControlsWork: true, actualWebGlContextLoss: true, savedLayoutPreserved: true, canonicalTasksUnchanged: true, pageErrors: errors }) });
}
