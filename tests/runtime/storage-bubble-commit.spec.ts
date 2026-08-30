import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/services/storage.ts', import.meta.url), 'utf8');
const moduleSource = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const lockSource = ts.transpileModule(readFileSync(new URL('../../src/services/calendarSyncCoordinator.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

test.beforeEach(async ({ page, context }) => {
  // Interception gives IndexedDB a normal origin without a server or network.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:37337') return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<title>Isolated storage contract</title>' });
    if (url.pathname === '/storage.js') return route.fulfill({ contentType: 'text/javascript', body: moduleSource });
    if (url.pathname === '/coordinator.js') return route.fulfill({ contentType: 'text/javascript', body: lockSource });
    return route.abort();
  });
  await page.goto('http://127.0.0.1:37337/');
});

test('committed recovery snapshot uses real readonly transaction completion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/storage.js';
    const { storageService } = await import(modulePath);
    await storageService.initialize();
    await storageService.createBubble({ id: 'saved-task', content: 'already committed' });
    const events: string[] = [];
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = Reflect.apply(original, this, args) as IDBTransaction;
      if (args[1] === 'readonly') transaction.addEventListener('complete', () => events.push('read-complete'));
      return transaction;
    };
    try {
      const rows = await storageService.readCommittedBubbles();
      events.push('snapshot-receipt');
      return { events, ids: rows.map((row: { id: string }) => row.id) };
    } finally {
      IDBDatabase.prototype.transaction = original;
      (await storageService.getDatabase()).close();
    }
  });
  expect(result).toEqual({ events: ['read-complete', 'snapshot-receipt'], ids: ['saved-task'] });
});

test('recovery snapshot rejects real abort after cursor exhaustion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/storage.js';
    const { storageService } = await import(modulePath);
    await storageService.initialize();
    await storageService.createBubble({ id: 'saved-task', content: 'unchanged' });
    const original = IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.openCursor = function (...args) {
      const request = Reflect.apply(original, this, args) as IDBRequest<IDBCursorWithValue | null>;
      const transaction = this.transaction;
      request.addEventListener('success', () => { if (request.result === null) transaction.abort(); });
      return request;
    };
    try {
      let outcome = 'incorrect-success';
      try { await storageService.readCommittedBubbles(); } catch { outcome = 'rejected'; }
      return { outcome, content: (await storageService.getBubble('saved-task'))?.content };
    } finally {
      IDBObjectStore.prototype.openCursor = original;
      (await storageService.getDatabase()).close();
    }
  });
  expect(result).toEqual({ outcome: 'rejected', content: 'unchanged' });
});

test('real same-origin tabs exclude overlapping calendar work until the first receipt settles', async ({ page, context }) => {
  const owner = '11111111-1111-4111-8111-111111111111';
  await page.evaluate(async owner => {
    const modulePath = '/coordinator.js';
    const { withCalendarSyncLock } = await import(modulePath);
    const controls = window as unknown as { finish: () => void; admitted: boolean; completion: Promise<string> };
    const pending = new Promise<string>(resolve => { controls.finish = () => resolve('first-finished'); });
    controls.completion = withCalendarSyncLock(owner, async () => { controls.admitted = true; return pending; });
  }, owner);
  await expect.poll(() => page.evaluate(() => (window as unknown as { admitted: boolean }).admitted)).toBe(true);
  const second = await context.newPage();
  await second.goto('http://127.0.0.1:37337/');
  const attempt = () => second.evaluate(async owner => {
    const modulePath = '/coordinator.js';
    const { withCalendarSyncLock } = await import(modulePath);
    try { return await withCalendarSyncLock(owner, async () => 'second-admitted'); } catch { return 'held'; }
  }, owner);
  expect(await attempt()).toBe('held');
  expect(await page.evaluate(async () => {
    const controls = window as unknown as { finish: () => void; completion: Promise<string> };
    controls.finish(); return controls.completion;
  })).toBe('first-finished');
  expect(await attempt()).toBe('second-admitted');
  await second.close();
});

for (const operation of ['add', 'put'] as const) {
  test(`${operation}: real IndexedDB commit precedes the save receipt`, async ({ page }) => {
    const result = await page.evaluate(async operation => {
      const modulePath = '/storage.js';
      const { storageService } = await import(modulePath);
      await storageService.initialize();
      const events: string[] = [];
      const original = IDBObjectStore.prototype[operation];
      const originalTransaction = IDBDatabase.prototype.transaction;
      // Observe transaction completion before the service registers oncomplete.
      // Native listener callbacks can have microtask checkpoints between them.
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = Reflect.apply(originalTransaction, this, args) as IDBTransaction;
        if (args[1] === 'readwrite') transaction.addEventListener('complete', () => events.push('commit'));
        return transaction;
      };
      IDBObjectStore.prototype[operation] = function (...args) {
        const request = Reflect.apply(original, this, args) as IDBRequest;
        request.addEventListener('success', () => events.push('request-success'));
        return request;
      };
      try {
        const method = operation === 'add' ? 'createBubble' : 'updateBubble';
        await storageService[method]({ id: 'synthetic-row', content: 'committed' });
        events.push('save-receipt');
        const stored = await storageService.getBubble('synthetic-row');
        return { events, content: stored?.content };
      } finally {
        IDBObjectStore.prototype[operation] = original;
        IDBDatabase.prototype.transaction = originalTransaction;
        (await storageService.getDatabase()).close();
      }
    }, operation);
    expect(result).toEqual({ events: ['request-success', 'commit', 'save-receipt'], content: 'committed' });
  });

  test(`${operation}: abort after request success rejects and leaves original contents intact`, async ({ page }) => {
    const result = await page.evaluate(async operation => {
      const modulePath = '/storage.js';
      const { storageService } = await import(modulePath);
      await storageService.initialize();
      if (operation === 'put') await storageService.createBubble({ id: 'synthetic-row', content: 'original' });
      const events: string[] = [];
      const original = IDBObjectStore.prototype[operation];
      const originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = Reflect.apply(originalTransaction, this, args) as IDBTransaction;
        if (args[1] === 'readwrite') transaction.addEventListener('abort', () => events.push('abort'));
        return transaction;
      };
      IDBObjectStore.prototype[operation] = function (...args) {
        const request = Reflect.apply(original, this, args) as IDBRequest;
        const transaction = this.transaction;
        request.addEventListener('success', () => { events.push('request-success'); transaction.abort(); });
        return request;
      };
      let outcome = 'success';
      try {
        const method = operation === 'add' ? 'createBubble' : 'updateBubble';
        try { await storageService[method]({ id: 'synthetic-row', content: 'must-not-commit' }); }
        catch { outcome = 'rejected'; events.push('save-rejected'); }
        const stored = await storageService.getBubble('synthetic-row');
        return { outcome, events, content: stored?.content ?? null };
      } finally {
        IDBObjectStore.prototype[operation] = original;
        IDBDatabase.prototype.transaction = originalTransaction;
        (await storageService.getDatabase()).close();
      }
    }, operation);
    expect(result).toEqual({ outcome: 'rejected', events: ['request-success', 'abort', 'save-rejected'], content: operation === 'put' ? 'original' : null });
  });
}
