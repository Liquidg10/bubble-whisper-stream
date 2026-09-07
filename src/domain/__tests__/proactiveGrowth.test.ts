import { describe, it, expect, vi } from 'vitest';
import { createTask, type Task } from '@/types/task';
import { taskToBubble, bubbleToTask } from '@/adapters/taskAdapter';
import { automaticGrowthCandidate, collectProactiveSuggestions, getProactiveGrowthState, patchProactiveGrowthMode, persistProactiveGrowthMode, runAutomaticGrowth } from '../proactiveGrowth';
import { addSproutOnce, patchSproutDismissal } from '../bubbleGardenState';

function source(id = 'source'): Task {
  return { ...createTask('A home project', 'task', { description: '- Check one shelf\n- Move one book\n- Put away one box', metadata: { unrelated: true } }), id };
}
function enabled(id = 'source'): Task { return bubbleToTask(patchProactiveGrowthMode(taskToBubble(source(id)), true)); }
function fixture(first = enabled()) {
  let tasks = [first];
  const addTask = vi.fn(async (task: Omit<Task, 'id'>) => { const saved = { ...task, id: `child-${tasks.length}` }; tasks = [...tasks, saved]; return saved; });
  return { getTasks: () => tasks, addTask, replace: (next: Task[]) => { tasks = next; } };
}

describe('Quiet source suggestions and automatic notes steps', () => {
  it('returns at most three distinct sources, preferring notes without creating anything', () => {
    const tasks = [source('four'), source('three'), { ...source('local'), description: '' }, source('two'), source('one')];
    const before = structuredClone(tasks);
    expect(collectProactiveSuggestions(tasks).map(item => item.sourceTaskId)).toEqual(['four', 'one', 'three']);
    expect(tasks).toEqual(before);
  });

  it('requires strict opt-in and preserves source content, visual fields and unrelated metadata', () => {
    const original = { ...taskToBubble(source()), x: 32, y: 61, imageUri: 'saved-image' };
    expect(getProactiveGrowthState(source()).enabled).toBe(false);
    expect(automaticGrowthCandidate(source(), [source()])).toBeUndefined();
    const next = patchProactiveGrowthMode(original, true);
    expect({ ...next, metadata: original.metadata, updatedAt: original.updatedAt }).toEqual(original);
    expect(bubbleToTask(next).metadata?.unrelated).toBe(true);
    expect(getProactiveGrowthState(bubbleToTask(next)).enabled).toBe(true);
    expect(getProactiveGrowthState(bubbleToTask(patchProactiveGrowthMode(next, false))).enabled).toBe(false);
  });

  it('serializes enable/disable with strict errors, leaving a failed preference unsaved', async () => {
    let bubble = taskToBubble(source('mode'));
    const saveBubble = vi.fn().mockRejectedValueOnce(new Error('Full')).mockImplementation(async value => { bubble = value; });
    const persistence = { getBubble: () => bubble, saveBubble };
    await expect(persistProactiveGrowthMode('mode', true, persistence)).rejects.toThrow('Full');
    expect(getProactiveGrowthState(bubbleToTask(bubble)).enabled).toBe(false);
    await Promise.all([persistProactiveGrowthMode('mode', true, persistence), persistProactiveGrowthMode('mode', false, persistence)]);
    expect(getProactiveGrowthState(bubbleToTask(bubble)).enabled).toBe(false);
  });

  it('does not enroll generated children, completed tasks or references and preserves future versions', () => {
    for (const task of [{ ...source(), completed: true }, { ...source(), actionability: 'reference' as const }, { ...source(), metadata: { bubbleGarden: { sourceTaskId: 'parent' } } }]) {
      expect(() => patchProactiveGrowthMode(taskToBubble(task), true)).toThrow();
    }
    const future = { ...source(), metadata: { bubbleGarden: { proactive: { version: 2, enabled: true } } } };
    expect(getProactiveGrowthState(future).enabled).toBe(false);
    expect(() => patchProactiveGrowthMode(taskToBubble(future), false)).toThrow('newer version');
  });

  it('uses unchecked notes only, creates one open child, then advances after completion', async () => {
    const f = fixture();
    await runAutomaticGrowth('source', f);
    expect(f.getTasks()).toHaveLength(2);
    expect(f.getTasks()[1]).toMatchObject({ title: 'Check one shelf', metadata: { bubbleGarden: { automatic: true, origin: 'notes' } } });
    await runAutomaticGrowth('source', f);
    expect(f.addTask).toHaveBeenCalledTimes(1);
    f.replace(f.getTasks().map(task => task.id === 'child-1' ? { ...task, completed: true } : task));
    await runAutomaticGrowth('source', f);
    expect(f.getTasks()[2].title).toBe('Move one book');
    expect(getProactiveGrowthState(f.getTasks()[2]).enabled).toBe(false);
  });

  it('does not auto-create local prompts, completed notes or dismissed notes', async () => {
    const noNotes = { ...enabled('no-notes'), description: 'An idea without a list.' };
    expect(automaticGrowthCandidate(noNotes, [noNotes])).toBeUndefined();
    const doneNotes = { ...enabled('done-notes'), description: '- [x] Check one shelf' };
    expect(automaticGrowthCandidate(doneNotes, [doneNotes])).toBeUndefined();
    const task = enabled('dismiss');
    const draft = automaticGrowthCandidate(task, [task])!;
    const dismissed = bubbleToTask(patchSproutDismissal(taskToBubble(task), { type: 'dismiss', key: draft.key }));
    expect(automaticGrowthCandidate(dismissed, [dismissed])?.title).toBe('Move one book');
  });

  it('joins concurrent source passes and a hydrated child prevents duplication', async () => {
    const f = fixture(enabled('joined'));
    const result = await Promise.all([runAutomaticGrowth('joined', f), runAutomaticGrowth('joined', f), runAutomaticGrowth('joined', f)]);
    expect(f.addTask).toHaveBeenCalledTimes(1);
    expect(result.map(item => item?.created)).toEqual([true, false, false]);
    f.replace(f.getTasks().map(task => bubbleToTask(taskToBubble(task))));
    await runAutomaticGrowth('joined', f);
    expect(f.addTask).toHaveBeenCalledTimes(1);
  });

  it('rechecks automatic enablement and source eligibility after admission was queued', async () => {
    const f = fixture(enabled('stale'));
    const draft = automaticGrowthCandidate(f.getTasks()[0], f.getTasks())!;
    f.replace([{ ...f.getTasks()[0], metadata: { bubbleGarden: { proactive: { version: 1, enabled: false } } } }]);
    await expect(addSproutOnce(draft, draft.title, [], f)).rejects.toThrow('paused');
    f.replace([]);
    expect(await runAutomaticGrowth('stale', f)).toBeUndefined();
    expect(f.addTask).not.toHaveBeenCalled();
  });

  it('treats a manually created open child as already waiting', async () => {
    const f = fixture(enabled('manual'));
    f.replace([...f.getTasks(), { ...createTask('My own next step', 'task', { metadata: { bubbleGarden: { sourceTaskId: 'manual' } } }), id: 'manual-child' }]);
    expect(await runAutomaticGrowth('manual', f)).toBeUndefined();
    expect(f.addTask).not.toHaveBeenCalled();
  });

  it('pauses for incomplete or unavailable prerequisites and resumes after completion', async () => {
    const prerequisite = { ...createTask('Find the shelf', 'task'), id: 'prerequisite' };
    const task: Task = { ...enabled('dependent'), relationships: [{ id: 'dependency', targetTaskId: prerequisite.id, kind: 'depends-on', userConfirmed: true, source: 'user' }] };
    expect(automaticGrowthCandidate(task, [task, prerequisite])).toBeUndefined();
    expect(collectProactiveSuggestions([task])).toEqual([]);
    expect(automaticGrowthCandidate(task, [task, { ...prerequisite, completed: true }])?.title).toBe('Check one shelf');
  });

  it('retains failed automatic admission for an explicit retry', async () => {
    const f = fixture(enabled('retry'));
    f.addTask.mockRejectedValueOnce(new Error('Storage full'));
    await expect(runAutomaticGrowth('retry', f)).rejects.toThrow('Storage full');
    expect(f.getTasks()).toHaveLength(1);
    expect((await runAutomaticGrowth('retry', f))?.created).toBe(true);
    expect(f.getTasks()).toHaveLength(2);
  });
});
