import { expect, type Page } from '@playwright/test';

export const SAVED_GLIMMER_ID = 'synthetic-saved-glimmer';
export const SAVED_GLIMMER_MESSAGE = 'A saved gentle reminder remains available while you use your workspace.';

type GlimmerRow = { id: string; message: string; tone: string; dismissed?: boolean };

/**
 * Real built UI, service generation, IndexedDB and Zustand persistence hydration.
 * The legacy store does not reload glimmers from IndexedDB at startup: its saved
 * row is deliberately hydrated from a synthetic backup as well as seeded in DB.
 * This tests an already-populated saved-message state, NOT cold-start recovery.
 * Friend is the existing legacy card vocabulary; generated cards use supportive.
 */
export async function prepareActiveGlimmers(page: Page) {
  const errors: string[] = [];
  const blockedRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    blockedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort();
  });
  const noon = await page.evaluate(() => new Date(2030, 0, 15, 12).getTime());
  await page.clock.setFixedTime(new Date(noon));
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Login is outside AppShell: create the real storage schema without mounting
  // either notification producer. No synthetic credentials/sign-in are needed.
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeAttached();
  await page.evaluate(async ({ noon, savedId, savedMessage }) => {
    const backup = JSON.parse(localStorage.getItem('bubble-universe-store') || '{"state":{}}');
    const settings = { ...backup.state.settings, intelligenceEnabled: true, glimmersEnabled: true,
      preferredGlimmerTone: 'supportive', reducedMotion: true, viewMode: 'bubble',
      progressiveOnboarding: { isEnabled: true, currentDay: 1, startDate: noon,
        completedMilestones: [], hasSkippedProgression: false } };
    const saved = { id: savedId, message: savedMessage, tone: 'Friend', cause: 'general_encouragement',
      deliveredVia: 'text', createdAt: noon - 1000, dismissed: false };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('BubbleUniverse', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['settings', 'glimmers', 'bubbles'], 'readwrite');
        tx.objectStore('settings').put({ id: 'app-settings', ...settings });
        tx.objectStore('glimmers').clear();
        tx.objectStore('glimmers').put(saved);
        tx.objectStore('glimmers').put({ ...saved, id: 'synthetic-frequency-companion',
          message: 'Another earlier synthetic reminder.', createdAt: noon - 2000 });
        const bubbles = tx.objectStore('bubbles');
        bubbles.clear();
        ['finance', 'work', 'health', 'relationships', 'personal'].forEach((domain, index) => {
          bubbles.put({ id: `glimmer-domain-${domain}`, type: 'Task', content: `${domain} action`,
            createdAt: index + 1, updatedAt: index + 1, x: 0, y: 0, size: 0.5, completed: false,
            tags: [{ id: `domain-${domain}`, name: domain }], metadata: { canonicalTask: {
              schemaVersion: 1, type: 'task', completed: false, domainLinks: [{
                id: `confirmed-${domain}`, domainId: domain, label: domain,
                userConfirmed: true, source: 'user', strength: 'primary',
                createdAt: index + 1, updatedAt: index + 1,
              }],
            } } });
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Synthetic Glimmer seed aborted')); };
      };
    });
    localStorage.setItem('bubble-universe-store', JSON.stringify({ version: 0,
      state: { ...backup.state, settings, glimmers: [saved] } }));
  }, { noon, savedId: SAVED_GLIMMER_ID, savedMessage: SAVED_GLIMMER_MESSAGE });

  // The shell generates real current-day rows on List. Its actual frequency
  // cap then prevents the legacy producer from creating an incompatible new-tone
  // card on root. Concurrent shell effects can exceed the cap before writes
  // settle; this fixture does not claim that inherited producer race is fixed.
  await page.goto('/list');
  await expect(page.getByTestId('generated-glimmer')).toBeVisible();
  await expect.poll(async () => (await readGlimmerRows(page)).length).toBeGreaterThanOrEqual(3);
  await expect.poll(async () => (await readGlimmerRows(page)).filter(row => row.tone === 'supportive').length).toBeGreaterThan(0);
  await expect(page.getByTestId('saved-glimmer')).toHaveCount(0);
  return { errors, blockedRequests };
}

export async function readGlimmerRows(page: Page): Promise<GlimmerRow[]> {
  return page.evaluate(() => new Promise<GlimmerRow[]>((resolve, reject) => {
    const request = indexedDB.open('BubbleUniverse', 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('glimmers', 'readonly');
      const read = tx.objectStore('glimmers').getAll();
      tx.oncomplete = () => { db.close(); resolve(read.result); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Synthetic Glimmer read aborted')); };
    };
  }));
}

export async function expectActiveGlimmers(page: Page, saved = true) {
  await expect(page.getByTestId('generated-glimmer')).toBeVisible();
  if (saved) {
    await expect(page.getByTestId('saved-glimmer')).toBeVisible();
    await expect(page.getByTestId('saved-glimmer')).toContainText(SAVED_GLIMMER_MESSAGE);
  }
  expect(await page.evaluate(() => {
    const backup = JSON.parse(localStorage.getItem('bubble-universe-store') || 'null');
    return { intelligence: backup?.state.settings.intelligenceEnabled,
      glimmers: backup?.state.settings.glimmersEnabled };
  })).toEqual({ intelligence: true, glimmers: true });
  expect((await readGlimmerRows(page)).every(row => !row.dismissed)).toBe(true);
}
