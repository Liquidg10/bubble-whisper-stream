import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageService } from '../storage';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useTaskStore } from '@/stores/taskStore';

describe('BubbleStore persistence contract', () => {
  beforeEach(() => {
    useBubbleStore.setState({ bubbles: [] });
    useTaskStore.setState({ tasks: [] });
    vi.restoreAllMocks();
  });

  it('rejects instead of reporting success when storage is unavailable', async () => {
    vi.spyOn(storageService, 'isInitialized').mockReturnValue(false);

    await expect(useBubbleStore.getState().addBubble({
      id: 'bubble-1',
      type: 'Task',
      content: 'Persist me',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: 0,
      y: 0,
      size: 1,
      tags: []
    })).rejects.toThrow('Database not initialized');

    expect(useBubbleStore.getState().bubbles).toHaveLength(0);
  });

  it('does not return a created task when its backing bubble did not persist', async () => {
    vi.spyOn(storageService, 'isInitialized').mockReturnValue(false);

    await expect(useTaskStore.getState().addTask({
      title: 'Persisted task only',
      type: 'task',
      priority: 50,
      completed: false,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    })).rejects.toThrow('Database not initialized');

    expect(useTaskStore.getState().getTasks()).toHaveLength(0);
  });
});
