import { bubbleToTask, mergeTaskIntoBubble } from '@/adapters/taskAdapter';
import type { Bubble } from '@/types/bubble';
import type { Task } from '@/types/task';
import { bubbleGrowthSourceFingerprint, canGrowBubble, createSproutTask, suggestBubbleSprouts, type BubbleSprout } from './bubbleGarden';

import { automaticGrowthCandidate } from './proactiveGrowth';
import { getConfirmedTaskDomainEffects } from './taskRelationships';

export interface BubbleGardenReviewV1 {
  version: 1;
  dismissedSproutKeys: string[];
}

export type SproutDismissal = { type: 'dismiss'; key: string } | { type: 'restore' };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function gardenMetadata(task: Pick<Task, 'metadata'>): Record<string, unknown> {
  return record(task.metadata?.bubbleGarden);
}

export function readDismissedSproutKeys(task: Pick<Task, 'metadata'>): string[] {
  const review = record(gardenMetadata(task).review);
  if (review.version !== 1 || !Array.isArray(review.dismissedSproutKeys)) return [];
  return [...new Set(review.dismissedSproutKeys.filter((key): key is string => typeof key === 'string' && key.length > 0))];
}

/** Change review preferences only; preserve the source's words, links and visual fields. */
export function patchSproutDismissal(bubble: Bubble, action: SproutDismissal, now = Date.now()): Bubble {
  const task = bubbleToTask(bubble);
  const garden = gardenMetadata(task);
  const previousReview = record(garden.review);
  if (previousReview.version !== undefined && previousReview.version !== 1) {
    throw new Error('These suggestion preferences were saved by a newer version.');
  }
  const keys = readDismissedSproutKeys(task);
  const review: BubbleGardenReviewV1 = {
    ...previousReview,
    version: 1,
    dismissedSproutKeys: action.type === 'restore' ? [] : [...new Set([...keys, action.key])],
  };
  const updatedAt = Math.max(now, bubble.updatedAt + 1);
  const projected = mergeTaskIntoBubble(bubble, {
    ...task,
    updatedAt,
    metadata: { ...task.metadata, bubbleGarden: { ...garden, review } },
  });
  return { ...bubble, updatedAt, metadata: projected.metadata };
}

export interface BubbleFamilyState {
  parent?: Task;
  parentId?: string;
  children: Task[];
}

/** Lineage is a view of saved records, independent of draft or completion state. */
export function deriveBubbleFamily(taskId: string, tasks: readonly Task[]): BubbleFamilyState {
  const task = tasks.find(item => item.id === taskId);
  const source = task ? gardenMetadata(task).sourceTaskId : undefined;
  const parentId = typeof source === 'string' && source && source !== taskId ? source : undefined;
  return {
    parentId,
    parent: parentId ? tasks.find(item => item.id === parentId) : undefined,
    children: tasks.filter(item => item.id !== taskId && gardenMetadata(item).sourceTaskId === taskId)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
  };
}

export interface ReviewPersistence {
  getBubble: (id: string) => Bubble | undefined;
  saveBubble: (bubble: Bubble) => Promise<void>;
}
const reviewWrites = new Map<string, Promise<void>>();

/** Queue each source's preference changes and reread it immediately before writing. */
export function queueGardenSourceOperation<T>(sourceId: string, action: () => Promise<T>): Promise<T> {
  const previous = reviewWrites.get(sourceId) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(action);
  const settled = operation.then(() => undefined, () => undefined);
  reviewWrites.set(sourceId, settled);
  void settled.then(() => { if (reviewWrites.get(sourceId) === settled) reviewWrites.delete(sourceId); });
  return operation;
}

export function persistSproutDismissal(sourceId: string, action: SproutDismissal, persistence: ReviewPersistence): Promise<void> {
  return queueGardenSourceOperation(sourceId, async () => {
    const source = persistence.getBubble(sourceId);
    if (!source) throw new Error('The source bubble is no longer available.');
    await persistence.saveBubble(patchSproutDismissal(source, action));
  });
}

export interface SproutPersistence {
  getTasks: () => Task[];
  addTask: (task: Omit<Task, 'id'>) => Promise<Task>;
}
export interface SproutAddition { task: Task; created: boolean }
const additions = new Map<string, Promise<SproutAddition>>();

/** A route remount joins an admitted add; an existing child is never created twice. */
export function addSproutOnce(sprout: BubbleSprout, title: string, domains: readonly string[], persistence: SproutPersistence): Promise<SproutAddition> {
  const pending = additions.get(sprout.key);
  if (pending) return pending.then(result => ({ ...result, created: false }));
  const operation = queueGardenSourceOperation(sprout.sourceTaskId, async () => {
    const tasks = persistence.getTasks();
    const existing = tasks.find(task => gardenMetadata(task).sproutKey === sprout.key);
    if (existing) return { task: existing, created: false };
    const source = tasks.find(task => task.id === sprout.sourceTaskId);
    if (!source || !canGrowBubble(source)) {
      throw new Error('Choose an unfinished task or thought before adding a new step.');
    }
    if (readDismissedSproutKeys(source).includes(sprout.key)) throw new Error('This suggestion was dismissed. Restore it before adding it.');
    if (sprout.origin === 'ai' && (!sprout.provenance || sprout.provenance.sourceFingerprint !== bubbleGrowthSourceFingerprint(source))) {
      throw new Error('This source changed. Ask for fresh suggestions before adding a step.');
    }
    if (sprout.automatic && automaticGrowthCandidate(source, tasks)?.key !== sprout.key) {
      throw new Error('Automatic steps are paused or this step is no longer available.');
    }
    if (sprout.origin !== 'ai' && !suggestBubbleSprouts(source, tasks).some(item => item.key === sprout.key)) {
      throw new Error('This note changed. Review its current suggestions before adding a step.');
    }
    const currentLinks = getConfirmedTaskDomainEffects(source).map(({ link }) => link).filter(link => domains.includes(link.domainId));
    const task = await persistence.addTask(createSproutTask({ ...sprout, domainLinks: currentLinks }, title, domains));
    return { task, created: true };
  });
  additions.set(sprout.key, operation);
  void operation.finally(() => { if (additions.get(sprout.key) === operation) additions.delete(sprout.key); }).catch(() => undefined);
  return operation;
}
