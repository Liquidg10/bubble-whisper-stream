import { describe, expect, it, vi } from 'vitest';
import { bubbleToTask, taskToBubble } from '@/adapters/taskAdapter';
import { createTask, type Task } from '@/types/task';
import { createUserDomainLink } from '@/domain/lifeDomains';
import { bubbleGrowthSourceFingerprint, createAiSprouts, createSproutTask, suggestBubbleSprouts } from '@/domain/bubbleGarden';
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
  it.each(['task', 'thought'] as const)('round-trips arbitrary dismissal keys while preserving %s words, type, lineage, links and visual fields', type => {
    const original = { ...taskToBubble({ ...source(), type }), x: 12.34, y: -44.2, size: 0.37321, imageUri: 'local-image', audioUri: 'local-audio' };
    const before = structuredClone(original);
    const key = `parent:note:${encodeURIComponent('A detailed note '.repeat(35))}`;
    const dismissed = patchSproutDismissal(original, { type: 'dismiss', key }, original.updatedAt);
    expect(original).toEqual(before);
    expect({ ...dismissed, metadata: original.metadata, updatedAt: original.updatedAt }).toEqual(original);
    const restored = bubbleToTask(dismissed);
    expect(readDismissedSproutKeys(restored)).toEqual([key]);
    expect(restored).toMatchObject({ type, title: before.content, description: before.caption, domainLinks: source().domainLinks?.map(link => expect.objectContaining({ domainId: link.domainId })), metadata: { custom: { preserved: true }, bubbleGarden: { sourceTaskId: 'older-parent', pack: 'living-bubbles-v1', lesson: 'connect' } } });
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
  it.each(['task', 'thought'] as const)('revalidates current %s links at local and AI admission without promoting malformed links', async type => {
    for (const origin of ['local', 'ai'] as const) {
      const parent = { ...source(`strict-links-${type}-${origin}`), type };
      const draft = origin === 'local' ? suggestBubbleSprouts(parent, [parent])[0] : createAiSprouts(parent,
        [{ title: 'One reviewed idea', reason: 'Review this draft.', estimatedMinutes: 2 }], [parent], { sourceFingerprint: bubbleGrowthSourceFingerprint(parent) })[0];
      const valid = { ...createUserDomainLink('Creativity', { effect: 'tradeoff' }), domainId: 'custom_creativity' };
      parent.domainLinks = [null, {}, valid,
        { ...createUserDomainLink('Home'), userConfirmed: 1 },
        { ...createUserDomainLink('Learning'), effect: 'future-effect' },
        createUserDomainLink('Career'), createUserDomainLink('Career', { effect: 'tradeoff' }),
      ] as unknown as Task['domainLinks'];
      const before = structuredClone(parent);
      const addTask = vi.fn(async data => ({ ...data, id: `strict-child-${type}-${origin}` }));
      const result = await addSproutOnce(draft, 'Reviewed step', ['custom_creativity', 'home-personal', 'education', 'career'], { getTasks: () => [parent], addTask });
      expect(result.task.domainLinks).toEqual([expect.objectContaining({ domainId: 'custom_creativity', userConfirmed: true, effect: 'tradeoff' })]);
      expect(parent).toEqual(before);
    }
  });

  it('admits a reviewed step without areas if the current area collection is malformed', async () => {
    const parent = source('malformed-links-admission');
    const draft = suggestBubbleSprouts(parent, [parent])[0];
    parent.domainLinks = { future: 'not an array' } as unknown as Task['domainLinks'];
    const result = await addSproutOnce(draft, 'Reviewed step', ['home-personal'], {
      getTasks: () => [parent], addTask: async data => ({ ...data, id: 'no-area-child' }),
    });
    expect(result.task.domainLinks).toEqual([]);
  });

  it('derives live parent and completed children and leaves missing sources non-actionable', () => {
    const parent = source();
    const draft = suggestBubbleSprouts(parent, [parent])[0];
    const child = { ...createSproutTask(draft, 'My renamed child', []), id: 'child', completed: true };
    const family = deriveBubbleFamily(parent.id, [parent, child]);
    expect(family.children).toEqual([child]);
    expect(deriveBubbleFamily(child.id, [parent, child]).parent?.title).toBe(parent.title);
    expect(deriveBubbleFamily(child.id, [child])).toMatchObject({ parentId: parent.id, parent: undefined, children: [] });
  });

  it.each(['task', 'thought'] as const)('joins concurrent/remounted requests from a %s and returns a saved child without duplicating it', async type => {
    const parent = { ...source(`admission-${type}`), type };
    const before = structuredClone(parent);
    const tasks = [parent];
    const gate = deferred();
    const draft = suggestBubbleSprouts(parent, tasks)[0];
    const addTask = vi.fn(async data => { await gate.promise; const task = { ...data, id: 'only-child' }; tasks.push(task); return task; });
    const persistence = { getTasks: () => tasks, addTask };
    const first = addSproutOnce(draft, 'Reviewed title', [], persistence);
    const joined = addSproutOnce(draft, 'Second attempt', [], persistence);
    await vi.waitFor(() => expect(addTask).toHaveBeenCalledTimes(1));
    expect(parent).toEqual(before);
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

  it('rechecks a thought made reference before adding a previously reviewed draft', async () => {
    const parent = { ...source('protected-thought'), type: 'thought' as const };
    const draft = suggestBubbleSprouts(parent, [parent])[0];
    parent.actionability = 'reference';
    const addTask = vi.fn();
    await expect(addSproutOnce(draft, 'A stale draft', [], { getTasks: () => [parent], addTask })).rejects.toThrow('unfinished task or thought');
    expect(addTask).not.toHaveBeenCalled();
  });
});

describe('Bounded AI growth admission', () => {
  it('validates, deduplicates and preserves provenance without changing the source', async () => {
    const { createAiSprouts, bubbleGrowthSourceFingerprint } = await import('../bubbleGarden');
    const parent = source('ai-parent');
    const fingerprint = bubbleGrowthSourceFingerprint(parent);
    const drafts = createAiSprouts(parent, [
      { title: 'Try a first step', reason: 'An idea for your review', estimatedMinutes: 3 },
      { title: 'Try a first step', reason: 'Duplicate', estimatedMinutes: 4 },
      { title: '', reason: 'Missing', estimatedMinutes: 4 },
      { title: 'Too large', reason: 'Invalid', estimatedMinutes: 800 },
    ], [parent], { sourceFingerprint: fingerprint, model: 'verified-model' });
    expect(drafts).toHaveLength(1);
    const original = structuredClone(parent);
    const addTask = vi.fn(async data => ({ ...data, id: 'ai-child' }));
    const result = await addSproutOnce(drafts[0], 'My reviewed wording', [], { getTasks: () => [parent], addTask });
    expect(result.task).toMatchObject({ title: 'My reviewed wording', domainLinks: [], metadata: { bubbleGarden: { origin: 'ai', provenance: { sourceFingerprint: fingerprint, model: 'verified-model' } } } });
    expect(parent).toEqual(original);
    expect(createAiSprouts(parent, [{ title: 'Try a first step', reason: '', estimatedMinutes: 3 }], [parent, result.task], { sourceFingerprint: fingerprint })).toEqual([]);
  });

  it('rejects stale title or notes while unrelated source metadata changes remain eligible', async () => {
    const { createAiSprouts, bubbleGrowthSourceFingerprint } = await import('../bubbleGarden');
    const parent = source('ai-stale');
    const draft = createAiSprouts(parent, [{ title: 'A reviewed idea', reason: 'Review me', estimatedMinutes: 2 }], [parent], { sourceFingerprint: bubbleGrowthSourceFingerprint(parent) })[0];
    const addTask = vi.fn(async data => ({ ...data, id: 'child' }));
    await expect(addSproutOnce(draft, draft.title, [], { getTasks: () => [{ ...parent, description: 'Changed notes' }], addTask })).rejects.toThrow('source changed');
    await expect(addSproutOnce(draft, draft.title, [], { getTasks: () => [{ ...parent, title: 'Changed title' }], addTask })).rejects.toThrow('source changed');
    expect(addTask).not.toHaveBeenCalled();
    expect((await addSproutOnce(draft, draft.title, [], { getTasks: () => [{ ...parent, metadata: { ...parent.metadata, newPreference: true } }], addTask })).created).toBe(true);
  });

  it('refuses to auto-admit AI and rechecks current note contents and domain effects', async () => {
    const { createAiSprouts, bubbleGrowthSourceFingerprint, suggestBubbleSprouts } = await import('../bubbleGarden');
    const parent = { ...source('current-notes'), description: '- Check the shelf' };
    const ai = createAiSprouts(parent, [{ title: 'An AI idea', reason: '', estimatedMinutes: 3 }], [parent], { sourceFingerprint: bubbleGrowthSourceFingerprint(parent) })[0];
    const addTask = vi.fn(async data => ({ ...data, id: 'child' }));
    await expect(addSproutOnce({ ...ai, automatic: true }, ai.title, [], { getTasks: () => [parent], addTask })).rejects.toThrow('paused');
    const note = suggestBubbleSprouts(parent, [parent])[0];
    await expect(addSproutOnce(note, note.title, [], { getTasks: () => [{ ...parent, description: '- [x] Check the shelf' }], addTask })).rejects.toThrow('note changed');
    const changed = { ...parent, domainLinks: parent.domainLinks?.map(link => ({ ...link, effect: 'tradeoff' as const })) };
    const result = await addSproutOnce(note, note.title, note.domainLinks.map(link => link.domainId), { getTasks: () => [changed], addTask });
    expect(result.task.domainLinks?.[0].effect).toBe('tradeoff');
  });
});
