import { describe, expect, it } from 'vitest';
import type { Bubble } from '@/types/bubble';
import { withBubbleDomainLinks } from '@/adapters/taskAdapter';
import { createUserDomainLink } from '@/domain/lifeDomains';
import { getSharedTaskConnections } from '../moleculeBondModel';

describe('shared task connection cards', () => {
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
