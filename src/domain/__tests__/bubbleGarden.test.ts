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

  it('offers unfinished steps from the notes in their own words and skips checked or duplicate items', () => {
    const parent = task({
      description:
        'My outline:\n- [x] Already done\n- [ ] Open the brief\n2. Write a heading\n* OPEN THE BRIEF\n• Ask one question\n- Review the answer',
    });
    const before = structuredClone(parent);
    const drafts = suggestBubbleSprouts(parent, []);
    expect(drafts.map((draft) => draft.title)).toEqual([
      'Open the brief',
      'Write a heading',
      'Ask one question',
    ]);
    expect(drafts.every((draft) => draft.reason.includes('your notes'))).toBe(
      true,
    );
    expect(parent).toEqual(before);
    const first = {
      ...createSproutTask(drafts[0], 'Read the brief', []),
      id: 'child',
    };
    expect(
      suggestBubbleSprouts(parent, [first]).map((draft) => draft.title),
    ).toEqual(['Write a heading', 'Ask one question', 'Review the answer']);
  });

  it('keeps note identities stable when list items are reordered or numbered differently', () => {
    const before = suggestBubbleSprouts(
      task({ description: '- Read the résumé\n- Write a note' }),
      [],
    );
    const after = suggestBubbleSprouts(
      task({ description: '1. Write a note\n2. Read the résumé' }),
      [],
    );
    expect(after[1].key).toBe(before[0].key);
    expect(after[0].key).toBe(before[1].key);
  });

  it('uses bounded concrete patterns without turning a substring into a task category', () => {
    const project = suggestBubbleSprouts(
      task({ title: 'Finish the project report' }),
      [],
    );
    expect(project[0].title).toContain(
      'Write one sentence describing the finished result',
    );
    expect(project[1].title).toContain('Open the notes or file');
    expect(
      suggestBubbleSprouts(task({ title: 'Study on the train' }), [])[0].title,
    ).toContain('Choose one question');
    expect(
      suggestBubbleSprouts(
        task({ title: 'Think about messaging patterns' }),
        [],
      )[0].title,
    ).toContain('Choose the first small step');
  });

  it('does not turn ordinary prose, completed lists or oversized notes into quoted steps', () => {
    const drafts = suggestBubbleSprouts(
      task({
        title: 'A new idea',
        description: `A sentence to consider.\n- [X] Already done\n- ${'long '.repeat(80)}`,
      }),
      [],
    );
    expect(drafts).toHaveLength(3);
    expect(drafts[0].key).toBe('parent:first-step');
  });
});
