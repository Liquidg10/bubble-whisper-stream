/**
 * Task Adapter - Bi-directional conversion between Bubble and Task
 * 
 * Provides lossless conversion that preserves all existing Bubble metadata
 * while adding Task-specific view organization.
 */

import type { Bubble, BubbleType } from '@/types/bubble';
import type { Task, TaskType, TimeHorizon } from '@/types/task';
import { getHorizon, setHorizon } from '@/lib/horizon';
import { classifyDomain } from '@/lib/classifyDomain';
import { logger } from '@/utils/logger';

/**
 * Convert Bubble priority/size (0-1) to Task priority (0-100)
 */
function sizeToPriority(size?: number): number {
  if (size === undefined || size === null) return 50; // Default medium priority
  return Math.round(Math.max(0, Math.min(1, size)) * 100);
}

/**
 * Convert Task priority (0-100) to Bubble size (0-1)
 */
function priorityToSize(priority: number): number {
  return Math.max(0, Math.min(100, priority)) / 100;
}

/**
 * Fallback: Convert Bubble y position to priority
 * Higher on canvas (lower y) = higher priority
 */
function yToPriority(y?: number, canvasHeight: number = 1000): number {
  if (y === undefined || y === null) return 50;
  return Math.round((1 - Math.max(0, Math.min(canvasHeight, y)) / canvasHeight) * 100);
}

/**
 * Map BubbleType to TaskType
 */
function bubbleTypeToTaskType(bubbleType: BubbleType): TaskType {
  const typeMap: Record<BubbleType, TaskType> = {
    'Thought': 'thought',
    'Task': 'task',
    'Memory': 'memory',
    'Mood': 'mood',
    'ReminderNote': 'reminder'
  };
  
  return typeMap[bubbleType] || 'task';
}

/**
 * Map TaskType to BubbleType
 */
function taskTypeToBubbleType(taskType: TaskType): BubbleType {
  const typeMap: Record<TaskType, BubbleType> = {
    thought: 'Thought',
    task: 'Task', 
    memory: 'Memory',
    mood: 'Mood',
    reminder: 'ReminderNote',
    photo: 'Task', // Map to Task as fallback
    event: 'Task'  // Map to Task as fallback
  };
  
  return typeMap[taskType] || 'Task';
}

/**
 * Convert Bubble to Task
 * 
 * Extracts view metadata from Bubble positioning and tags while preserving
 * all existing metadata.
 */
export function bubbleToTask(bubble: Bubble): Task {
  try {
    // Extract priority from size, fallback to y position
    const priority = bubble.size !== undefined 
      ? sizeToPriority(bubble.size)
      : yToPriority(bubble.y);

    // Get current horizon from tags
    const horizon = getHorizon(bubble);
    
    // Classify domain for atomic view
    const domain = classifyDomain(bubble);

    // Build view metadata
    const view: Task['view'] = {
        bubble: {
          x: bubble.x || 0,
          y: bubble.y || 0,
          size: bubble.size || priorityToSize(priority),
          colorHex: bubble.moodColor
        }
    };

    // Add atomic view if horizon exists
    if (horizon) {
      view.atomic = {
        shell: horizon,
        domain: domain || undefined,
        angle: bubble.metadata?.atomic?.angle
      };
    }

    // Preserve list/kanban/matrix metadata if present
    if (bubble.metadata?.list) {
      view.list = bubble.metadata.list;
    }
    if (bubble.metadata?.kanban) {
      view.kanban = bubble.metadata.kanban;
    }
    if (bubble.metadata?.matrix) {
      view.matrix = bubble.metadata.matrix;
    }
    if (bubble.metadata?.calendar) {
      view.calendar = bubble.metadata.calendar;
    }

    const task: Task = {
      id: bubble.id,
      type: bubbleTypeToTaskType(bubble.type),
      title: bubble.content || 'Untitled',
      description: bubble.caption,
      completed: false, // Bubbles don't have completion state
      priority,
      tags: bubble.tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        emoji: tag.emoji,
        colorHex: tag.colorHex
      })),
      createdAt: bubble.createdAt || Date.now(),
      updatedAt: bubble.updatedAt || Date.now(),
      due: undefined, // Will handle reminders separately
      start: bubble.metadata?.calendar?.start,
      end: bubble.metadata?.calendar?.end,
      view,
      metadata: bubble.metadata // Preserve all existing metadata
    };

    logger.debug('Converted Bubble to Task', { bubbleId: bubble.id, taskId: task.id, priority });
    return task;

  } catch (error) {
    logger.error('Failed to convert Bubble to Task', error, { bubbleId: bubble.id });
    // Return minimal valid task on error
      return {
        id: bubble.id,
        type: 'task',
        title: bubble.content || 'Untitled',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        view: {
          bubble: { x: 0, y: 0, size: 0.5 }
        }
      };
  }
}

/**
 * Convert Task to Bubble
 * 
 * Writes view metadata back to appropriate Bubble fields while preserving
 * all existing functionality.
 */
export function taskToBubble(task: Task): Bubble {
  try {
    // Convert priority back to size
    const size = priorityToSize(task.priority);
    
    // Build base bubble
    let bubble: Bubble = {
      id: task.id,
      type: taskTypeToBubbleType(task.type),
      content: task.title,
      caption: task.description,
      tags: task.tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        emoji: tag.emoji,
        colorHex: tag.colorHex
      })),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      x: task.view?.bubble?.x || 0,
      y: task.view?.bubble?.y || 0,
      size,
      moodColor: task.view?.bubble?.colorHex,
      metadata: { ...task.metadata } // Preserve existing metadata
    };

    // Set reminder if due date exists - will be handled by reminder system

    // Apply horizon from atomic view if present
    if (task.view?.atomic?.shell) {
      bubble = setHorizon(bubble, task.view.atomic.shell);
    }

    // Merge view-specific metadata
    bubble.metadata = {
      ...bubble.metadata,
      atomic: task.view?.atomic ? {
        domain: task.view.atomic.domain,
        angle: task.view.atomic.angle,
        ...bubble.metadata?.atomic
      } : bubble.metadata?.atomic,
      list: task.view?.list || bubble.metadata?.list,
      kanban: task.view?.kanban || bubble.metadata?.kanban,
      matrix: task.view?.matrix || bubble.metadata?.matrix,
      calendar: task.view?.calendar ? {
        start: task.start,
        end: task.end,
        ...task.view.calendar,
        ...bubble.metadata?.calendar
      } : bubble.metadata?.calendar
    };

    logger.debug('Converted Task to Bubble', { taskId: task.id, bubbleId: bubble.id, size });
    return bubble;

  } catch (error) {
    logger.error('Failed to convert Task to Bubble', error, { taskId: task.id });
    // Return minimal valid bubble on error
    return {
      id: task.id,
      type: 'Task',
      content: task.title || 'Untitled',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: 0,
      y: 0,
      size: 0.5
    };
  }
}

/**
 * Round-trip test helper
 * Verifies that Bubble → Task → Bubble preserves core data
 */
export function validateRoundTrip(originalBubble: Bubble): {
  isValid: boolean;
  errors: string[];
  task: Task;
  convertedBubble: Bubble;
} {
  const errors: string[] = [];
  
  try {
    const task = bubbleToTask(originalBubble);
    const convertedBubble = taskToBubble(task);
    
    // Check core field preservation
    if (originalBubble.id !== convertedBubble.id) {
      errors.push(`ID mismatch: ${originalBubble.id} → ${convertedBubble.id}`);
    }
    
    if (originalBubble.content !== convertedBubble.content) {
      errors.push(`Content mismatch: "${originalBubble.content}" → "${convertedBubble.content}"`);
    }
    
    // Note: Bubbles don't have completion state, so we skip this check
    
    // Check priority mapping within ±1
    const originalPriority = sizeToPriority(originalBubble.size);
    const convertedPriority = sizeToPriority(convertedBubble.size);
    if (Math.abs(originalPriority - convertedPriority) > 1) {
      errors.push(`Priority drift: ${originalPriority} → ${convertedPriority}`);
    }
    
    // Check tags preservation
    if (originalBubble.tags.length !== convertedBubble.tags.length) {
      errors.push(`Tag count mismatch: ${originalBubble.tags.length} → ${convertedBubble.tags.length}`);
    }
    
    // Check metadata preservation (lenient - structure may change but critical data preserved)
    if (originalBubble.metadata?.outliner && !convertedBubble.metadata?.outliner) {
      errors.push('Outliner metadata lost');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      task,
      convertedBubble
    };
    
  } catch (error) {
    return {
      isValid: false,
      errors: [`Round-trip failed: ${error}`],
      task: bubbleToTask(originalBubble), // Best effort
      convertedBubble: taskToBubble(bubbleToTask(originalBubble))
    };
  }
}