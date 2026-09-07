import { describe, expect, it, vi } from 'vitest';
import { bubbleToTask, taskToBubble } from '@/adapters/taskAdapter';
import { createTask, type Task } from '@/types/task';
import { createUserDomainLink } from '@/domain/lifeDomains';
import { createSproutTask, suggestBubbleSprouts } from '@/domain/bubbleGarden';
import { addSproutOnce, deriveBubbleFamily, patchSproutDismissal, persistSproutDismissal, readDismissedSproutKeys } from '../bubbleGardenState';

function source(id = 'parent'): Task {
  return { ...createTask('Make room for a project', 'task', { description: 'Keep these notes', domainLinks: [createUserDomainLink('Home')], metadata: { custom: { preserved: true }, bubbleGarden: { pack: 'living-bubbles-v1', lesson: 'connect', sourceTaskId: 'older-parent' } } }), id };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('Durable Garden review choices', () => {
  it('round-trips arbitrary dismissal keys while preserving source words, lineage, links and visual fields', () => {
    const original = { ...taskToBubble(source()), x: 12.34, y: -44.2, size: 0.37321, imageUri: 'local-image', audioUri: 'local-audio' };
    const before = structuredClone(original);
    const key = `parent:note:${encodeURIComponent('A detailed note '.repeat(35))}`;
    const dismissed = patchSproutDismissal(original, { type: 'dismiss', key }, original.updatedAt);
    expect(original).toEqual(before);
    expect({ ...dismissed, metadata: original.metadata, updatedAt: original.updatedAt }).toEqual(original);
    const restored = bubbleToTask(dismissed);
    expect(readDismissedSproutKeys(restored)).toEqual([key]);
    expect(restored).toMatchObject({ title: before.content, description: before.caption, domainLinks: source().domainLinks?.map(link => expect.objectContaining({ domainId: link.domainId })), metadata: { custom: { preserved: true }, bubbleGarden: { sourceTaskId: 'older-parent', pack: 'living-bubbles-v1', lesson: 'connect' } } });
    expect(dismissed.updatedAt).toBeGreaterThan(original.updatedAt);
    expect(readDismissedSproutKeys(bubbleToTask(patchSproutDismissal(dismissed, { type: 'restore' })))).toEqual([]);
  });

  it('serializes rapid changes and reads the current metadata for each durable write', async () => {
    let current = taskToBubble(source('queue-parent'));
    const gate = deferred();
    let count = 0;
    const persistence = {
      getBubble: () => current,
      saveBubble: vi.fn(async bubble => {
        if (++count === 1) await gate.promise;
        current = bubble;
        if (count === 1) current = { ...current, content: 'Freshly renamed source', metadata: { ...current.metadata, concurrentField: 'keep me' } };
      }),
    };
    const first = persistSproutDismissal(current.id, { type: 'dismiss', key: 'one' }, persistence);
    const second = persistSproutDismissal(current.id, { type: 'dismiss', key: 'two' }, persistence);
    await Promise.resolve(); await Promise.resolve();
    expect(persistence.saveBubble).toHaveBeenCalledTimes(1);
    gate.resolve(); await Promise.all([first, second]);
    expect(readDismissedSproutKeys(bubbleToTask(current))).toEqual(['one', 'two']);
    expect(current.content).toBe('Freshly renamed source');
    expect(current.metadata?.concurrentField).toBe('keep me');
  });

  it('leaves preferences unchanged on failure and permits a later retry', async () => {
    let current = taskToBubble(source('failed-review'));
    const original = structuredClone(current);
    const saveBubble = vi.fn().mockRejectedValueOnce(new Error('No storage')).mockImplementation(async bubble => { current = bubble; });
    const persistence = { getBubble: () => current, saveBubble };
    await expect(persistSproutDismissal(current.id, { type: 'dismiss', key: 'draft' }, persistence)).rejects.toThrow('No storage');
    expect(current).toEqual(original);
    await persistSproutDismissal(current.id, { type: 'dismiss', key: 'draft' }, persistence);
    expect(readDismissedSproutKeys(bubbleToTask(current))).toEqual(['draft']);
  });

  it('refuses to overwrite a newer review version or a missing source', async () => {
    const original = taskToBubble({ ...source(), metadata: { bubbleGarden: { review: { version: 2, future: true } } } });
    expect(() => patchSproutDismissal(original, { type: 'restore' })).toThrow('newer version');
    const saveBubble = vi.fn();
    await expect(persistSproutDismissal('missing', { type: 'restore' }, { getBubble: () => undefined, saveBubble })).rejects.toThrow('no longer available');
    expect(saveBubble).not.toHaveBeenCalled();
  });
});

describe('Saved bubble family and creation admission', () => {
  it('derives live parent and completed children and leaves missing sources non-actionable', () => {
    const parent = source();
    const draft = suggestBubbleSprouts(parent, [parent])[0];
    const child = { ...createSproutTask(draft, 'My renamed child', []), id: 'child', completed: true };
    const family = deriveBubbleFamily(parent.id, [parent, child]);
    expect(family.children).toEqual([child]);
    expect(deriveBubbleFamily(child.id, [parent, child]).parent?.title).toBe(parent.title);
    expect(deriveBubbleFamily(child.id, [child])).toMatchObject({ parentId: parent.id, parent: undefined, children: [] });
  });

  it('joins concurrent/remounted requests and returns a saved child without duplicating it', async () => {
    const parent = source('admission');
    const tasks = [parent];
    const gate = deferred();
    const draft = suggestBubbleSprouts(parent, tasks)[0];
    const addTask = vi.fn(async data => { await gate.promise; const task = { ...data, id: 'only-child' }; tasks.push(task); return task; });
    const persistence = { getTasks: () => tasks, addTask };
    const first = addSproutOnce(draft, 'Reviewed title', [], persistence);
    const joined = addSproutOnce(draft, 'Second attempt', [], persistence);
    await Promise.resolve();
    expect(addTask).toHaveBeenCalledTimes(1);
    gate.resolve();
    const results = await Promise.all([first, joined]);
    expect(results.map(result => result.created)).toEqual([true, false]);
    expect(results.map(result => result.task.title)).toEqual(['Reviewed title', 'Reviewed title']);
    expect(await addSproutOnce(draft, 'Again', [], persistence)).toMatchObject({ created: false, task: { id: 'only-child' } });
    expect(addTask).toHaveBeenCalledTimes(1);
  });

  it('releases failed admission for retry and rejects new steps from completed sources', async () => {
    const parent = source('retry-add');
    const draft = suggestBubbleSprouts(parent, [parent])[0];
    const addTask = vi.fn().mockRejectedValueOnce(new Error('Write failed')).mockImplementation(async data => ({ ...data, id: 'retry-child' }));
    const persistence = { getTasks: () => [parent], addTask };
    await expect(addSproutOnce(draft, 'Keep this wording', [], persistence)).rejects.toThrow('Write failed');
    expect(await addSproutOnce(draft, 'Keep this wording', [], persistence)).toMatchObject({ created: true, task: { title: 'Keep this wording' } });
    parent.completed = true;
    await expect(addSproutOnce(draft, 'No longer eligible', [], persistence)).rejects.toThrow('unfinished task');
    expect(addTask).toHaveBeenCalledTimes(2);
  });
});
