import { describe, expect, it } from 'vitest';
import type { Bubble } from '@/types/bubble';
import { taskToBubble, withBubbleDomainLinks } from '@/adapters/taskAdapter';
import { createUserDomainLink } from '@/domain/lifeDomains';
import { createTask, type TaskDomainLink } from '@/types/task';
import { getConfirmedDomainLinks, getSharedTaskConnections } from '../moleculeBondModel';

describe('shared task connection cards', () => {
  it('ignores malformed or non-boolean confirmation records without changing persisted metadata', () => {
    const valid = createUserDomainLink('Career');
    const domainLinks = [null, 'future tuple', [], {}, { ...valid, userConfirmed: 'true' }, { ...valid, userConfirmed: 1 },
      { ...valid, id: '' }, { ...valid, domainId: null }, { ...valid, domainId: 7 }, { ...valid, domainId: ' ' },
      { ...valid, label: {} }, { ...valid, reason: {} }, valid] as unknown as TaskDomainLink[];
    const bubble = taskToBubble({ ...createTask('One action', 'task', { domainLinks }), id: 'action' });
    const before = JSON.stringify(bubble);
    expect(getConfirmedDomainLinks(bubble)).toEqual([valid]);
    expect(getSharedTaskConnections([bubble])).toEqual([]);
    expect(JSON.stringify(bubble)).toBe(before);
    const nonarray = taskToBubble({ ...createTask('Future action', 'task', { domainLinks: {} as TaskDomainLink[] }), id: 'future' });
    expect(getConfirmedDomainLinks(nonarray)).toEqual([]);
  });

  it('retains unknown effects for explicit review and confirmed thought life areas', () => {
    const unknown = { ...createUserDomainLink('Home'), effect: 'future' as TaskDomainLink['effect'] };
    const thought = taskToBubble({ ...createTask('A connected thought', 'thought', { domainLinks: [unknown, createUserDomainLink('Career')] }), id: 'thought' });
    const links = getConfirmedDomainLinks(thought);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual(unknown);
    expect(getSharedTaskConnections([thought])).toHaveLength(1);
  });
  it('deduplicates canonical identities and confirmed domains without manufacturing meaning', () => {
    const task = withBubbleDomainLinks({ id: 'same-task', type: 'Task', content: 'One thing', x: 12, y: 15,
      createdAt: 1, updatedAt: 1, size: 0.5, tags: [] } satisfies Bubble, [
      { ...createUserDomainLink('Home'), domainId: ' home ', reason: 'My actual words.' },
      createUserDomainLink('Home'),
      { ...createUserDomainLink('Work'), suggestionReason: 'An unaccepted explanation.' },
      { ...createUserDomainLink('Meaning'), userConfirmed: false, reason: 'Not confirmed.' },
    ], 1);
    const before = JSON.stringify(task);
    const cards = getSharedTaskConnections([task, task]);
    expect(cards).toHaveLength(1);
    expect(cards[0].task).toBe(task);
    expect(cards[0].links.map(link => link.domainId)).toEqual(['home', 'work']);
    expect(cards[0].links[0].reason).toBe('My actual words.');
    expect(cards[0].links[1].reason).toBeUndefined();
    expect(JSON.stringify(task)).toBe(before);
  });
});
