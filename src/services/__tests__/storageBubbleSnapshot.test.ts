import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bubble } from '@/types/bubble';

const MAX_ROWS = 10_000;
const MAX_BYTES = 16 * 1024 * 1024;
const FAILURE = 'Committed bubble snapshot could not be verified';
const bubble: Bubble = {
  id: 'synthetic-bubble', type: 'Task', content: 'Synthetic local task',
  x: 0, y: 0, size: 1, tags: [], createdAt: 1, updatedAt: 1,
};
type Handler = ((event: Event) => void) | null;

async function fixture() {
  const request = { result: null as IDBCursorWithValue | null, onsuccess: null as Handler, onerror: null as Handler };
  const advance = vi.fn();
  const store = { openCursor: vi.fn(() => request) };
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
  const row = (value: unknown) => {
    request.result = { value, continue: advance } as unknown as IDBCursorWithValue;
    request.onsuccess?.(new Event('success'));
  };
  const exhaust = () => {
    request.result = null;
    request.onsuccess?.(new Event('success'));
  };
  return { storageService, database, transaction, store, request, advance, row, exhaust };
}

describe('committed bubble recovery snapshot', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('requires explicit initialization and does not open a database implicitly', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    const { storageService } = await import('../storage');
    await expect(storageService.readCommittedBubbles()).rejects.toThrow('Database not initialized');
    expect(open).not.toHaveBeenCalled();
  });

  it('uses a readonly cursor and releases rows only after exhaustion and transaction completion', async () => {
    const { storageService, database, store, transaction, advance, row, exhaust } = await fixture();
    const settled = vi.fn();
    const read = storageService.readCommittedBubbles().then(settled);
    expect(database.transaction).toHaveBeenCalledExactlyOnceWith(['bubbles'], 'readonly');
    expect(store.openCursor).toHaveBeenCalledExactlyOnceWith();
    row(bubble);
    expect(advance).toHaveBeenCalledOnce();
    exhaust();
    await Promise.resolve(); await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    transaction.oncomplete?.(new Event('complete'));
    await read;
    expect(settled).toHaveBeenCalledExactlyOnceWith([bubble]);
    expect(transaction.abort).not.toHaveBeenCalled();
  });

  it('returns an empty snapshot only for a completed empty cursor', async () => {
    const { storageService, transaction, exhaust } = await fixture();
    const settled = vi.fn();
    const read = storageService.readCommittedBubbles().then(settled);
    exhaust();
    await Promise.resolve(); await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    transaction.oncomplete?.(new Event('complete'));
    await read;
    expect(settled).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('rejects a completed transaction without a fully exhausted cursor', async () => {
    const { storageService, transaction, row } = await fixture();
    const assertion = expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    row(bubble);
    transaction.oncomplete?.(new Event('complete'));
    await assertion;
  });

  it('rejects a late abort after successful cursor exhaustion instead of returning partial rows', async () => {
    const { storageService, transaction, row, exhaust } = await fixture();
    const assertion = expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    row(bubble); exhaust();
    transaction.onabort?.(new Event('abort'));
    await assertion;
  });

  it.each(['request', 'transaction'] as const)('rejects %s errors even if another handler suppresses the default abort', async source => {
    const { storageService, transaction, request, row, exhaust } = await fixture();
    const assertion = expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    row(bubble);
    const event = new Event('error', { cancelable: true });
    event.preventDefault();
    (source === 'request' ? request : transaction).onerror?.(event);
    await assertion;
    expect(transaction.abort).toHaveBeenCalledOnce();
    exhaust(); transaction.oncomplete?.(new Event('complete'));
  });

  it('rejects transaction creation failures without exposing the database error', async () => {
    const { storageService, database } = await fixture();
    database.transaction.mockImplementationOnce(() => { throw new Error('PRIVATE_DATABASE_DETAIL'); });
    await expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
  });

  it.each(['objectStore', 'openCursor'] as const)('aborts and sanitizes %s enqueue failures', async source => {
    const { storageService, transaction, store } = await fixture();
    if (source === 'objectStore') transaction.objectStore.mockImplementationOnce(() => { throw new Error('PRIVATE_STORE_DETAIL'); });
    else store.openCursor.mockImplementationOnce(() => { throw new Error('PRIVATE_CURSOR_DETAIL'); });
    await expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    expect(transaction.abort).toHaveBeenCalledOnce();
  });

  it('aborts and sanitizes a cursor value read failure', async () => {
    const { storageService, transaction, request, advance } = await fixture();
    const assertion = expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    request.result = { get value() { throw new Error('PRIVATE_VALUE_DETAIL'); }, continue: advance } as unknown as IDBCursorWithValue;
    request.onsuccess?.(new Event('success'));
    await assertion;
    expect(advance).not.toHaveBeenCalled();
    expect(transaction.abort).toHaveBeenCalledOnce();
  });

  it('rejects cursor continuation failure without returning the accumulated row', async () => {
    const { storageService, transaction, advance, row } = await fixture();
    advance.mockImplementationOnce(() => { throw new Error('PRIVATE_CONTINUE_DETAIL'); });
    const assertion = expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    row(bubble);
    await assertion;
    expect(transaction.abort).toHaveBeenCalledOnce();
  });

  it.each(['circular', 'bigint', 'undefined'])('rejects a row whose serialized size cannot be verified: %s', async kind => {
    const { storageService, transaction, advance, row } = await fixture();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const value = kind === 'circular' ? circular : kind === 'bigint' ? { id: 'synthetic', value: 1n } : undefined;
    const assertion = expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    row(value);
    await assertion;
    expect(transaction.abort).toHaveBeenCalledOnce();
    expect(advance).not.toHaveBeenCalled();
  });

  it('accepts exactly 10,000 rows once the readonly transaction completes', async () => {
    const { storageService, transaction, advance, row, exhaust } = await fixture();
    const read = storageService.readCommittedBubbles();
    for (let index = 0; index < MAX_ROWS; index++) row({ ...bubble, id: `synthetic-${index}` });
    exhaust(); transaction.oncomplete?.(new Event('complete'));
    expect(await read).toHaveLength(MAX_ROWS);
    expect(advance).toHaveBeenCalledTimes(MAX_ROWS);
  });

  it('aborts before retaining or advancing past the 10,001st row', async () => {
    const { storageService, transaction, request, advance, row } = await fixture();
    const assertion = expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    for (let index = 0; index < MAX_ROWS; index++) row({ ...bubble, id: `synthetic-${index}` });
    const value = vi.fn(() => bubble);
    request.result = { get value() { return value(); }, continue: advance } as unknown as IDBCursorWithValue;
    request.onsuccess?.(new Event('success'));
    await assertion;
    expect(value).not.toHaveBeenCalled();
    expect(advance).toHaveBeenCalledTimes(MAX_ROWS);
    expect(transaction.abort).toHaveBeenCalledOnce();
  });

  it('accepts exactly 16 MiB including array brackets, row bytes and the separator', async () => {
    const { storageService, transaction, row, exhaust } = await fixture();
    const first = { id: 'first', content: '' };
    const second = { id: 'second', content: '' };
    const overhead = JSON.stringify([first, second]).length;
    second.content = 'x'.repeat(MAX_BYTES - overhead);
    const read = storageService.readCommittedBubbles();
    row(first); row(second); exhaust();
    transaction.oncomplete?.(new Event('complete'));
    const result = await read;
    expect(result).toHaveLength(2);
    expect(result[1].content.length).toBe(MAX_BYTES - overhead);
  });

  it('rejects a cumulative snapshot one byte over the serialized array budget', async () => {
    const { storageService, transaction, advance, row } = await fixture();
    const first = { id: 'first', content: '' };
    const second = { id: 'second', content: '' };
    second.content = 'x'.repeat(MAX_BYTES - JSON.stringify([first, second]).length + 1);
    const assertion = expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    row(first); row(second);
    await assertion;
    expect(advance).toHaveBeenCalledOnce();
    expect(transaction.abort).toHaveBeenCalledOnce();
  });

  it('enforces UTF-8 bytes rather than only JavaScript string length', async () => {
    const { storageService, transaction, advance, row } = await fixture();
    const value = { id: 'synthetic', content: 'é'.repeat(MAX_BYTES / 2) };
    expect(JSON.stringify(value).length).toBeLessThan(MAX_BYTES);
    const assertion = expect(storageService.readCommittedBubbles()).rejects.toThrow(FAILURE);
    row(value);
    await assertion;
    expect(advance).not.toHaveBeenCalled();
    expect(transaction.abort).toHaveBeenCalledOnce();
  });
});
