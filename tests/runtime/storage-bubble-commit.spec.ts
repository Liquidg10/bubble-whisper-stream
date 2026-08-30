import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/services/storage.ts', import.meta.url), 'utf8');
const moduleSource = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

test.beforeEach(async ({ page }) => {
  // Interception gives IndexedDB a normal origin without a server or network.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:37337') return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<title>Isolated storage contract</title>' });
    if (url.pathname === '/storage.js') return route.fulfill({ contentType: 'text/javascript', body: moduleSource });
    return route.abort();
  });
  await page.goto('http://127.0.0.1:37337/');
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
