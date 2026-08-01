/**
 * Task Adapter Tests - Comprehensive round-trip and edge case testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  bubbleToTask,
  mergeTaskIntoBubble,
  taskToBubble,
  UnsupportedCanonicalTaskVersionError,
  validateRoundTrip,
  withBubbleDomainLinks,
} from '../taskAdapter';
import { type BubbleType, type Bubble } from '@/types/bubble';
import {
  CANONICAL_TASK_CONTRACT_VERSION,
  type Task,
} from '@/types/task';

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
      expect(bubble.completed).toBe(true);
      expect(bubble.size).toBe(0.8); // 80/100
      expect(bubble.tags).toEqual([{ id: 'tag-1', name: 'urgent', emoji: '🚨' }]);
      expect(bubble.x).toBe(150);
      expect(bubble.y).toBe(250);
      expect(bubble.moodColor).toBe('#ff0000');
      expect(bubble.metadata?.canonicalTask).toMatchObject({
        schemaVersion: CANONICAL_TASK_CONTRACT_VERSION,
        type: 'task',
        completed: true,
      });
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
      expect(result.convertedBubble.completed).toBe(true);
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

  describe('Canonical Task Contract v0.1', () => {
    it('survives JSON persistence and switching projections without semantic loss', () => {
      const task: Task = {
        id: 'contract-1',
        type: 'event',
        title: 'Prepare for the appointment',
        description: 'Bring the notes',
        completed: true,
        priority: 73,
        actionability: 'actionable',
        energyFit: 'low',
        estimatedMinutes: 25,
        urgency: 3,
        readiness: {
          band: 'now',
          source: 'computed',
          score: 0.875,
          reason: 'Fits current energy and available time',
          factors: [{
            key: 'energy',
            score: 1,
            weight: 0.4,
            available: true,
            explanation: 'Task energy fits the current energy.',
          }],
          evaluatedAt: 4000,
          inputSnapshot: {
            energyMatch: 0.9,
            timeFit: 0.8,
            contextFit: 1,
            blocked: false,
          },
        },
        domainLinks: [
          {
            id: 'link-health',
            domainId: 'health',
            label: 'Health',
            userConfirmed: true,
            source: 'user',
            strength: 'primary',
            createdAt: 3000,
            updatedAt: 3500,
          },
          {
            id: 'link-work-suggestion',
            domainId: 'work',
            label: 'Work',
            userConfirmed: false,
            source: 'assistant',
          },
        ],
        tags: [{ id: 'tag-1', name: 'appointment' }],
        createdAt: 1000,
        updatedAt: 5000,
        due: 6000,
        start: 6100,
        end: 6200,
        view: {
          bubble: { x: 12, y: -8, size: 0.73, colorHex: '#123456' },
          atomic: { shell: 'today', domain: 'Health', angle: 1.25 },
          list: { group: 'Next', order: 2 },
          kanban: { boardId: 'main', columnId: 'doing', pos: 1 },
          matrix: { urgency: 3, importance: 2, quadrant: 1 },
          pinboard: { x: 5, y: 7, energy: 'low', ordering: 4 },
          calendar: {
            startTime: '2026-07-28T09:00:00.000Z',
            durationMin: 30,
            calendarId: 'primary',
          },
          email: {
            to: ['care@example.com'],
            subject: 'Appointment notes',
          },
        },
        metadata: {
          outliner: {
            parentId: 'parent-1',
            steps: [{
              id: 'step-1',
              title: 'Collect notes',
              completed: true,
              estimateMin: 10,
              dependencies: ['step-0'],
            }],
          },
          custom: {
            preserveExactly: true,
          },
        },
      };

      const persistedBubble = JSON.parse(JSON.stringify(taskToBubble(task))) as Bubble;
      const restoredTask = bubbleToTask(persistedBubble);

      expect(persistedBubble.metadata?.canonicalTask?.schemaVersion)
        .toBe(CANONICAL_TASK_CONTRACT_VERSION);
      expect(restoredTask).toEqual(task);
    });

    it('lazily migrates a legacy Bubble while preserving completion and metadata', () => {
      const legacyBubble: Bubble = {
        id: 'legacy-1',
        type: 'Task',
        content: 'Legacy task',
        completed: true,
        tags: [],
        createdAt: 0,
        updatedAt: 0,
        x: 0,
        y: 0,
        size: 0,
        metadata: {
          outliner: {
            parentTaskId: 'legacy-parent',
            stepId: 'legacy-step',
            estimatedMinutes: 15,
            dependsOn: 'previous-step',
          },
          focusSession: {
            duration: 25,
            stepsCompleted: 2,
            log: ['Started', 'Finished'],
          },
        },
      };

      const migratedBubble = taskToBubble(bubbleToTask(legacyBubble));

      expect(migratedBubble.completed).toBe(true);
      expect(migratedBubble.createdAt).toBe(0);
      expect(migratedBubble.updatedAt).toBe(0);
      expect(migratedBubble.x).toBe(0);
      expect(migratedBubble.y).toBe(0);
      expect(migratedBubble.size).toBe(0);
      expect(migratedBubble.metadata?.outliner).toEqual(legacyBubble.metadata?.outliner);
      expect(migratedBubble.metadata?.focusSession).toEqual(legacyBubble.metadata?.focusSession);
      expect(migratedBubble.metadata?.canonicalTask).toMatchObject({
        schemaVersion: CANONICAL_TASK_CONTRACT_VERSION,
        type: 'task',
        completed: true,
        estimatedMinutes: 15,
      });
    });

    it('does not promote inferred domains into user-confirmed domain links', () => {
      const legacyBubble: Bubble = {
        id: 'legacy-domain',
        type: 'Task',
        content: 'Call the doctor about medication',
        completed: false,
        tags: [{ id: 'today', name: 'today' }],
        createdAt: 1000,
        updatedAt: 1000,
        x: 0,
        y: 0,
        size: 0.5,
      };

      const task = bubbleToTask(legacyBubble);

      expect(task.view?.atomic?.domain).toBe('Health');
      expect(task.domainLinks).toBeUndefined();
    });

    it('prefers an explicit Bubble completion update over a stale envelope', () => {
      const persistedBubble = taskToBubble({
        id: 'completion-coherence',
        type: 'task',
        title: 'Completion coherence',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      persistedBubble.completed = true;

      expect(bubbleToTask(persistedBubble).completed).toBe(true);
    });

    it('patches domain links without losing Bubble-only fields', () => {
      const original: Bubble = {
        id: 'rich-bubble',
        type: 'Task',
        content: 'Walk with family',
        audioUri: 'local://audio.m4a',
        imageUri: 'local://image.jpg',
        caption: 'A trail',
        createdAt: 100,
        updatedAt: 200,
        x: 12,
        y: 34,
        size: 0.7,
        moodColor: '#123456',
        mood: 'hopeful',
        tags: [{ id: 'tag-1', name: 'outside' }],
        location: { lat: 1, lon: 2 },
        reminderId: 'reminder-1',
        metadata: { customLegacyValue: { keep: true } },
      };

      const updated = withBubbleDomainLinks(original, [{
        id: 'link-1',
        domainId: 'family',
        label: 'Family',
        userConfirmed: true,
        source: 'user',
        strength: 'primary',
      }], 300);

      expect(updated).toMatchObject({
        ...original,
        updatedAt: 300,
        metadata: expect.any(Object),
      });
      expect(updated.metadata?.customLegacyValue).toEqual({ keep: true });
      expect(bubbleToTask(updated).domainLinks).toEqual([
        expect.objectContaining({ domainId: 'family', userConfirmed: true }),
      ]);
      expect(original.metadata?.canonicalTask).toBeUndefined();
    });

    it('merges Task edits while preserving Bubble-only attachments and context', () => {
      const original: Bubble = {
        id: 'merge-rich-bubble',
        type: 'Memory',
        content: 'Original',
        audioUri: 'local://audio.m4a',
        imageUri: 'local://image.jpg',
        createdAt: 100,
        updatedAt: 200,
        x: 1,
        y: 2,
        size: 0.4,
        mood: 'calm',
        tags: [],
        location: { lat: 3, lon: 4 },
        reminderId: 'reminder-2',
      };
      const updatedTask = {
        ...bubbleToTask(original),
        title: 'Updated',
        updatedAt: 300,
      };

      const merged = mergeTaskIntoBubble(original, updatedTask);

      expect(merged.content).toBe('Updated');
      expect(merged.audioUri).toBe(original.audioUri);
      expect(merged.imageUri).toBe(original.imageUri);
      expect(merged.location).toEqual(original.location);
      expect(merged.mood).toBe(original.mood);
      expect(merged.reminderId).toBe(original.reminderId);
    });

    it('preserves unknown fields from a supported canonical envelope', () => {
      const original = taskToBubble({
        id: 'future-field',
        type: 'task',
        title: 'Supported envelope',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      });
      Object.assign(original.metadata!.canonicalTask!, {
        futureCompatibleReceipt: { keep: true },
      });

      const updated = withBubbleDomainLinks(original, [], 2);

      expect((updated.metadata?.canonicalTask as unknown as Record<string, unknown>)
        .futureCompatibleReceipt).toEqual({ keep: true });
    });

    it('fails closed instead of overwriting a newer canonical schema', () => {
      const original: Bubble = {
        id: 'future-schema',
        type: 'Task',
        content: 'Newer data',
        createdAt: 1,
        updatedAt: 1,
        x: 0,
        y: 0,
        size: 0.5,
        tags: [],
        metadata: {
          canonicalTask: {
            schemaVersion: 2,
            type: 'task',
            completed: false,
            futureLedger: [{ id: 'event-1' }],
          } as unknown as NonNullable<Bubble['metadata']>['canonicalTask'],
        },
      };

      expect(() => withBubbleDomainLinks(original, [], 2))
        .toThrow(UnsupportedCanonicalTaskVersionError);
      expect(() => mergeTaskIntoBubble(original, bubbleToTask(original)))
        .toThrow(UnsupportedCanonicalTaskVersionError);
      expect((original.metadata?.canonicalTask as unknown as Record<string, unknown>)
        .futureLedger).toEqual([{ id: 'event-1' }]);
    });
  });
});
