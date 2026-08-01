import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock('../storage', () => ({
  storageService: {
    getDatabase: storageMocks.getDatabase,
  },
}));

function resolvedRequest<T>(result: T): IDBRequest<T> {
  const request = {
    error: null,
    onerror: null,
    onsuccess: null,
    result,
  } as unknown as IDBRequest<T>;

  queueMicrotask(() => request.onsuccess?.call(request, new Event('success')));
  return request;
}

describe('selfModelV2Service cold start', () => {
  beforeEach(() => {
    vi.resetModules();
    storageMocks.getDatabase.mockReset();
  });

  it('persists the version-one default without recursively updating it', async () => {
    const get = vi.fn(() => resolvedRequest<SelfModelV2Record | undefined>(undefined));
    const put = vi.fn((value: SelfModelV2Record) => resolvedRequest<IDBValidKey>(value.id));
    const database = {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({ get, put })),
      })),
    } as unknown as IDBDatabase;
    storageMocks.getDatabase.mockResolvedValue(database);

    const { selfModelV2Service } = await import('../selfModelV2Service');
    const recursiveUpdate = vi
      .spyOn(selfModelV2Service, 'updateSelfModel')
      .mockRejectedValue(new Error('default creation must not recurse through updateSelfModel'));

    await expect(selfModelV2Service.getSelfModel()).resolves.toMatchObject({
      id: 'self',
      version: 1,
      preferences: {},
    });
    expect(recursiveUpdate).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledOnce();
  });
});

interface SelfModelV2Record {
  id: 'self';
  version: number;
  preferences: Record<string, unknown>;
}
