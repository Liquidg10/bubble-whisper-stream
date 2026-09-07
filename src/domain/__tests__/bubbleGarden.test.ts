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
  canGrowBubble,
  createAiSprouts,
  bubbleGrowthSourceFingerprint,
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

  it.each(['task', 'thought'] as const)('uses only strictly confirmed, unambiguous areas in local and AI %s drafts', type => {
    const valid = { ...createUserDomainLink('Creativity', { effect: 'tradeoff' }), domainId: 'custom_creativity' };
    const parent = task({ type, domainLinks: [null, 'future record', {}, valid,
      { ...createUserDomainLink('Home'), userConfirmed: 1 },
      { ...createUserDomainLink('Learning'), effect: 'future-effect' },
      createUserDomainLink('Career'), createUserDomainLink('Career', { effect: 'tradeoff' }),
    ] as unknown as Task['domainLinks'] });
    const before = structuredClone(parent);
    const local = suggestBubbleSprouts(parent, [parent]);
    const ai = createAiSprouts(parent, [{ title: 'Draw one shape', reason: 'A draft to review.', estimatedMinutes: 2 }], [parent], { sourceFingerprint: bubbleGrowthSourceFingerprint(parent) });
    expect([...local, ...ai].every(draft => draft.domainLinks.length === 1 && draft.domainLinks[0].domainId === valid.domainId)).toBe(true);
    expect(ai[0].domainLinks[0]).toMatchObject({ userConfirmed: true, effect: 'tradeoff' });
    expect(parent).toEqual(before);
  });

  it.each([null, { future: 'not an array' }, 'future links'])('keeps malformed area collections out of growth without crashing', domainLinks => {
    const parent = task({ domainLinks: domainLinks as unknown as Task['domainLinks'] });
    const local = suggestBubbleSprouts(parent, [parent]);
    const ai = createAiSprouts(parent, [{ title: 'Draw one shape', reason: 'A draft to review.', estimatedMinutes: 2 }], [parent], { sourceFingerprint: bubbleGrowthSourceFingerprint(parent) });
    expect([...local, ...ai].every(draft => draft.domainLinks.length === 0)).toBe(true);
  });

  it('does not promote a malformed or truthy-confirmed draft area into a saved confirmation', () => {
    const parent = task();
    const draft = suggestBubbleSprouts(parent, [parent])[0];
    draft.domainLinks = [null, { ...createUserDomainLink('Home'), userConfirmed: 'yes' }] as unknown as Task['domainLinks'];
    expect(createSproutTask(draft, 'Reviewed title', ['home-personal']).domainLinks).toEqual([]);
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

  it('retains the exact identity of an inherited life area when growing a task', () => {
    const link = { ...createUserDomainLink('Creativity'), domainId: 'custom_creativity' };
    const thought = task({ type: 'thought', domainLinks: [link] });
    const draft = suggestBubbleSprouts(thought, [thought])[0];
    const child = bubbleToTask(taskToBubble({ ...createSproutTask(draft, 'Sketch one small idea', [link.domainId]), id: 'child' }));
    expect(child.domainLinks).toEqual([expect.objectContaining({ domainId: 'custom_creativity', label: link.label, userConfirmed: true, source: 'user' })]);
    expect(child.domainLinks?.[0].id).not.toBe(link.id);
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

  it('offers optional local prompts for a captured thought without changing its type or content', () => {
    const thought = task({ type: 'thought', title: 'Maybe a window herb garden would be nice', description: 'Just an idea, no deadline.' });
    const before = structuredClone(thought);
    const drafts = suggestBubbleSprouts(thought, [thought]);
    expect(canGrowBubble(thought)).toBe(true);
    expect(drafts).toHaveLength(3);
    expect(drafts[0].title).toContain('Write one question to explore');
    expect(drafts.every(draft => draft.origin === 'local')).toBe(true);
    const child = bubbleToTask(taskToBubble({ ...createSproutTask(drafts[0], 'Look at the window light', ['home-personal']), id: 'step' }));
    expect(child.type).toBe('task');
    expect(child.metadata?.bubbleGarden.sourceTaskId).toBe(thought.id);
    expect(thought).toEqual(before);
  });

  it('prioritizes unfinished notes and captured checklists together while keeping stable item keys', () => {
    const thought = task({ type: 'thought', title: 'Maybe try a garden\n- [x] Completed research\n- Buy one pot\n- Check the light', description: 'My next ideas:\n- Check the light\n- Choose one herb' });
    const drafts = suggestBubbleSprouts(thought, []);
    expect(drafts.map(draft => draft.title)).toEqual(['Check the light', 'Choose one herb', 'Buy one pot']);
    expect(drafts.every(draft => draft.origin === 'notes')).toBe(true);
    const reordered = suggestBubbleSprouts({ ...thought, description: '', title: '1. Buy one pot\n2. Choose one herb\n3. Check the light' }, []);
    expect(reordered.map(draft => draft.key).sort()).toEqual(drafts.map(draft => draft.key).sort());
    const saved = { ...createSproutTask(drafts[0], 'My edited light check', []), id: 'child' };
    expect(suggestBubbleSprouts(thought, [saved]).map(draft => draft.title)).toEqual(['Choose one herb', 'Buy one pot']);
  });

  it('keeps protected captures out of suggestions, including reference thoughts and empty text', () => {
    const excluded: Partial<Task>[] = [
      ...(['memory', 'mood', 'photo', 'event', 'reminder'] as const).map(type => ({ type })),
      { type: 'thought', actionability: 'reference' },
      { type: 'thought', completed: true },
      { type: 'thought', title: '  ', description: '\n' },
    ];
    for (const overrides of excluded) {
      const source = task(overrides);
      expect(canGrowBubble(source)).toBe(false);
      expect(suggestBubbleSprouts(source, [])).toEqual([]);
    }
    expect(suggestBubbleSprouts(task({ type: 'thought', title: '', description: '- Find one pot' }), [])[0].title).toBe('Find one pot');
  });

  it('honors a completed note over an older unchecked copy in the captured thought', () => {
    const thought = task({ type: 'thought', title: '- [ ] Check the light\n- Choose one herb', description: '- [x] CHECK THE LIGHT' });
    expect(suggestBubbleSprouts(thought, []).map(draft => draft.title)).toEqual(['Choose one herb']);
  });
});
