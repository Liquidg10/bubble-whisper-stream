import { describe, expect, it } from 'vitest';
import { collectLifeDomainChoices, matchingLifeDomainChoices, reuseLifeDomainChoice } from '../lifeDomainLibrary';
import { proposeLifeDomainLinks } from '../lifeDomains';
import type { TaskDomainLink } from '@/types/task';

function link(overrides: Partial<TaskDomainLink> = {}): TaskDomainLink {
  return { id: 'link-1', domainId: 'education', label: 'Learning', userConfirmed: true, source: 'user', ...overrides };
}

describe('reusable life areas', () => {
  it('reuses one identity for renamed areas and counts unique tasks without mutation', () => {
    const tasks = [
      { id: 'one', title: 'Read a chapter', domainLinks: [link(), link({ id: 'duplicate' })] },
      { id: 'two', title: 'Practice', domainLinks: [link({ label: 'My learning', updatedAt: 2 })] },
    ];
    const before = JSON.stringify(tasks);
    const choices = collectLifeDomainChoices(tasks);
    const learning = choices.find(choice => choice.id === 'education')!;
    expect(learning).toMatchObject({ label: 'My learning', taskCount: 2 });
    for (const alias of ['Education', 'Learning', 'My learning']) {
      expect(matchingLifeDomainChoices(alias, choices)).toEqual([learning]);
    }
    expect(JSON.stringify(tasks)).toBe(before);
  });

  it('does not turn a pending custom suggestion into a reusable area', () => {
    const choices = collectLifeDomainChoices([{ id: 'one', title: 'Maybe', domainLinks: [link({ domainId: 'adventures', label: 'Adventures', userConfirmed: false })] }]);
    expect(choices.find(choice => choice.id === 'adventures')).toBeUndefined();
  });

  it('keeps existing punctuation in imported identities when reusing or proposing', () => {
    const choices = collectLifeDomainChoices([{ id: 'one', title: 'Paint', domainLinks: [link({ domainId: 'custom_creativity', label: 'Creative practice' })] }]);
    const choice = choices.find(candidate => candidate.id === 'custom_creativity')!;
    expect(reuseLifeDomainChoice(choice)).toMatchObject({ domainId: 'custom_creativity', label: 'Creative practice', userConfirmed: true, source: 'user' });
    expect(proposeLifeDomainLinks({ title: 'Creative practice', tags: [] }, [], { knownDomains: choices })[0].domainId).toBe('custom_creativity');
  });

  it('keeps two existing identities separate when their display names match', () => {
    const choices = collectLifeDomainChoices([{ id: 'one', title: 'Make space', domainLinks: [
      link({ domainId: 'creative-a', label: 'Creativity' }),
      link({ domainId: 'creative-b', label: 'Creativity' }),
    ] }]);
    expect(matchingLifeDomainChoices('Creativity', choices).map(choice => choice.id)).toEqual(['creative-a', 'creative-b']);
  });
});
