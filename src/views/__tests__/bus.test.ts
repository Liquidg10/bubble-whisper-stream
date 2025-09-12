/**
 * ViewBus unit tests
 * 
 * Tests the lightweight event bus for task-related events, including
 * subscription management, event emission, and memory cleanup.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ViewBus, ViewBusHelpers, type TaskUpdatedEvent, type TaskMovedEvent } from '../bus';
import { createViewContext } from '../sdk';
import type { Task } from '@/types/task';

describe('ViewBus', () => {
  beforeEach(() => {
    ViewBus.clear();
  });

  describe('subscription management', () => {
    it('should allow subscribing to events', () => {
      const handler = vi.fn();
      const unsubscribe = ViewBus.subscribe('task.updated', handler);
      
      expect(ViewBus.getSubscriptionCount()).toBe(1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow unsubscribing from events', () => {
      const handler = vi.fn();
      const unsubscribe = ViewBus.subscribe('task.updated', handler);
      
      expect(ViewBus.getSubscriptionCount()).toBe(1);
      
      unsubscribe();
      
      expect(ViewBus.getSubscriptionCount()).toBe(0);
    });

    it('should call cleanup function on unsubscribe', () => {
      const handler = vi.fn();
      const cleanup = vi.fn();
      const unsubscribe = ViewBus.subscribe('task.updated', handler, cleanup);
      
      unsubscribe();
      
      expect(cleanup).toHaveBeenCalledOnce();
    });

    it('should track active event types', () => {
      ViewBus.subscribe('task.updated', vi.fn());
      ViewBus.subscribe('task.moved', vi.fn());
      ViewBus.subscribe('task.updated', vi.fn()); // Duplicate type
      
      const activeTypes = ViewBus.getActiveEventTypes();
      expect(activeTypes).toContain('task.updated');
      expect(activeTypes).toContain('task.moved');
      expect(activeTypes.length).toBe(2);
    });
  });

  describe('event emission', () => {
    it('should emit events to subscribed handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      ViewBus.subscribe('task.updated', handler1);
      ViewBus.subscribe('task.moved', handler2);
      
      const context = createViewContext('test', 'bubble');
      const task: Task = {
        id: 'test-task',
        type: 'task',
        title: 'Test Task',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const event = ViewBusHelpers.createTaskUpdatedEvent(task, context);
      ViewBus.emit('task.updated', event);
      
      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should emit to multiple handlers for the same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      ViewBus.subscribe('task.updated', handler1);
      ViewBus.subscribe('task.updated', handler2);
      
      const context = createViewContext('test', 'bubble');
      const task: Task = {
        id: 'test-task',
        type: 'task',
        title: 'Test Task',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const event = ViewBusHelpers.createTaskUpdatedEvent(task, context);
      ViewBus.emit('task.updated', event);
      
      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should handle errors in event handlers gracefully', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwingHandler = vi.fn(() => { throw new Error('Handler error'); });
      const normalHandler = vi.fn();
      
      ViewBus.subscribe('task.updated', throwingHandler);
      ViewBus.subscribe('task.updated', normalHandler);
      
      const context = createViewContext('test', 'bubble');
      const task: Task = {
        id: 'test-task',
        type: 'task',
        title: 'Test Task',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const event = ViewBusHelpers.createTaskUpdatedEvent(task, context);
      ViewBus.emit('task.updated', event);
      
      expect(consoleError).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalledWith(event);
      
      consoleError.mockRestore();
    });
  });

  describe('ViewBusHelpers', () => {
    it('should create task.updated events correctly', () => {
      const context = createViewContext('test-view', 'bubble');
      const task: Task = {
        id: 'test-task',
        type: 'task',
        title: 'Test Task',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const event = ViewBusHelpers.createTaskUpdatedEvent(task, context);
      
      expect(event.task).toBe(task);
      expect(event.source).toBe(context);
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should create task.moved events correctly', () => {
      const context = createViewContext('test-view', 'atomic');
      const fromView = { atomic: { shell: 'today' as const } };
      const toView = { atomic: { shell: 'week' as const } };
      
      const event = ViewBusHelpers.createTaskMovedEvent(
        'test-task',
        toView,
        context,
        fromView
      );
      
      expect(event.taskId).toBe('test-task');
      expect(event.fromView).toBe(fromView);
      expect(event.toView).toBe(toView);
      expect(event.source).toBe(context);
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should create view.changed events correctly', () => {
      const event = ViewBusHelpers.createViewChangedEvent(
        'test-view',
        'list',
        'activated'
      );
      
      expect(event.viewId).toBe('test-view');
      expect(event.mode).toBe('list');
      expect(event.changeType).toBe('activated');
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should create selection.changed events correctly', () => {
      const context = createViewContext('test-view', 'kanban');
      const selected = ['task1', 'task2'];
      const deselected = ['task3'];
      
      const event = ViewBusHelpers.createSelectionChangedEvent(
        'test-view',
        selected,
        deselected,
        context
      );
      
      expect(event.viewId).toBe('test-view');
      expect(event.selected).toBe(selected);
      expect(event.deselected).toBe(deselected);
      expect(event.source).toBe(context);
      expect(event.timestamp).toBeGreaterThan(0);
    });
  });

  describe('memory management', () => {
    it('should clear all subscriptions', () => {
      ViewBus.subscribe('task.updated', vi.fn());
      ViewBus.subscribe('task.moved', vi.fn());
      ViewBus.subscribe('view.changed', vi.fn());
      
      expect(ViewBus.getSubscriptionCount()).toBe(3);
      
      ViewBus.clear();
      
      expect(ViewBus.getSubscriptionCount()).toBe(0);
    });

    it('should call cleanup functions when clearing', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      
      ViewBus.subscribe('task.updated', vi.fn(), cleanup1);
      ViewBus.subscribe('task.moved', vi.fn(), cleanup2);
      
      ViewBus.clear();
      
      expect(cleanup1).toHaveBeenCalledOnce();
      expect(cleanup2).toHaveBeenCalledOnce();
    });
  });
});