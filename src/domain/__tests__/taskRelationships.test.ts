import { describe, expect, it } from 'vitest';
import { createTask, type Task, type TaskDomainLink, type TaskRelationship } from '@/types/task';
import { createUserDomainLink } from '@/domain/lifeDomains';
import {
  createConfirmedTaskRelationship,
  getCompletedLifeContributions,
  getConfirmedTaskDomainEffects,
  getConfirmedTaskRelationships,
  getTaskDependencyStatus,
  getTaskRelationshipConnections,
  isRelationshipTask,
  validateTaskRelationship,
} from '../taskRelationships';

function task(id: string, updates: Partial<Task> = {}): Task {
  return { ...createTask(id), id, ...updates };
}

function link(targetTaskId: string, kind: TaskRelationship['kind'] = 'supports', updates: Partial<TaskRelationship> = {}): TaskRelationship {
  return { id: `link-${kind}-${targetTaskId}`, targetTaskId, kind, userConfirmed: true, source: 'user', ...updates };
}

describe('confirmed task relationships', () => {
  it('stores a directional edge once and derives incoming connections without changing tasks', () => {
    const tasks = [task('prepare', { relationships: [link('present')] }), task('present')];
    const before = JSON.stringify(tasks);
    const outgoing = getTaskRelationshipConnections('prepare', tasks);
    const incoming = getTaskRelationshipConnections('present', tasks);
    expect(outgoing.outgoing).toHaveLength(1);
    expect(outgoing.incoming).toEqual([]);
    expect(incoming.incoming[0]).toMatchObject({ source: { id: 'prepare' }, target: { id: 'present' } });
    expect(incoming.outgoing).toEqual([]);
    expect(JSON.stringify(tasks)).toBe(before);
  });

  it('creates only an explicit confirmation with separate user meaning and suggestion grounding', () => {
    const tasks = [task('a'), task('b')];
    const created = createConfirmedTaskRelationship(tasks[0], 'b', 'depends-on', tasks, {
      id: 'stable', now: 21, source: 'rule', reason: ' My words ', suggestionReason: ' A reviewed possibility ',
    });
    expect(created).toEqual({ id: 'stable', targetTaskId: 'b', kind: 'depends-on', userConfirmed: true, source: 'rule',
      reason: 'My words', suggestionReason: 'A reviewed possibility', createdAt: 21, updatedAt: 21 });
    expect(tasks[0].relationships).toBeUndefined();
    expect(() => createConfirmedTaskRelationship(tasks[0], 'b', 'supports', tasks, {
      source: 'future-source' as TaskRelationship['source'],
    })).toThrow('details that need review');
  });

  it('deduplicates tradeoffs across reversed storage while preserving directional support', () => {
    const tasks = [task('a', { relationships: [link('b', 'tradeoff'), link('b')] }),
      task('b', { relationships: [link('a', 'tradeoff'), link('a')] })];
    expect(getConfirmedTaskRelationships(tasks).map(edge => edge.relationship.kind)).toEqual(['tradeoff', 'supports', 'supports']);
    expect(validateTaskRelationship(tasks[1], 'a', 'tradeoff', tasks)).toMatchObject({ valid: false, code: 'duplicate' });
    expect(getTaskRelationshipConnections('b', tasks).incoming.filter(edge => edge.relationship.kind === 'tradeoff')).toHaveLength(1);
  });

  it('deduplicates canonical task records, repeated targets, and same-kind outgoing edges', () => {
    const a = task('a', { relationships: [link('b'), link('b', 'supports', { id: 'another' })] });
    const tasks = [a, a, task('b')];
    expect(getConfirmedTaskRelationships(tasks)).toHaveLength(1);
    expect(validateTaskRelationship(a, 'b', 'supports', tasks)).toMatchObject({ valid: false, code: 'duplicate' });
  });

  it.each([
    ['self', 'a', 'supports'], ['target', 'missing', 'supports'], ['target', 'reference', 'supports'],
    ['target', 'thought', 'depends-on'], ['kind', 'b', 'future'],
  ])('rejects %s before confirmation', (code, target, kind) => {
    const tasks = [task('a'), task('b'), task('reference', { actionability: 'reference' }), task('thought', { type: 'thought' })];
    expect(validateTaskRelationship(tasks[0], target, kind as TaskRelationship['kind'], tasks)).toMatchObject({ valid: false, code });
    expect(() => createConfirmedTaskRelationship(tasks[0], target, kind as TaskRelationship['kind'], tasks)).toThrow();
  });

  it('rejects absent and reference sources, without confusing outliner step IDs for tasks', () => {
    const a = task('a', { metadata: { outliner: { dependsOn: 'b', steps: [{ id: 'step', title: 'Local step', completed: false, dependencies: ['b'] }] } } });
    expect(validateTaskRelationship(a, 'b', 'supports', [task('b')])).toMatchObject({ valid: false, code: 'source' });
    expect(validateTaskRelationship({ ...a, actionability: 'reference' }, 'b', 'supports', [a, task('b')])).toMatchObject({ valid: false, code: 'source' });
    expect(getTaskDependencyStatus('a', [a, task('b')]).status).toBe('none');
  });

  it('rejects a multi-hop dependency cycle but permits a support loop', () => {
    const tasks = [task('a', { relationships: [link('b', 'depends-on')] }),
      task('b', { relationships: [link('c', 'depends-on')] }), task('c')];
    expect(validateTaskRelationship(tasks[2], 'a', 'depends-on', tasks)).toMatchObject({ valid: false, code: 'cycle' });
    expect(validateTaskRelationship(tasks[2], 'a', 'supports', tasks)).toEqual({ valid: true });
  });

  it('can validate editing an existing edge while still checking other stored edges', () => {
    const a = task('a', { relationships: [link('b')] });
    expect(validateTaskRelationship(a, 'b', 'supports', [a, task('b')], { ignoreRelationshipId: 'link-supports-b' })).toEqual({ valid: true });
  });

  it('does not resolve malformed, pending, missing, self, or reference relationships', () => {
    const relationships = [null, 'text', {}, link('b', 'supports', { userConfirmed: false }),
      link('b', 'supports', { userConfirmed: 1 as unknown as boolean }), link('missing'), link('a'), link('reference'),
      link('b', 'future' as TaskRelationship['kind']), link('b', 'supports', { reason: 5 as unknown as string }),
      link('b', 'supports', { id: '' }), link('b', 'supports', { source: 'future' as TaskRelationship['source'] })] as TaskRelationship[];
    const tasks = [task('a', { relationships }), task('b'), task('reference', { actionability: 'reference', relationships: [link('b')] })];
    const before = JSON.stringify(tasks);
    expect(getConfirmedTaskRelationships(tasks)).toEqual([]);
    expect(JSON.stringify(tasks)).toBe(before);
    expect(getConfirmedTaskRelationships([task('a', { relationships: {} as TaskRelationship[] })])).toEqual([]);
  });

  it('supports actionable task, event, and reminder types, while reference and context stay separate', () => {
    for (const type of ['task', 'event', 'reminder'] as const) expect(isRelationshipTask(task('x', { type }))).toBe(true);
    for (const type of ['thought', 'memory', 'mood', 'photo'] as const) expect(isRelationshipTask(task('x', { type }))).toBe(false);
    expect(isRelationshipTask(task('x', { actionability: 'reference' }))).toBe(false);
  });
});

describe('current prerequisite completion', () => {
  it('follows saved completion and reopening without completing another task', () => {
    const a = task('a', { relationships: [link('b', 'depends-on')] });
    const b = task('b');
    expect(getTaskDependencyStatus('a', [a, b])).toMatchObject({ status: 'waiting', total: 1, completed: 0, remaining: 1 });
    expect(getTaskDependencyStatus('a', [a, { ...b, completed: true }])).toMatchObject({ status: 'ready', completed: 1, remaining: 0 });
    expect(getTaskDependencyStatus('a', [a, b]).status).toBe('waiting');
    expect(a.completed).toBe(false);
  });

  it('deduplicates prerequisites and ignores pending suggestions', () => {
    const a = task('a', { relationships: [link('b', 'depends-on'), link('b', 'depends-on', { id: 'copy' }),
      link('missing', 'depends-on', { userConfirmed: false })] });
    expect(getTaskDependencyStatus('a', [a, task('b')])).toMatchObject({ status: 'waiting', total: 1 });
  });

  it('keeps deleted and ineligible prerequisites unresolved, even when their last record was completed', () => {
    const a = task('a', { relationships: [link('b', 'depends-on')] });
    expect(getTaskDependencyStatus('a', [a])).toMatchObject({ status: 'unresolved', completed: 0,
      prerequisites: [{ state: 'unavailable' }] });
    expect(getTaskDependencyStatus('a', [a, task('b', { completed: true, actionability: 'reference' })])).toMatchObject({
      status: 'unresolved', prerequisites: [{ state: 'invalid' }],
    });
  });

  it('marks imported cycles and self-prerequisites unresolved without claiming that completion resolved them', () => {
    const tasks = [task('a', { completed: true, relationships: [link('b', 'depends-on')] }),
      task('b', { completed: true, relationships: [link('a', 'depends-on')] })];
    expect(getConfirmedTaskRelationships(tasks)).toEqual([]);
    expect(getTaskDependencyStatus('a', tasks)).toMatchObject({ status: 'unresolved', completed: 0, prerequisites: [{ state: 'invalid' }] });
    const self = task('self', { relationships: [link('self', 'depends-on')] });
    expect(getTaskDependencyStatus('self', [self]).status).toBe('unresolved');
  });

  it('returns none for absent tasks and does not treat malformed completion as true', () => {
    expect(getTaskDependencyStatus('gone', [])).toEqual({ status: 'none', total: 0, completed: 0, remaining: 0, prerequisites: [] });
    const a = task('a', { relationships: [link('b', 'depends-on')] });
    expect(getTaskDependencyStatus('a', [a, task('b', { completed: 'false' as unknown as boolean })]).status).toBe('waiting');
  });
});

describe('completed life contributions', () => {
  it('keeps support and tradeoff distinct, with one count per canonical action and stable domain ID', () => {
    const a = task('a', { completed: true, domainLinks: [createUserDomainLink('Career'),
      { ...createUserDomainLink('Home', { effect: 'tradeoff' }), domainId: 'custom_home' }, createUserDomainLink('Career')] });
    const before = JSON.stringify(a);
    const result = getCompletedLifeContributions([a, a]);
    expect(result.map(item => ({ id: item.domainId, support: item.supports.map(t => t.id), tradeoff: item.tradeoffs.map(t => t.id) })))
      .toEqual([{ id: 'career', support: ['a'], tradeoff: [] }, { id: 'custom_home', support: [], tradeoff: ['a'] }]);
    expect(JSON.stringify(a)).toBe(before);
    expect(getCompletedLifeContributions([{ ...a, completed: false }])).toEqual([]);
  });

  it('excludes pending, malformed, unknown, ambiguous, reference, and non-actionable contributions', () => {
    const good = createUserDomainLink('Career');
    const malformed = [null, {}, { ...good, label: 4 }, { ...good, effect: 'future' },
      { ...good, domainId: 'pending', userConfirmed: false }] as TaskDomainLink[];
    expect(getConfirmedTaskDomainEffects(task('a', { domainLinks: malformed }))).toEqual([]);
    expect(getConfirmedTaskDomainEffects(task('a', { domainLinks: [good, { ...good, effect: 'tradeoff' }] }))).toEqual([]);
    expect(getConfirmedTaskDomainEffects(task('a', { domainLinks: [good, { ...good, effect: 'future' as TaskDomainLink['effect'] }] }))).toEqual([]);
    expect(getCompletedLifeContributions([task('a', { completed: true, actionability: 'reference', domainLinks: [good] }),
      task('b', { completed: true, type: 'thought', domainLinks: [good] })])).toEqual([]);
  });

  it('retains confirmed thought life effects without projecting them as completed actions', () => {
    const thought = task('idea', { type: 'thought', domainLinks: [createUserDomainLink('Learning')] });
    expect(getConfirmedTaskDomainEffects(thought)).toHaveLength(1);
    expect(getCompletedLifeContributions([thought])).toEqual([]);
  });
});
