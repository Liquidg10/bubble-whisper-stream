import type { Page } from '@playwright/test';

/** Real local app/storage; only synthetic auth and function responses. */
export async function prepareOutboundFixture(page: Page, outcome: 'written' | 'lost' | 'disabled') {
  const owner = '11111111-1111-4111-8111-111111111111';
  const account = '33333333-3333-4333-8333-333333333333';
  const eventId = 'synthetic-outbound-event';
  const taskId = 'synthetic-outbound-task';
  const calendar = { startTime: '2030-01-01T10:00:00.000Z', durationMin: 60, calendarId: account };
  const provenance = { userId: owner, calendarImport: { calendarAccountId: account, eventId } };
  const bubble = { id: taskId, content: 'Synthetic reviewed task title', type: 'Task',
    x: 0, y: 0, size: 0.5, tags: [], completed: false, createdAt: 1, updatedAt: 2,
    metadata: { ...provenance, calendar, canonicalTask: { schemaVersion: 1, type: 'event', completed: false, metadata: provenance, view: { calendar } } } };
  const fields = { title: 'Synthetic provider title', description: '', location: '', startTime: calendar.startTime,
    endTime: '2030-01-01T11:00:00.000Z', startTz: null, endTz: null };
  const envelope = { version: 1, ownerUserId: owner, mappings: [{ taskId, eventId, calendarAccountId: account,
    lastSyncedAt: 1, syncDirection: 'calendar-to-task', conflictStatus: 'none' }], conflicts: [], unresolvedOperations: [] };
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test',
    email_confirmed_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z', app_metadata: {}, user_metadata: {}, identities: [] };
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: expiry })}.synthetic-invalid-signature`;
  const calls: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') return route.fulfill({ json: {
      access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: expiry, refresh_token: 'synthetic-local-only', user } });
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return route.fulfill({ json: user });
    if (url.pathname === '/functions/v1/calendar-sync' && request.method() === 'POST') {
      const body = request.postDataJSON(); calls.push(body);
      const base = { version: 1, operationId: body.operationId, calendarAccountId: account, eventId };
      if (body.action === 'prepare_reviewed_update') return route.fulfill({ json: outcome === 'disabled'
        ? { ...base, outcome: 'not_written', code: 'disabled' }
        : { ...base, outcome: 'ready', expectedEtag: '"old"', before: fields } });
      if (body.action === 'confirm_reviewed_update') {
        if (outcome === 'lost') return route.abort();
        return route.fulfill({ json: { ...base, outcome: 'written', etag: '"new"', fields: body.after, cacheUpdated: true } });
      }
      if (body.action === 'inspect_reviewed_outcome') {
        // Deliberately match the reviewed outgoing fields: observing a match
        // still must not resolve or replay the earlier lost outcome.
        const submitted = calls.find(call => call.action === 'confirm_reviewed_update');
        return route.fulfill({ json: { ...base, outcome: 'observed', observationOnly: true,
          etag: '"observed"', fields: submitted?.after ?? fields, observedAt: Date.now() } });
      }
    }
    if (url.pathname.startsWith('/rest/v1/') && request.method() === 'GET') {
      return route.fulfill({ json: request.headers().accept?.includes('vnd.pgrst.object') ? null : [] });
    }
    return route.abort();
  });
  await page.goto('/login');
  const onboarding = page.getByRole('dialog', { name: 'Welcome' });
  if (await onboarding.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) await page.keyboard.press('Escape');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-local-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(/\/$/);
  await page.evaluate(async ({ bubble, owner, envelope }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('BubbleUniverse', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('bubbles', 'readwrite');
        tx.objectStore('bubbles').put(bubble);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(new Error('Synthetic seed failed')); };
      };
    });
    localStorage.setItem(`calendar-task-sync:v1:${owner}`, JSON.stringify(envelope));
  }, { bubble, owner, envelope });
  await page.goto('/calendar');
  return { owner, taskId, bubble, envelope, calls, errors };
}

export async function readOutboundFixture(page: Page, owner: string, taskId: string) {
  return page.evaluate(async ({ owner, taskId }) => {
    const row = await new Promise<unknown>((resolve, reject) => {
      const request = indexedDB.open('BubbleUniverse', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('bubbles', 'readonly');
        const read = tx.objectStore('bubbles').get(taskId);
        tx.oncomplete = () => { db.close(); resolve(read.result); };
        tx.onabort = () => { db.close(); reject(new Error('Synthetic read failed')); };
      };
    });
    return { row, envelope: JSON.parse(localStorage.getItem(`calendar-task-sync:v1:${owner}`)!),
      journal: JSON.parse(localStorage.getItem(`calendar-task-outbound:v1:${owner}`) ?? 'null') };
  }, { owner, taskId });
}
