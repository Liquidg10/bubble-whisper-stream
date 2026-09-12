import type {
  Task,
  TaskDomainEffect,
  TaskDomainLink,
  TaskRelationship,
  TaskRelationshipKind,
} from '@/types/task';

const RELATIONSHIP_KINDS: ReadonlySet<string> = new Set(['supports', 'depends-on', 'tradeoff']);
const LINK_SOURCES: ReadonlySet<string> = new Set(['user', 'rule', 'assistant', 'import']);
const ACTIONABLE_TYPES: ReadonlySet<string> = new Set(['task', 'reminder', 'event']);

/** Relationships describe actions. Notes retain their own life connections. */
export function isRelationshipTask(task: Pick<Task, 'type' | 'actionability'>): boolean {
  return ACTIONABLE_TYPES.has(task.type) && task.actionability !== 'reference';
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalTimestamp(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

/** Imported unknown fields remain persisted; only understood records make claims. */
function isConfirmedRelationship(value: unknown): value is TaskRelationship {
  return record(value) && nonempty(value.id) && nonempty(value.targetTaskId)
    && typeof value.kind === 'string' && RELATIONSHIP_KINDS.has(value.kind)
    && value.userConfirmed === true && typeof value.source === 'string'
    && LINK_SOURCES.has(value.source) && optionalString(value.reason)
    && optionalString(value.suggestionReason) && optionalTimestamp(value.createdAt)
    && optionalTimestamp(value.updatedAt);
}

function confirmedRelationships(task: Task): TaskRelationship[] {
  return Array.isArray(task.relationships) ? task.relationships.filter(isConfirmedRelationship) : [];
}

function tasksById(tasks: readonly Task[]): Map<string, Task> {
  const result = new Map<string, Task>();
  for (const task of tasks) if (!result.has(task.id)) result.set(task.id, task);
  return result;
}

export interface ResolvedTaskRelationship {
  source: Task;
  target: Task;
  relationship: TaskRelationship;
}

function relationshipKey(sourceId: string, link: TaskRelationship): string {
  const endpoints = link.kind === 'tradeoff'
    ? [sourceId, link.targetTaskId].sort() : [sourceId, link.targetTaskId];
  return JSON.stringify([link.kind, ...endpoints]);
}

function resolvedCandidates(tasks: readonly Task[]): ResolvedTaskRelationship[] {
  const byId = tasksById(tasks);
  const seen = new Set<string>();
  const result: ResolvedTaskRelationship[] = [];
  for (const source of byId.values()) {
    if (!isRelationshipTask(source)) continue;
    for (const relationship of confirmedRelationships(source)) {
      const target = byId.get(relationship.targetTaskId);
      if (!target || !isRelationshipTask(target) || target.id === source.id) continue;
      const key = relationshipKey(source.id, relationship);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ source, target, relationship });
    }
  }
  return result;
}

function dependencyPathExists(fromId: string, toId: string, edges: readonly ResolvedTaskRelationship[]): boolean {
  const pending = [fromId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === toId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges) {
      if (edge.relationship.kind === 'depends-on' && edge.source.id === current) pending.push(edge.target.id);
    }
  }
  return false;
}

/** A dependency cycle is reviewable data, never a resolved prerequisite claim. */
export function getConfirmedTaskRelationships(tasks: readonly Task[]): ResolvedTaskRelationship[] {
  const edges = resolvedCandidates(tasks);
  return edges.filter(edge => edge.relationship.kind !== 'depends-on'
    || !dependencyPathExists(edge.target.id, edge.source.id, edges));
}

export type TaskRelationshipValidation = { valid: true } | {
  valid: false;
  code: 'source' | 'target' | 'kind' | 'self' | 'duplicate' | 'cycle';
  message: string;
};

export function validateTaskRelationship(
  source: Task,
  targetTaskId: string,
  kind: TaskRelationshipKind,
  tasks: readonly Task[],
  options: { ignoreRelationshipId?: string } = {},
): TaskRelationshipValidation {
  if (!isRelationshipTask(source) || !tasks.some(task => task.id === source.id)) {
    return { valid: false, code: 'source', message: 'Choose an action that is still available.' };
  }
  if (!RELATIONSHIP_KINDS.has(kind)) return { valid: false, code: 'kind', message: 'Choose a supported relationship.' };
  if (source.id === targetTaskId) return { valid: false, code: 'self', message: 'Choose a different action to connect.' };
  const target = tasksById(tasks).get(targetTaskId);
  if (!target || !isRelationshipTask(target)) {
    return { valid: false, code: 'target', message: 'Choose an available action to connect.' };
  }
  const currentTasks = tasks.map(task => task.id === source.id ? {
    ...source,
    relationships: confirmedRelationships(source).filter(link => link.id !== options.ignoreRelationshipId),
  } : task);
  const edges = resolvedCandidates(currentTasks);
  const proposedKey = relationshipKey(source.id, { kind, targetTaskId } as TaskRelationship);
  if (edges.some(edge => relationshipKey(edge.source.id, edge.relationship) === proposedKey)) {
    return { valid: false, code: 'duplicate', message: 'These actions already have this relationship.' };
  }
  if (kind === 'depends-on' && dependencyPathExists(targetTaskId, source.id, edges)) {
    return { valid: false, code: 'cycle', message: 'That would create a loop of prerequisites. Choose a different action.' };
  }
  return { valid: true };
}

export function createConfirmedTaskRelationship(
  source: Task,
  targetTaskId: string,
  kind: TaskRelationshipKind,
  tasks: readonly Task[],
  options: {
    id?: string;
    now?: number;
    source?: TaskRelationship['source'];
    reason?: string;
    suggestionReason?: string;
  } = {},
): TaskRelationship {
  const validation = validateTaskRelationship(source, targetTaskId, kind, tasks);
  if (validation.valid === false) throw new Error(validation.message);
  if ((options.id !== undefined && !nonempty(options.id)) || !LINK_SOURCES.has(options.source ?? 'user')
    || !optionalString(options.reason) || !optionalString(options.suggestionReason) || !optionalTimestamp(options.now)) {
    throw new Error('This connection contains details that need review. Create it again with your own choices.');
  }
  const now = options.now ?? Date.now();
  return {
    id: options.id ?? globalThis.crypto?.randomUUID?.() ?? `relationship-${now}-${Math.random().toString(36).slice(2, 10)}`,
    targetTaskId,
    kind,
    userConfirmed: true,
    source: options.source ?? 'user',
    ...(options.reason?.trim() ? { reason: options.reason.trim() } : {}),
    ...(options.suggestionReason?.trim() ? { suggestionReason: options.suggestionReason.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function getTaskRelationshipConnections(taskId: string, tasks: readonly Task[]): {
  outgoing: ResolvedTaskRelationship[];
  incoming: ResolvedTaskRelationship[];
} {
  const edges = getConfirmedTaskRelationships(tasks);
  return {
    outgoing: edges.filter(edge => edge.source.id === taskId),
    incoming: edges.filter(edge => edge.target.id === taskId),
  };
}

export interface TaskPrerequisite {
  relationship: TaskRelationship;
  target?: Task;
  state: 'complete' | 'waiting' | 'unavailable' | 'invalid';
}

export interface TaskDependencyStatus {
  status: 'none' | 'waiting' | 'ready' | 'unresolved';
  total: number;
  completed: number;
  remaining: number;
  prerequisites: TaskPrerequisite[];
}

export function getTaskDependencyStatus(taskId: string, tasks: readonly Task[]): TaskDependencyStatus {
  const byId = tasksById(tasks);
  const source = byId.get(taskId);
  const edges = resolvedCandidates(tasks);
  const seen = new Set<string>();
  const prerequisites: TaskPrerequisite[] = !source || !isRelationshipTask(source) ? []
    : confirmedRelationships(source).flatMap(relationship => {
      if (relationship.kind !== 'depends-on' || seen.has(relationship.targetTaskId)) return [];
      seen.add(relationship.targetTaskId);
      const target = byId.get(relationship.targetTaskId);
      const state: TaskPrerequisite['state'] = !target ? 'unavailable'
        : !isRelationshipTask(target) || source.id === target.id
          || dependencyPathExists(target.id, source.id, edges) ? 'invalid'
          : target.completed === true ? 'complete' : 'waiting';
      return [{ relationship, target, state }];
    });
  const completed = prerequisites.filter(item => item.state === 'complete').length;
  return {
    status: !prerequisites.length ? 'none'
      : prerequisites.some(item => item.state === 'unavailable' || item.state === 'invalid') ? 'unresolved'
        : completed === prerequisites.length ? 'ready' : 'waiting',
    total: prerequisites.length,
    completed,
    remaining: prerequisites.length - completed,
    prerequisites,
  };
}

export interface ConfirmedTaskDomainEffect {
  link: TaskDomainLink;
  effect: TaskDomainEffect;
}

export function getConfirmedTaskDomainEffects(task: Pick<Task, 'domainLinks' | 'actionability'>): ConfirmedTaskDomainEffect[] {
  if (task.actionability === 'reference' || !Array.isArray(task.domainLinks)) return [];
  const effects = new Map<string, ConfirmedTaskDomainEffect>();
  const ambiguous = new Set<string>();
  for (const candidate of task.domainLinks as unknown[]) {
    if (!record(candidate) || !nonempty(candidate.id) || !nonempty(candidate.domainId)
      || candidate.userConfirmed !== true || typeof candidate.source !== 'string' || !LINK_SOURCES.has(candidate.source)
      || !optionalString(candidate.label) || !optionalString(candidate.reason) || !optionalString(candidate.suggestionReason)
      || !optionalTimestamp(candidate.createdAt) || !optionalTimestamp(candidate.updatedAt)
      || (candidate.strength !== undefined && candidate.strength !== 'primary' && candidate.strength !== 'secondary')) continue;
    const domainId = candidate.domainId.trim();
    if (candidate.effect !== undefined && candidate.effect !== 'supports' && candidate.effect !== 'tradeoff') {
      ambiguous.add(domainId);
      continue;
    }
    const effect: TaskDomainEffect = candidate.effect === 'tradeoff' ? 'tradeoff' : 'supports';
    if (effects.has(domainId) && effects.get(domainId)!.effect !== effect) ambiguous.add(domainId);
    else if (!effects.has(domainId)) effects.set(domainId, { link: { ...candidate, domainId } as unknown as TaskDomainLink, effect });
  }
  return [...effects.entries()].filter(([id]) => !ambiguous.has(id)).map(([, value]) => value);
}

export interface CompletedLifeContribution {
  domainId: string;
  label: string;
  supports: Task[];
  tradeoffs: Task[];
}

/** Current saved completion, not a historical impact ledger or a benefit score. */
export function getCompletedLifeContributions(tasks: readonly Task[]): CompletedLifeContribution[] {
  const result = new Map<string, CompletedLifeContribution>();
  for (const task of tasksById(tasks).values()) {
    if (task.completed !== true || !isRelationshipTask(task)) continue;
    for (const { link, effect } of getConfirmedTaskDomainEffects(task)) {
      const domainId = link.domainId.trim();
      const contribution = result.get(domainId) ?? {
        domainId, label: link.label?.trim() || domainId, supports: [], tradeoffs: [],
      };
      contribution[effect === 'supports' ? 'supports' : 'tradeoffs'].push(task);
      result.set(domainId, contribution);
    }
  }
  return [...result.values()];
}
