import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { taskToBubble } from '@/adapters/taskAdapter';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useTaskStore } from '@/stores/taskStore';
import type { Bubble } from '@/types/bubble';
import type { Task } from '@/types/task';
import { storageService } from '@/services/storage';

vi.mock('@/services/taskAwareAutoWriteService', () => ({
  taskAwareAutoWriteService: {
    evaluateTask: vi.fn().mockResolvedValue(undefined),
  },
}));

const originalUpdateBubble = useBubbleStore.getState().updateBubble;
const originalUpdateBubbleStrict = useBubbleStore.getState().updateBubbleStrict;

function installInMemoryBubblePersistence(initialBubble: Bubble) {
  const updateBubble = vi.fn(async (bubble: Bubble) => {
    useBubbleStore.setState(state => ({
      bubbles: state.bubbles.map(existing => (
        existing.id === bubble.id ? bubble : existing
      )),
    }));
  });

  useBubbleStore.setState({
    bubbles: [initialBubble],
    updateBubble,
    updateBubbleStrict: updateBubble,
  });
  useTaskStore.getState().refreshFromBubbleStore();

  return updateBubble;
}

describe('TaskStore Canonical Task Contract v0.1', () => {
  beforeEach(() => {
    useBubbleStore.setState({ bubbles: [] });
    useTaskStore.setState({
      tasks: [],
      selectedTaskIds: new Set(),
      isLoading: false,
    });
  });

  afterEach(() => {
    useBubbleStore.setState({
      bubbles: [],
      updateBubble: originalUpdateBubble,
      updateBubbleStrict: originalUpdateBubbleStrict,
    });
    useTaskStore.setState({
      tasks: [],
      selectedTaskIds: new Set(),
      isLoading: false,
    });
    vi.clearAllMocks();
  });

  it('preserves completion and core semantics across view updates and JSON reload', async () => {
    const task: Task = {
      id: 'store-contract-1',
      type: 'task',
      title: 'One task, multiple views',
      completed: false,
      priority: 65,
      actionability: 'actionable',
      energyFit: 'medium',
      estimatedMinutes: 20,
      urgency: 2,
      readiness: {
        band: 'possible',
        source: 'computed',
        score: 0.68,
        reason: 'Fits with a little preparation',
        override: {
          band: 'possible',
          setAt: 1900,
          reason: 'I want to keep this nearby.',
          expiresAt: 3000,
        },
      },
      domainLinks: [{
        id: 'domain-link-1',
        domainId: 'personal',
        label: 'Personal',
        userConfirmed: true,
        source: 'user',
      }],
      tags: [],
      createdAt: 1000,
      updatedAt: 2000,
      view: {
        bubble: { x: 10, y: 20, size: 0.65 },
        list: { group: 'Next', order: 1 },
      },
    };

    const updateBubble = installInMemoryBubblePersistence(taskToBubble(task));

    await useTaskStore.getState().updateTask(task.id, {
      actionability: 'reference',
      view: {
        ...task.view,
        kanban: { boardId: 'main', columnId: 'doing', pos: 0 },
        matrix: { urgency: 2, importance: 3, quadrant: 1 },
      },
    });
    await useTaskStore.getState().toggleTaskCompletion(task.id);

    expect(updateBubble).toHaveBeenCalledTimes(2);
    expect(useTaskStore.getState().getTask(task.id)).toMatchObject({
      completed: true,
      actionability: 'reference',
      energyFit: 'medium',
      estimatedMinutes: 20,
      urgency: 2,
      readiness: task.readiness,
      domainLinks: task.domainLinks,
      view: {
        bubble: task.view?.bubble,
        list: task.view?.list,
        kanban: { boardId: 'main', columnId: 'doing', pos: 0 },
        matrix: { urgency: 2, importance: 3, quadrant: 1 },
      },
    });

    const serializedBubble = JSON.parse(
      JSON.stringify(useBubbleStore.getState().bubbles[0]),
    ) as Bubble;
    useBubbleStore.setState({ bubbles: [serializedBubble] });
    useTaskStore.getState().refreshFromBubbleStore();

    expect(useTaskStore.getState().getTask(task.id)).toMatchObject({
      completed: true,
      actionability: 'reference',
      energyFit: 'medium',
      estimatedMinutes: 20,
      urgency: 2,
      readiness: task.readiness,
      domainLinks: task.domainLinks,
    });
    expect(useTaskStore.getState().getCompletedTasks()).toHaveLength(1);
  });

  it('preserves Bubble-only fields when a canonical link is edited through TaskStore', async () => {
    const original: Bubble = {
      id: 'store-rich-bubble',
      type: 'Task',
      content: 'Keep the context',
      audioUri: 'local://voice.m4a',
      imageUri: 'local://photo.jpg',
      createdAt: 1000,
      updatedAt: 2000,
      x: 10,
      y: 20,
      size: 0.5,
      mood: 'steady',
      tags: [],
      location: { lat: 1, lon: 2 },
      reminderId: 'reminder-1',
    };
    installInMemoryBubblePersistence(original);

    await useTaskStore.getState().updateTask(original.id, {
      domainLinks: [{
        id: 'link-1',
        domainId: 'family',
        label: 'Family',
        userConfirmed: true,
        source: 'user',
      }],
    });

    expect(useBubbleStore.getState().bubbles[0]).toMatchObject({
      audioUri: original.audioUri,
      imageUri: original.imageUri,
      location: original.location,
      mood: original.mood,
      reminderId: original.reminderId,
      metadata: {
        canonicalTask: {
          domainLinks: [expect.objectContaining({ domainId: 'family' })],
        },
      },
    });
  });

  it('propagates a rejected strict persistence write without changing in-memory state', async () => {
    const original: Bubble = {
      id: 'failed-write',
      type: 'Task',
      content: 'Original title',
      createdAt: 1,
      updatedAt: 1,
      x: 0,
      y: 0,
      size: 0.5,
      tags: [],
    };
    useBubbleStore.setState({
      bubbles: [original],
      updateBubble: originalUpdateBubble,
      updateBubbleStrict: originalUpdateBubbleStrict,
    });
    const persistence = vi
      .spyOn(storageService, 'updateBubble')
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'));

    await expect(useBubbleStore.getState().updateBubbleStrict({
      ...original,
      content: 'Unsaved title',
    })).rejects.toThrow('IndexedDB unavailable');

    expect(useBubbleStore.getState().bubbles[0].content).toBe('Original title');
    persistence.mockRestore();
  });
});
