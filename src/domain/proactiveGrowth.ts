import { bubbleToTask, mergeTaskIntoBubble } from '@/adapters/taskAdapter';
import type { Bubble } from '@/types/bubble';
import type { Task } from '@/types/task';
import { canGrowBubble, suggestBubbleSprouts, type BubbleSprout } from './bubbleGarden';
import { addSproutOnce, deriveBubbleFamily, queueGardenSourceOperation, readDismissedSproutKeys, type ReviewPersistence, type SproutPersistence } from './bubbleGardenState';
import { getTaskDependencyStatus } from './taskRelationships';

interface ProactiveGrowthState { version: 1; enabled: boolean }
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function getProactiveGrowthState(task: Pick<Task, 'metadata'>): ProactiveGrowthState {
  const saved = record(record(task.metadata?.bubbleGarden).proactive);
  return { version: 1, enabled: saved.version === 1 && saved.enabled === true };
}
export function canEnrollAutomaticGrowth(source: Task): boolean {
  return canGrowBubble(source) && !record(source.metadata?.bubbleGarden).sourceTaskId;
}
export function growthDependencyPaused(source: Task, tasks: readonly Task[]): boolean {
  const status = getTaskDependencyStatus(source.id, tasks).status;
  return status === 'waiting' || status === 'unresolved';
}
export function automaticGrowthCandidate(source: Task, tasks: readonly Task[]): BubbleSprout | undefined {
  if (!getProactiveGrowthState(source).enabled || !canEnrollAutomaticGrowth(source) || growthDependencyPaused(source, tasks)) return undefined;
  if (deriveBubbleFamily(source.id, tasks).children.some(child => !child.completed)) return undefined;
  const dismissed = new Set(readDismissedSproutKeys(source));
  const draft = suggestBubbleSprouts(source, tasks).find(item => item.origin === 'notes' && !dismissed.has(item.key));
  return draft ? { ...draft, automatic: true } : undefined;
}

/** Proposals stay quiet and local. Reading this shelf creates no tasks. */
export function collectProactiveSuggestions(tasks: readonly Task[]): BubbleSprout[] {
  return tasks.filter(source => canGrowBubble(source) && !growthDependencyPaused(source, tasks))
    .flatMap(source => {
      const dismissed = new Set(readDismissedSproutKeys(source));
      const draft = suggestBubbleSprouts(source, tasks).find(item => !dismissed.has(item.key));
      return draft ? [draft] : [];
    })
    .sort((a, b) => Number(b.origin === 'notes') - Number(a.origin === 'notes') || b.domainLinks.length - a.domainLinks.length || a.sourceTaskId.localeCompare(b.sourceTaskId))
    .slice(0, 3);
}

/** Enablement is a strict metadata write and never enrolls grown children. */
export function patchProactiveGrowthMode(bubble: Bubble, enabled: boolean, now = Date.now()): Bubble {
  const task = bubbleToTask(bubble);
  if (enabled && !canEnrollAutomaticGrowth(task)) throw new Error('Automatic steps are available for unfinished source tasks and thoughts.');
  const garden = record(task.metadata?.bubbleGarden);
  const current = record(garden.proactive);
  if (current.version !== undefined && current.version !== 1) throw new Error('These automatic step preferences were saved by a newer version.');
  const updatedAt = Math.max(now, bubble.updatedAt + 1);
  const projected = mergeTaskIntoBubble(bubble, { ...task, updatedAt, metadata: { ...task.metadata, bubbleGarden: { ...garden, proactive: { ...current, version: 1, enabled } } } });
  return { ...bubble, updatedAt, metadata: projected.metadata };
}
export function persistProactiveGrowthMode(sourceId: string, enabled: boolean, persistence: ReviewPersistence): Promise<void> {
  return queueGardenSourceOperation(sourceId, async () => {
    const bubble = persistence.getBubble(sourceId);
    if (!bubble) throw new Error('The source bubble is no longer available.');
    await persistence.saveBubble(patchProactiveGrowthMode(bubble, enabled));
  });
}

/** Admission rechecks enablement, notes, dependencies and open children in the shared source queue. */
export async function runAutomaticGrowth(sourceId: string, persistence: SproutPersistence) {
  const tasks = persistence.getTasks();
  const source = tasks.find(task => task.id === sourceId);
  const draft = source ? automaticGrowthCandidate(source, tasks) : undefined;
  if (!draft) return undefined;
  return addSproutOnce(draft, draft.title, draft.domainLinks.map(link => link.domainId), persistence);
}
