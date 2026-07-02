/**
 * Comprehensive tests for Universal Bulletproof TaskCard
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TaskCard, TaskCardConfigs, validateTask } from '../TaskCard';
import type { Task } from '@/types/task';

// Mock dependencies
// The real useToast() hook returns a referentially-stable `toast` function
// across renders (it's a module-level const, not recreated per call).
// TaskCard's validation-warning effect depends on `toast` in its dependency
// array; a mock that calls vi.fn() fresh inside the factory breaks that
// stability and, combined with an unmemoized validateTask() call (see
// TaskCard.tsx), caused an infinite render loop -> indefinite test hang
// for any task with validation issues. Hoisting the mock fn fixes it.
const { mockToastFn } = vi.hoisted(() => ({ mockToastFn: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToastFn
  })
}));

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false
  })
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => ''
    }
  }
}));

// Test data
const mockTask: Task = {
  id: 'test-task-1',
  type: 'task',
  title: 'Test Task',
  description: 'Test description',
  completed: false,
  priority: 75,
  tags: [
    { id: 'tag1', name: 'urgent', emoji: '🔥', colorHex: '#ff4444' },
    { id: 'tag2', name: 'work', emoji: '💼' }
  ],
  createdAt: Date.now() - 86400000, // 1 day ago
  updatedAt: Date.now() - 3600000,  // 1 hour ago
  due: Date.now() + 86400000        // 1 day from now
};

const corruptedTask = {
  id: null,
  title: null,
  priority: 'invalid',
  tags: 'not-an-array',
  completed: 'maybe'
} as any;

describe('TaskCard Component', () => {
  const mockProps = {
    task: mockTask,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onSelect: vi.fn(),
    onKeyboardMove: vi.fn(),
    onComplete: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render task title and description', () => {
      render(<TaskCard {...mockProps} />);
      
      expect(screen.getByText('Test Task')).toBeInTheDocument();
      expect(screen.getByText('Test description')).toBeInTheDocument();
    });

    it('should render completion checkbox', () => {
      render(<TaskCard {...mockProps} />);
      
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    });

    it('should render priority badge for high priority tasks', () => {
      render(<TaskCard {...mockProps} />);
      
      expect(screen.getByText('75')).toBeInTheDocument();
    });

    it('should render due date', () => {
      render(<TaskCard {...mockProps} />);
      
      const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString();
      expect(screen.getByText(tomorrow)).toBeInTheDocument();
    });

    it('should render tags with emojis', () => {
      render(<TaskCard {...mockProps} />);
      
      expect(screen.getByText('🔥 urgent')).toBeInTheDocument();
      expect(screen.getByText('💼 work')).toBeInTheDocument();
    });
  });

  describe('Error Handling & Validation', () => {
    it('should validate and sanitize corrupted task data', () => {
      const { isValid, sanitized, issues } = validateTask(corruptedTask);
      
      expect(isValid).toBe(false);
      expect(issues).toContain('Missing or invalid ID');
      expect(issues).toContain('Missing or invalid title');
      expect(issues).toContain('Invalid priority value');
      expect(issues).toContain('Invalid tags format');
      
      expect(sanitized.title).toBe('[Corrupted Title]');
      expect(sanitized.priority).toBe(50);
      expect(Array.isArray(sanitized.tags)).toBe(true);
    });

    it('should render error state for corrupted tasks', () => {
      render(<TaskCard {...mockProps} task={corruptedTask} />);
      
      expect(screen.getByText(/Corrupted task data detected/)).toBeInTheDocument();
    });

    it('should handle missing optional properties gracefully', () => {
      const minimalTask: Task = {
        id: 'minimal-task',
        type: 'task',
        title: 'Minimal Task',
        completed: false,
        priority: 50,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      render(<TaskCard {...mockProps} task={minimalTask} />);
      
      expect(screen.getByText('Minimal Task')).toBeInTheDocument();
      expect(screen.queryByText(/priority/)).not.toBeInTheDocument(); // No priority badge for priority <= 50
    });
  });

  describe('Interaction Handling', () => {
    it('should call onSelect when clicked', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} viewConfig={{ view: 'universal', selectable: true }} />);
      
      await user.click(screen.getByRole('button'));
      
      expect(mockProps.onSelect).toHaveBeenCalledWith('test-task-1');
    });

    it('should toggle completion when checkbox is clicked', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} />);
      
      await user.click(screen.getByRole('checkbox'));
      
      expect(mockProps.onComplete).toHaveBeenCalledWith('test-task-1', true);
    });

    it('should enter edit mode when edit action is triggered', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} />);
      
      // Press 'e' key to enter edit mode
      const card = screen.getByRole('button');
      card.focus();
      await user.keyboard('e');
      
      expect(screen.getByDisplayValue('Test Task')).toBeInTheDocument();
    });

    it('should save changes when Ctrl+Enter is pressed in edit mode', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} />);
      
      // Enter edit mode
      const card = screen.getByRole('button');
      card.focus();
      await user.keyboard('e');
      
      // Modify title
      const titleInput = screen.getByDisplayValue('Test Task');
      await user.clear(titleInput);
      await user.type(titleInput, 'Updated Task');
      
      // Save with Ctrl+Enter
      await user.keyboard('{Control>}{Enter}{/Control}');
      
      await waitFor(() => {
        expect(mockProps.onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Updated Task'
          })
        );
      });
    });

    it('should cancel edit mode when Escape is pressed', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} />);
      
      // Enter edit mode
      const card = screen.getByRole('button');
      card.focus();
      await user.keyboard('e');
      
      expect(screen.getByDisplayValue('Test Task')).toBeInTheDocument();
      
      // Cancel with Escape
      await user.keyboard('{Escape}');
      
      expect(screen.queryByDisplayValue('Test Task')).not.toBeInTheDocument();
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should handle arrow key navigation', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} />);
      
      const card = screen.getByRole('button');
      card.focus();
      
      await user.keyboard('{ArrowUp}');
      expect(mockProps.onKeyboardMove).toHaveBeenCalledWith('test-task-1', 'up');
      
      await user.keyboard('{ArrowDown}');
      expect(mockProps.onKeyboardMove).toHaveBeenCalledWith('test-task-1', 'down');
      
      await user.keyboard('{ArrowLeft}');
      expect(mockProps.onKeyboardMove).toHaveBeenCalledWith('test-task-1', 'left');
      
      await user.keyboard('{ArrowRight}');
      expect(mockProps.onKeyboardMove).toHaveBeenCalledWith('test-task-1', 'right');
    });

    it('should select task when Enter or Space is pressed', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} />);
      
      const card = screen.getByRole('button');
      card.focus();
      
      await user.keyboard('{Enter}');
      expect(mockProps.onSelect).toHaveBeenCalledWith('test-task-1');
      
      await user.keyboard(' ');
      expect(mockProps.onSelect).toHaveBeenCalledWith('test-task-1');
    });

    it('should delete task when Ctrl+Delete is pressed', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} />);
      
      const card = screen.getByRole('button');
      card.focus();
      
      await user.keyboard('{Control>}{Delete}{/Control}');
      expect(mockProps.onDelete).toHaveBeenCalledWith('test-task-1');
    });
  });

  describe('View Configurations', () => {
    it('should render drag handle for kanban view', () => {
      render(<TaskCard {...mockProps} viewConfig={TaskCardConfigs.kanban} />);
      
      expect(screen.getByLabelText('Drag to reorder task')).toBeInTheDocument();
    });

    it('should not render drag handle for list view', () => {
      render(<TaskCard {...mockProps} viewConfig={TaskCardConfigs.list} />);
      
      expect(screen.queryByLabelText('Drag to reorder task')).not.toBeInTheDocument();
    });

    it('should render compact mode for atomic view', () => {
      render(<TaskCard {...mockProps} viewConfig={TaskCardConfigs.atomic} />);
      
      // Should not show actions menu in atomic view
      expect(screen.queryByLabelText('Task options')).not.toBeInTheDocument();
    });

    it('should hide metadata for bubble view', () => {
      render(<TaskCard {...mockProps} viewConfig={TaskCardConfigs.bubble} />);
      
      // Should not show priority badge or due date
      expect(screen.queryByText('75')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<TaskCard {...mockProps} />);
      
      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('Task: Test Task'));
    });

    it('should have proper tabIndex for keyboard navigation', () => {
      render(<TaskCard {...mockProps} />);
      
      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('should provide context for screen readers when selected', () => {
      render(<TaskCard {...mockProps} isSelected={true} />);
      
      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('Selected.'));
    });

    it('should have proper checkbox accessibility', () => {
      render(<TaskCard {...mockProps} />);
      
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-label', 'Mark task complete');
    });
  });

  describe('Performance & Edge Cases', () => {
    it('should handle undefined task gracefully', () => {
      render(<TaskCard {...mockProps} task={undefined as any} />);
      
      expect(screen.getByText(/Error Loading Task/)).toBeInTheDocument();
    });

    it('should handle very long titles', () => {
      const longTitleTask = {
        ...mockTask,
        title: 'A'.repeat(200)
      };
      
      render(<TaskCard {...mockProps} task={longTitleTask} />);
      
      // Should truncate long titles
      const titleElement = screen.getByText(longTitleTask.title);
      expect(titleElement).toHaveClass('truncate');
    });

    it('should handle many tags gracefully', () => {
      const manyTagsTask = {
        ...mockTask,
        tags: Array.from({ length: 10 }, (_, i) => ({
          id: `tag-${i}`,
          name: `Tag ${i}`,
          emoji: '🏷️'
        }))
      };
      
      render(<TaskCard {...mockProps} task={manyTagsTask} />);
      
      // Should show +8 for remaining tags (shows first 2)
      expect(screen.getByText('+8')).toBeInTheDocument();
    });

    it('should handle invalid dates gracefully', () => {
      const invalidDateTask = {
        ...mockTask,
        due: NaN
      };
      
      render(<TaskCard {...mockProps} task={invalidDateTask} />);
      
      expect(screen.queryByText('[Invalid Date]')).not.toBeInTheDocument();
    });
  });
});