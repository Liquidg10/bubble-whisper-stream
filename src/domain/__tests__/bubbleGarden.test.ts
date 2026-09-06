import { describe, expect, it } from 'vitest';
import { bubbleToTask, taskToBubble } from '@/adapters/taskAdapter';
import { createTask, type Task } from '@/types/task';
import { createUserDomainLink } from '@/domain/lifeDomains';
import {
  STARTER_LESSONS,
  createStarterTask,
  starterLessonKey,
  suggestBubbleSprouts,
  createSproutTask,
} from '../bubbleGarden';

function task(overrides: Partial<Task> = {}): Task {
  return {
    ...createTask('Prepare my project'),
    id: 'parent',
    domainLinks: [createUserDomainLink('Career'), createUserDomainLink('Home')],
    ...overrides,
  };
}

describe('guide and suggested bubble contract', () => {
  it('keeps guide instructions, confirmed shared links and lesson progress through persistence adapters', () => {
    const tasks = STARTER_LESSONS.map((lesson, index) =>
      bubbleToTask(
        taskToBubble({ ...createStarterTask(lesson), id: String(index) }),
      ),
    );
    expect(tasks.map(starterLessonKey)).toEqual(['move', 'connect', 'finish']);
    expect(
      tasks.every(
        (item) =>
          item.description &&
          item.domainLinks?.every((link) => link.userConfirmed),
      ),
    ).toBe(true);
    expect(
      tasks[1].domainLinks?.some((link) =>
        tasks[2].domainLinks?.some((other) => other.domainId === link.domainId),
      ),
    ).toBe(true);
    const completed = bubbleToTask(
      taskToBubble({ ...tasks[0], completed: true }),
    );
    expect(completed.completed).toBe(true);
    expect(starterLessonKey(completed)).toBe('move');
  });

  it('offers at most three drafts without mutating source tasks or accepting unconfirmed links', () => {
    const parent = task();
    parent.domainLinks!.push({
      ...createUserDomainLink('Friends'),
      userConfirmed: false,
    });
    const before = structuredClone(parent);
    const drafts = suggestBubbleSprouts(parent, [parent]);
    expect(drafts).toHaveLength(3);
    expect(parent).toEqual(before);
    expect(drafts.every((draft) => draft.domainLinks.length === 2)).toBe(true);
  });

  it('persists only reviewed domains, edited wording and the source relation', () => {
    const parent = task();
    const draft = suggestBubbleSprouts(parent, [])[0];
    const created = createSproutTask(draft, '  Open the project notes  ', [
      'career',
    ]);
    const restored = bubbleToTask(taskToBubble({ ...created, id: 'child' }));
    expect(restored.title).toBe('Open the project notes');
    expect(restored.domainLinks?.map((link) => link.domainId)).toEqual([
      'career',
    ]);
    expect(restored.domainLinks?.[0].id).not.toBe(parent.domainLinks?.[0].id);
    expect(restored.metadata?.bubbleGarden.sourceTaskId).toBe(parent.id);
    expect(
      suggestBubbleSprouts(parent, [restored]).map((item) => item.key),
    ).not.toContain(draft.key);
  });

  it('does not grow completed or reference bubbles and rejects blank accepted titles', () => {
    expect(suggestBubbleSprouts(task({ completed: true }), [])).toEqual([]);
    expect(
      suggestBubbleSprouts(task({ actionability: 'reference' }), []),
    ).toEqual([]);
    expect(suggestBubbleSprouts(task({ type: 'memory' }), [])).toEqual([]);
    expect(() =>
      createSproutTask(suggestBubbleSprouts(task(), [])[0], ' ', []),
    ).toThrow();
  });
});
