import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ControllableOpenRequest extends Partial<IDBOpenDBRequest> {
  error: DOMException | null;
  onerror: ((this: IDBRequest<IDBDatabase>, ev: Event) => unknown) | null;
  onsuccess: ((this: IDBRequest<IDBDatabase>, ev: Event) => unknown) | null;
  onupgradeneeded: ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown) | null;
  result: IDBDatabase;
}

describe('storageService initialization', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens IndexedDB once when initialization callers overlap', async () => {
    const database = {} as IDBDatabase;
    const request: ControllableOpenRequest = {
      error: null,
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
      result: database,
    };
    const open = vi.spyOn(indexedDB, 'open').mockReturnValue(request as IDBOpenDBRequest);

    const { storageService } = await import('../storage');
    const firstInitialization = storageService.initialize();
    const secondInitialization = storageService.initialize();

    expect(open).toHaveBeenCalledTimes(1);
    request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'));

    await expect(Promise.all([firstInitialization, secondInitialization])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(storageService.isInitialized()).toBe(true);
  });

  it('lets a cold getDatabase call join initialization instead of throwing', async () => {
    const database = {} as IDBDatabase;
    const request: ControllableOpenRequest = {
      error: null,
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
      result: database,
    };
    const open = vi.spyOn(indexedDB, 'open').mockReturnValue(request as IDBOpenDBRequest);

    const { storageService } = await import('../storage');
    const databasePromise = Promise.resolve().then(() => storageService.getDatabase());
    void databasePromise.catch(() => undefined);

    await Promise.resolve();
    expect(open).toHaveBeenCalledTimes(1);
    request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'));

    await expect(databasePromise).resolves.toBe(database);
  });
});
