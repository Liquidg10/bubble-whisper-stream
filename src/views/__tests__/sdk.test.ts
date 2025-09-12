/**
 * ViewSDK unit tests
 * 
 * Tests the ViewSDK interfaces and helper functions for creating
 * view contexts and data structures.
 */

import { describe, it, expect } from 'vitest';
import { createViewContext, createViewData } from '../sdk';
import type { Task } from '@/types/task';

describe('ViewSDK', () => {
  describe('createViewContext', () => {
    it('should create view context with current timestamp', () => {
      const before = Date.now();
      const context = createViewContext('test-view', 'bubble');
      const after = Date.now();
      
      expect(context.viewId).toBe('test-view');
      expect(context.mode).toBe('bubble');
      expect(context.now).toBeGreaterThanOrEqual(before);
      expect(context.now).toBeLessThanOrEqual(after);
    });

    it('should support all view modes', () => {
      const modes = ['bubble', 'atomic', 'list', 'kanban', 'matrix'] as const;
      
      for (const mode of modes) {
        const context = createViewContext(`test-${mode}`, mode);
        expect(context.mode).toBe(mode);
      }
    });
  });

  describe('createViewData', () => {
    it('should create view data with tasks and no selection', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          type: 'task',
          title: 'Test Task 1',
          completed: false,
          priority: 50,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'task2',
          type: 'task',
          title: 'Test Task 2',
          completed: true,
          priority: 75,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];
      
      const viewData = createViewData(tasks);
      
      expect(viewData.tasks).toBe(tasks);
      expect(viewData.selection).toBeUndefined();
    });

    it('should create view data with tasks and selection', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          type: 'task',
          title: 'Test Task 1',
          completed: false,
          priority: 50,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];
      
      const selection = ['task1'];
      const viewData = createViewData(tasks, selection);
      
      expect(viewData.tasks).toBe(tasks);
      expect(viewData.selection).toBe(selection);
    });

    it('should handle empty tasks array', () => {
      const viewData = createViewData([]);
      
      expect(viewData.tasks).toEqual([]);
      expect(viewData.selection).toBeUndefined();
    });

    it('should handle empty selection array', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          type: 'task',
          title: 'Test Task 1',
          completed: false,
          priority: 50,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];
      
      const viewData = createViewData(tasks, []);
      
      expect(viewData.tasks).toBe(tasks);
      expect(viewData.selection).toEqual([]);
    });
  });
});