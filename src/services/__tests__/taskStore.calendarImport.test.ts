import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { taskToBubble } from '@/adapters/taskAdapter';
import { createTask, type Task } from '@/types/task';
import type { Bubble } from '@/types/bubble';
import type { TaskMutationOptions } from '@/stores/taskStore';

const mock = vi.hoisted(() => ({
  bubbles: [] as import('@/types/bubble').Bubble[],
  add: vi.fn(), update: vi.fn(), evaluate: vi.fn(), subscribe: vi.fn(),
  debug: vi.fn(), error: vi.fn(), vision: vi.fn(),
}));
vi.mock('@/stores/bubbleStore', () => ({ useBubbleStore: {
  getState: () => ({ bubbles: mock.bubbles, addBubble: mock.add, updateBubbleStrict: mock.update }),
  // This fixture deliberately does not simulate the global publication
  // subscription; the facade cannot prevent BubbleStore's admitted updates.
  subscribe: mock.subscribe,
} }));
vi.mock('@/services/taskAwareAutoWriteService', () => ({
  taskAwareAutoWriteService: { evaluateTask: mock.evaluate },
}));
vi.mock('@/utils/logger', () => ({ logger: { debug: mock.debug, error: mock.error } }));

type TaskStore = typeof import('@/stores/taskStore')['useTaskStore'];
const OWNER = 'synthetic-owner';
const FOREIGN = 'different-owner';

function importedTask(owner: string | undefined = OWNER): Omit<Task, 'id'> {
  return createTask('Imported calendar event', 'event', {
    start: 1_790_000_000_000,
    end: 1_790_003_600_000,
    metadata: owner === undefined ? undefined : { userId: owner, calendarEventId: 'provider-event-fixture' },
  });
}

function importOptions(isCurrent: () => boolean = () => true): TaskMutationOptions {
  return { origin: 'calendar-import', ownerUserId: OWNER, isCurrent };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('TaskStore calendar-import boundary', () => {
  let store: TaskStore;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    mock.bubbles = [];
    mock.subscribe.mockReturnValue(() => {});
    mock.evaluate.mockResolvedValue(undefined);
    mock.add.mockImplementation(async (bubble: Bubble) => {
      // Mirror the only implicit provider child in BubbleStore.addBubble.
      if (bubble.imageUri && !bubble.caption) await mock.vision(bubble.imageUri);
      mock.bubbles.push(bubble);
    });
    mock.update.mockImplementation(async (bubble: Bubble) => {
      mock.bubbles = mock.bubbles.map(existing => existing.id === bubble.id ? bubble : existing);
    });
    store = (await import('@/stores/taskStore')).useTaskStore;
  });

  afterEach(() => { vi.restoreAllMocks(); });

  function seed(owner: string | null = OWNER): Task {
    const task: Task = { ...importedTask(), id: 'existing-local-task', metadata: owner === null ? undefined : { userId: owner } };
    mock.bubbles = [taskToBubble(task)];
    store.getState().refreshFromBubbleStore();
    vi.clearAllMocks();
    return task;
  }

  it('returns the generated persisted ID and never evaluates an imported add', async () => {
    const task = await store.getState().addTask(importedTask(), importOptions());
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mock.add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: task.id }));
    expect(mock.bubbles[0].metadata?.userId).toBe(OWNER);
    expect(store.getState().getTask(task.id)?.metadata?.userId).toBe(OWNER);
    expect(mock.evaluate).not.toHaveBeenCalled();
    expect(mock.vision).not.toHaveBeenCalled();
  });

  it('updates an exactly owned task without outbound evaluation and preserves its ID', async () => {
    const task = seed();
    await store.getState().updateTask(task.id, {
      id: 'cannot-replace-local-id', title: 'Provider update', metadata: { userId: OWNER, calendarEventId: 'same-event' },
    }, importOptions());
    expect(mock.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: task.id, content: 'Provider update' }));
    expect(store.getState().getTask(task.id)?.metadata).toMatchObject({ userId: OWNER, calendarEventId: 'same-event' });
    expect(mock.evaluate).not.toHaveBeenCalled();
  });

  it.each([FOREIGN, undefined])('rejects an imported add with foreign or missing ownership: %s', async (owner) => {
    const task = { ...importedTask(), metadata: owner === undefined ? undefined : { userId: owner } };
    await expect(store.getState().addTask(task, importOptions())).rejects.toThrow('owner does not match');
    expect(mock.add).not.toHaveBeenCalled();
    expect(mock.evaluate).not.toHaveBeenCalled();
  });

  it.each([FOREIGN, undefined])('cannot adopt a foreign or unowned existing task: %s', async (owner) => {
    const task = seed(owner ?? null);
    await expect(store.getState().updateTask(task.id, { metadata: { userId: OWNER } }, importOptions())).rejects.toThrow('owner does not match');
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.evaluate).not.toHaveBeenCalled();
  });

  it.each([{ userId: FOREIGN }, {}, undefined])('cannot change or erase an owned task owner: %j', async (metadata) => {
    const task = seed();
    await expect(store.getState().updateTask(task.id, { metadata }, importOptions())).rejects.toThrow('owner does not match');
    expect(mock.update).not.toHaveBeenCalled();
    expect(store.getState().getTask(task.id)?.metadata?.userId).toBe(OWNER);
  });

  it('retains existing ownership for partial updates that omit metadata', async () => {
    const task = seed();
    await store.getState().updateTask(task.id, { title: 'Imported title' }, importOptions());
    expect(mock.update).toHaveBeenCalledOnce();
    expect(store.getState().getTask(task.id)?.metadata?.userId).toBe(OWNER);
    expect(mock.evaluate).not.toHaveBeenCalled();
  });

  it.each(['add', 'update'])('rejects stale %s admission before persistence or facade refresh', async (operation) => {
    const task = seed();
    const refresh = vi.spyOn(store.getState(), 'refreshFromBubbleStore');
    const options = importOptions(() => false);
    const result = operation === 'add'
      ? store.getState().addTask(importedTask(), options)
      : store.getState().updateTask(task.id, { title: 'stale' }, options);
    await expect(result).rejects.toThrow('no longer current');
    expect(mock.add).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(mock.evaluate).not.toHaveBeenCalled();
  });

  it('treats a throwing current-generation callback as stale', async () => {
    await expect(store.getState().addTask(importedTask(), importOptions(() => { throw new Error('private callback context'); }))).rejects.toThrow('no longer current');
    expect(mock.add).not.toHaveBeenCalled();
    expect(JSON.stringify(mock.error.mock.calls)).not.toContain('private callback context');
  });

  it.each(['add', 'update'])('does not refresh, log success, or evaluate a stopped %s after admitted persistence settles', async (operation) => {
    const task = seed();
    let current = true;
    const gate = deferred();
    const persist = operation === 'add' ? mock.add : mock.update;
    persist.mockImplementationOnce(async (bubble: Bubble) => {
      await gate.promise;
      // Admitted backing-store publication is outside this facade's guard.
      mock.bubbles = operation === 'add' ? [...mock.bubbles, bubble] : [bubble];
    });
    const refresh = vi.spyOn(store.getState(), 'refreshFromBubbleStore');
    const pending = operation === 'add'
      ? store.getState().addTask(importedTask(), importOptions(() => current))
      : store.getState().updateTask(task.id, { title: 'admitted before stop' }, importOptions(() => current));
    const rejected = expect(pending).rejects.toThrow('no longer current');
    current = false;
    mock.debug.mockClear();
    mock.error.mockClear();
    gate.resolve();
    await rejected;
    expect(persist).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    expect(mock.debug).not.toHaveBeenCalled();
    expect(mock.error).not.toHaveBeenCalled();
    expect(mock.evaluate).not.toHaveBeenCalled();
    expect(store.getState().isLoading).toBe(false);
  });

  it('captures the admitted owner and metadata while persistence waits', async () => {
    const gate = deferred();
    const task = importedTask();
    const options = importOptions();
    mock.add.mockReturnValueOnce(gate.promise);
    const pending = store.getState().addTask(task, options);
    options.ownerUserId = FOREIGN;
    task.metadata!.userId = FOREIGN;
    gate.resolve();
    const result = await pending;
    expect(result.metadata?.userId).toBe(OWNER);
    expect(mock.add.mock.calls[0][0].metadata.userId).toBe(OWNER);
  });

  it('cannot turn imported image-like fields into implicit vision work', async () => {
    const task = { ...importedTask(), imageUri: 'https://example.invalid/private-image', metadata: { userId: OWNER, imageUri: 'https://example.invalid/metadata-image' } };
    await store.getState().addTask(task, importOptions());
    expect(mock.add.mock.calls[0][0]).not.toHaveProperty('imageUri');
    expect(mock.vision).not.toHaveBeenCalled();
    expect(mock.evaluate).not.toHaveBeenCalled();
  });

  it('preserves existing image attachments on strict imported updates without analyzing them', async () => {
    const task = seed();
    mock.bubbles[0].imageUri = 'local://existing-photo';
    await store.getState().updateTask(task.id, { title: 'Provider title' }, importOptions());
    expect(mock.update.mock.calls[0][0].imageUri).toBe('local://existing-photo');
    expect(mock.add).not.toHaveBeenCalled();
    expect(mock.vision).not.toHaveBeenCalled();
    expect(mock.evaluate).not.toHaveBeenCalled();
  });

  it('keeps ordinary updates compatible while awaiting their induced evaluation', async () => {
    const task = seed();
    const evaluation = deferred();
    mock.evaluate.mockReturnValueOnce(evaluation.promise);
    let settled = false;
    const pending = store.getState().updateTask(task.id, { title: 'Explicit user edit' }).then(() => { settled = true; });
    await vi.waitFor(() => expect(mock.evaluate).toHaveBeenCalledOnce());
    expect(mock.update).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    expect(store.getState().isLoading).toBe(true);
    evaluation.resolve();
    await pending;
    expect(settled).toBe(true);
    expect(store.getState().isLoading).toBe(false);
    expect(mock.evaluate.mock.calls[0][0].title).toBe('Explicit user edit');
  });

  it('handles ordinary evaluation rejection after persistence without rejecting the saved edit', async () => {
    const task = seed();
    mock.evaluate.mockRejectedValueOnce(new Error('evaluation unavailable'));
    await expect(store.getState().updateTask(task.id, { title: 'Persisted user edit' })).resolves.toBeUndefined();
    expect(mock.update).toHaveBeenCalledOnce();
    expect(store.getState().getTask(task.id)?.title).toBe('Persisted user edit');
    expect(mock.error).toHaveBeenCalledWith('Auto-write evaluation failed', expect.any(Error), { taskId: task.id });
  });

  it.each(['add', 'update'])('propagates %s persistence failure without reporting a completed import', async (operation) => {
    const task = seed();
    (operation === 'add' ? mock.add : mock.update).mockRejectedValueOnce(new Error('commit failed'));
    const result = operation === 'add'
      ? store.getState().addTask(importedTask(), importOptions())
      : store.getState().updateTask(task.id, { title: 'uncommitted' }, importOptions());
    await expect(result).rejects.toThrow('commit failed');
    expect(mock.evaluate).not.toHaveBeenCalled();
    expect(store.getState().getTask(task.id)?.title).toBe(task.title);
    expect(store.getState().isLoading).toBe(false);
  });
});
