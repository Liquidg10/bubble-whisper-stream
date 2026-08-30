import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bubble } from '@/types/bubble';

const bubble: Bubble = {
  id: 'synthetic-bubble', type: 'Task', content: 'Synthetic local task',
  x: 0, y: 0, size: 1, tags: [], createdAt: 1, updatedAt: 1,
};
type Handler = ((event: Event) => void) | null;

async function fixture() {
  const request = { onsuccess: null as Handler, onerror: null as Handler };
  const store = { add: vi.fn(() => request), put: vi.fn(() => request) };
  const transaction = {
    oncomplete: null as Handler, onabort: null as Handler, onerror: null as Handler,
    objectStore: vi.fn(() => store), abort: vi.fn(),
  };
  const database = { transaction: vi.fn(() => transaction) };
  const openRequest = { result: database, onsuccess: null as Handler, onerror: null as Handler, onupgradeneeded: null };
  vi.spyOn(indexedDB, 'open').mockReturnValue(openRequest as unknown as IDBOpenDBRequest);
  const { storageService } = await import('../storage');
  const initialization = storageService.initialize();
  openRequest.onsuccess?.(new Event('success'));
  await initialization;
  return { storageService, request, store, transaction, database };
}

describe('bubble save transaction completion', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.restoreAllMocks(); });

  for (const method of ['createBubble', 'updateBubble'] as const) {
    it(`${method} remains pending after request success and resolves only after commit`, async () => {
      const { storageService, request, store, transaction, database } = await fixture();
      const settled = vi.fn();
      const save = storageService[method](bubble).then(settled);
      expect(database.transaction).toHaveBeenCalledWith(['bubbles'], 'readwrite');
      expect(store[method === 'createBubble' ? 'add' : 'put']).toHaveBeenCalledWith(bubble);
      request.onsuccess?.(new Event('success'));
      await Promise.resolve(); await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      transaction.oncomplete?.(new Event('complete'));
      await save;
      expect(settled).toHaveBeenCalledTimes(1);
    });

    it(`${method} rejects a late abort even after request success`, async () => {
      const { storageService, request, transaction } = await fixture();
      const save = storageService[method](bubble);
      const assertion = expect(save).rejects.toThrow('aborted before commit');
      request.onsuccess?.(new Event('success'));
      transaction.onabort?.(new Event('abort'));
      await assertion;
    });

    it(`${method} retains pending accounting until an errored transaction aborts`, async () => {
      const { storageService, request, transaction } = await fixture();
      const settled = vi.fn();
      const save = storageService[method](bubble).then(settled, settled);
      request.onerror?.(new Event('error'));
      transaction.onerror?.(new Event('error'));
      await Promise.resolve(); await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      transaction.onabort?.(new Event('abort'));
      await save;
      expect(settled).toHaveBeenCalledWith(expect.any(Error));
    });

    it(`${method} does not call a failed request a success if an error was suppressed elsewhere`, async () => {
      const { storageService, request, transaction } = await fixture();
      const save = storageService[method](bubble);
      const assertion = expect(save).rejects.toThrow('without a verified write');
      request.onerror?.(new Event('error'));
      transaction.oncomplete?.(new Event('complete'));
      await assertion;
    });

    it(`${method} aborts and rejects enqueue errors without echoing payloads`, async () => {
      const { storageService, store, transaction } = await fixture();
      store[method === 'createBubble' ? 'add' : 'put'].mockImplementation(() => { throw new Error('PRIVATE_CONTENT'); });
      await expect(storageService[method](bubble)).rejects.toThrow('Unable to enqueue bubble write');
      expect(transaction.abort).toHaveBeenCalledTimes(1);
      transaction.onabort?.(new Event('abort'));
    });
  }
});
