/**
 * Task Adapter Tests - Comprehensive round-trip and edge case testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bubbleToTask, taskToBubble, validateRoundTrip } from '../taskAdapter';
import { type BubbleType, type Bubble } from '@/types/bubble';
import { type Task } from '@/types/task';

describe('TaskAdapter', () => {
  describe('bubbleToTask', () => {
    it('converts basic bubble to task correctly', () => {
      const bubble: Bubble = {
        id: 'test-1',
        type: 'Task' as BubbleType,
        content: 'Test Task',
        completed: false,
        tags: [{ id: 'tag-1', name: 'work', emoji: '💼' }],
        createdAt: 1000,
        updatedAt: 2000,
        x: 100,
        y: 200,
        size: 0.75
      };

      const task = bubbleToTask(bubble);

      expect(task.id).toBe('test-1');
      expect(task.type).toBe('task');
      expect(task.title).toBe('Test Task');
      expect(task.completed).toBe(false);
      expect(task.priority).toBe(75); // 0.75 * 100
      expect(task.tags).toEqual([{ id: 'tag-1', name: 'work', emoji: '💼' }]);
      expect(task.createdAt).toBe(1000);
      expect(task.updatedAt).toBe(2000);
      expect(task.view?.bubble).toEqual({
        x: 100,
        y: 200,
        size: 0.75,
        colorHex: undefined
      });
    });

    it('handles missing size by using y position fallback', () => {
      const bubble: Bubble = {
        id: 'test-2',
        type: 'Task' as BubbleType,
        content: 'No Size Task',
        completed: false,
        tags: [],
        createdAt: 1000,
        updatedAt: 2000,
        x: 50,
        y: 250, // 250/1000 = 0.25 from top, so priority = (1-0.25)*100 = 75
        size: undefined
      };

      const task = bubbleToTask(bubble);
      expect(task.priority).toBe(75);
    });

    it('preserves horizon tags in atomic view', () => {
      const bubble: Bubble = {
        id: 'test-3',
        type: 'Task' as BubbleType,
        content: 'Horizon Task',
        completed: false,
        tags: [
          { id: 'tag-1', name: 'today', emoji: '📅' },
          { id: 'tag-2', name: 'work', emoji: '💼' }
        ],
        createdAt: 1000,
        updatedAt: 2000,
        x: 0,
        y: 0,
        size: 0.5
      };

      const task = bubbleToTask(bubble);
      expect(task.view?.atomic?.shell).toBe('today');
    });

    it('preserves all bubble metadata', () => {
      const bubble: Bubble = {
        id: 'test-4',
        type: 'Task' as BubbleType,
        content: 'Metadata Task',
        completed: false,
        tags: [],
        createdAt: 1000,
        updatedAt: 2000,
        x: 0,
        y: 0,
        size: 0.5,
        metadata: {
          outliner: {
            parentTaskId: 'parent-1',
            stepId: 'step-1'
          },
          finance: {
            merchant: 'Test Store',
            total: 100,
            category: 'groceries'
          }
        }
      };

      const task = bubbleToTask(bubble);
      expect(task.metadata?.outliner).toBeDefined();
      expect(task.metadata?.finance).toBeDefined();
      expect(task.metadata?.finance?.merchant).toBe('Test Store');
    });

    it('handles errors gracefully', () => {
      // Bubble with minimal required fields
      const invalidBubble = {
        id: 'test-5'
      } as Bubble;

      const task = bubbleToTask(invalidBubble);
      
      // Should return valid task even with invalid input
      expect(task.id).toBe('test-5');
      expect(task.type).toBe('task');
      expect(task.title).toBe('Untitled');
      expect(task.completed).toBe(false);
      expect(task.priority).toBe(50);
      expect(task.tags).toEqual([]);
      expect(task.view?.bubble).toBeDefined();
    });
  });

  describe('taskToBubble', () => {
    it('converts basic task to bubble correctly', () => {
      const task: Task = {
        id: 'task-1',
        type: 'task',
        title: 'Test Task',
        description: 'Test description',
        completed: true,
        priority: 80,
        tags: [{ id: 'tag-1', name: 'urgent', emoji: '🚨' }],
        createdAt: 1000,
        updatedAt: 2000,
        view: {
          bubble: {
            x: 150,
            y: 250,
            size: 0.8,
            colorHex: '#ff0000'
          }
        }
      };

      const bubble = taskToBubble(task);

      expect(bubble.id).toBe('task-1');
      expect(bubble.type).toBe('Task');
      expect(bubble.content).toBe('Test Task');
      expect(bubble.caption).toBe('Test description');
      expect(bubble.size).toBe(0.8); // 80/100
      expect(bubble.tags).toEqual([{ id: 'tag-1', name: 'urgent', emoji: '🚨' }]);
      expect(bubble.x).toBe(150);
      expect(bubble.y).toBe(250);
      expect(bubble.moodColor).toBe('#ff0000');
    });

    it('sets horizon tags from atomic view', () => {
      const task: Task = {
        id: 'task-2',
        type: 'task',
        title: 'Horizon Task',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: 1000,
        updatedAt: 2000,
        view: {
          atomic: {
            shell: 'week',
            domain: 'work'
          }
        }
      };

      const bubble = taskToBubble(task);
      
      // Should have week horizon tag
      const horizonTag = bubble.tags.find(tag => tag.name === 'week');
      expect(horizonTag).toBeDefined();
    });

    it('preserves metadata when converting', () => {
      const originalMetadata = {
        outliner: {
          parentId: 'parent-1',
          steps: [{
            id: 'step-1',
            title: 'Test step',
            completed: false
          }]
        }
      };

      const task: Task = {
        id: 'task-3',
        type: 'task',
        title: 'Metadata Task',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: 1000,
        updatedAt: 2000,
        metadata: originalMetadata
      };

      const bubble = taskToBubble(task);
      expect(bubble.metadata?.outliner).toEqual(originalMetadata.outliner);
    });

    it('handles errors gracefully', () => {
      const invalidTask = {
        id: 'task-5'
      } as Task;

      const bubble = taskToBubble(invalidTask);
      
      // Should return valid bubble even with invalid input
      expect(bubble.id).toBe('task-5');
      expect(bubble.type).toBe('Task');
      expect(bubble.content).toBe('task-5'); // Falls back to ID
      expect(bubble.size).toBe(0.5);
      expect(bubble.x).toBe(0);
      expect(bubble.y).toBe(0);
    });
  });

  describe('Round-trip validation', () => {
    it('preserves core fields in round-trip', () => {
      const originalBubble: Bubble = {
        id: 'round-trip-1',
        type: 'Task' as BubbleType,
        content: 'Round Trip Test',
        completed: true,
        tags: [
          { id: 'tag-1', name: 'work', emoji: '💼' },
          { id: 'tag-2', name: 'today', emoji: '📅' }
        ],
        createdAt: 1000,
        updatedAt: 2000,
        x: 100,
        y: 200,
        size: 0.6,
        moodColor: '#0066cc'
      };

      const result = validateRoundTrip(originalBubble);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.convertedBubble.id).toBe(originalBubble.id);
      expect(result.convertedBubble.content).toBe(originalBubble.content);
    });

    it('maintains priority mapping accuracy within ±1', () => {
      const testCases = [0, 0.25, 0.5, 0.75, 1.0];
      
      testCases.forEach(size => {
        const bubble: Bubble = {
          id: `priority-test-${size}`,
          type: 'Task' as BubbleType,
          content: `Priority ${size}`,
          completed: false,
          tags: [],
          createdAt: 1000,
          updatedAt: 2000,
          x: 0,
          y: 0,
          size
        };

        const result = validateRoundTrip(bubble);
        expect(result.isValid).toBe(true);
        
        // Check priority mapping accuracy
        const expectedPriority = Math.round(size * 100);
        const actualPriority = Math.round((result.convertedBubble.size || 0) * 100);
        expect(Math.abs(expectedPriority - actualPriority)).toBeLessThanOrEqual(1);
      });
    });

    it('preserves outliner metadata', () => {
      const originalBubble: Bubble = {
        id: 'outliner-test',
        type: 'Task' as BubbleType,
        content: 'Outliner Test',
        completed: false,
        tags: [],
        createdAt: 1000,
        updatedAt: 2000,
        x: 0,
        y: 0,
        size: 0.5,
        metadata: {
          outliner: {
            parentTaskId: 'parent-1',
            stepId: 'step-1'
          }
        }
      };

      const result = validateRoundTrip(originalBubble);
      expect(result.isValid).toBe(true);
      expect(result.convertedBubble.metadata?.outliner).toBeDefined();
    });

    it('handles edge cases without errors', () => {
      const edgeCases: Partial<Bubble>[] = [
        // Minimal bubble
        { id: 'edge-1', type: 'Task', content: '', completed: false, tags: [], createdAt: 0, updatedAt: 0, x: 0, y: 0 },
        // Negative coordinates
        { id: 'edge-2', type: 'Task', content: 'Negative', completed: false, tags: [], createdAt: 0, updatedAt: 0, x: -100, y: -50, size: 0.3 },
        // Out of bounds size
        { id: 'edge-3', type: 'Task', content: 'Out of bounds', completed: false, tags: [], createdAt: 0, updatedAt: 0, x: 0, y: 0, size: 1.5 },
      ];

      edgeCases.forEach((bubbleData, index) => {
        const bubble = bubbleData as Bubble;
        const result = validateRoundTrip(bubble);
        
        // Should not throw errors even with edge cases
        expect(result.errors.length).toBeLessThanOrEqual(1); // Allow for minor priority adjustments
        expect(result.task).toBeDefined();
        expect(result.convertedBubble).toBeDefined();
      });
    });
  });
});