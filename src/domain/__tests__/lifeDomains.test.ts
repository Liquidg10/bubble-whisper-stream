import { describe, expect, it, vi } from 'vitest';
import {
  createConfirmedDomainLink,
  createUserDomainLink,
  normalizeDomainId,
  pendingLinkToProposal,
  proposeLifeDomainLinks,
} from '@/domain/lifeDomains';
import type { Task, TaskDomainLink } from '@/types/task';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'task',
    title: 'Plan a walk after the family appointment',
    completed: false,
    priority: 50,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('life domain proposals', () => {
  it('offers multiple grounded possibilities without mutating the task', () => {
    const input = task();
    const before = JSON.stringify(input);

    const proposals = proposeLifeDomainLinks(input);

    expect(proposals.map(proposal => proposal.label)).toEqual([
      'Physical health',
      'Family',
    ]);
    expect(proposals[0].explanation).toContain('walk');
    expect(JSON.stringify(input)).toBe(before);
    expect(input.domainLinks).toBeUndefined();
  });

  it('returns no hypothesis when evidence is insufficient', () => {
    expect(proposeLifeDomainLinks(task({ title: 'Sort the blue folder' }))).toEqual([]);
  });

  it('does not infer meaning for reference material', () => {
    expect(proposeLifeDomainLinks(task({
      title: 'Doctor office information',
      actionability: 'reference',
    }))).toEqual([]);
  });

  it('does not repeat an existing confirmed or pending connection', () => {
    const existing: TaskDomainLink[] = [{
      id: 'health-link',
      domainId: 'physical-health',
      label: 'Physical health',
      userConfirmed: true,
      source: 'user',
    }];

    expect(proposeLifeDomainLinks(task(), existing).map(proposal => proposal.label))
      .toEqual(['Family']);
  });

  it('creates explicit confirmed links while preserving proposal provenance', () => {
    expect(createConfirmedDomainLink({
      domainId: 'physical-health',
      label: 'Physical health',
      source: 'rule',
    }, {
      id: 'link-1',
      now: 100,
      strength: 'primary',
    })).toEqual({
      id: 'link-1',
      domainId: 'physical-health',
      label: 'Physical health',
      userConfirmed: true,
      source: 'rule',
      strength: 'primary',
      createdAt: 100,
      updatedAt: 100,
    });

    expect(createUserDomainLink('Creative practice', {
      id: 'link-2',
      now: 200,
    })).toMatchObject({
      id: 'link-2',
      domainId: 'creative-practice',
      label: 'Creative practice',
      userConfirmed: true,
      source: 'user',
    });
  });

  it('keeps a pending assistant link visibly pending until the UI confirms it', () => {
    const pending: TaskDomainLink = {
      id: 'pending-1',
      domainId: 'family',
      label: 'Family',
      userConfirmed: false,
      source: 'assistant',
      suggestionReason: 'It mentions making time for family.',
    };

    expect(pendingLinkToProposal(pending)).toMatchObject({
      id: 'pending:pending-1',
      pendingLinkId: 'pending-1',
      source: 'assistant',
      explanation: 'It mentions making time for family.',
    });
    expect(pending.userConfirmed).toBe(false);
  });

  it('creates distinct stable IDs for Unicode and symbol-only labels', () => {
    expect(createUserDomainLink('家族', { id: 'link-a', now: 1 }).domainId).toBe('家族');
    expect(createUserDomainLink('健康', { id: 'link-b', now: 1 }).domainId).toBe('健康');
    expect(createUserDomainLink('🎨', { id: 'link-c', now: 1 }).domainId).toBe('custom-1f3a8');
    expect(createUserDomainLink('🌊', { id: 'link-d', now: 1 }).domainId).toBe('custom-1f30a');
  });

  it('normalizes persisted domain IDs independently of the device locale', () => {
    const localeLowerCase = vi
      .spyOn(String.prototype, 'toLocaleLowerCase')
      .mockReturnValue('fıtness');

    expect(normalizeDomainId('Fitness')).toBe('fitness');
    expect(localeLowerCase).not.toHaveBeenCalled();

    localeLowerCase.mockRestore();
  });
});
