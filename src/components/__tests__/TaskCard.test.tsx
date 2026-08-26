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
} as unknown as Task;

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
      expect(issues).toContain('Missing task ID');
      expect(issues).toContain('Invalid title');
      expect(issues).toContain('Invalid priority value');
      expect(issues).toContain('Invalid tags format');
      // Completeness without pinning order: this fixture trips exactly these
      // four checks and no others, so a silently-dropped check can't hide.
      expect(issues).toHaveLength(4);
      
      expect(sanitized.title).toBe('[Corrupted Title]');
      expect(sanitized.priority).toBe(50);
      expect(Array.isArray(sanitized.tags)).toBe(true);
    });

    it('should surface a destructive toast naming the corruption issues', () => {
      render(<TaskCard {...mockProps} task={corruptedTask} />);

      // TaskCard renders no such copy as 'Corrupted task data detected' --
      // that string exists nowhere in the component. Its real, user-facing
      // corruption signal is the destructive toast fired by the validation
      // effect (TaskCard.tsx L284-295), so assert that contract instead of
      // text that was never implemented.
      expect(mockToastFn).toHaveBeenCalledTimes(1);
      expect(mockToastFn).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Task Data Issues',
          variant: 'destructive',
          description: expect.stringContaining('Missing task ID'),
        })
      );
    });

    it('should mark corrupted tasks in the DOM', () => {
      const { container } = render(<TaskCard {...mockProps} task={corruptedTask} />);

      // RESOLVED (was: a purely visual pulsing dot with no text, role or
      // accessible name). The indicator now carries role="img" plus a name, so
      // assistive tech announces the same thing sighted users see.
      const indicator = container.querySelector('.bg-destructive.rounded-full');
      expect(indicator).not.toBeNull();
      expect(indicator).toHaveAttribute('role', 'img');
      expect(indicator).toHaveAttribute('aria-label', 'Task data issues detected');
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
      
      await user.click(screen.getByRole('button', { name: /^Task:/ }));
      
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
      const card = screen.getByRole('button', { name: /^Task:/ });
      card.focus();
      await user.keyboard('e');
      
      expect(screen.getByDisplayValue('Test Task')).toBeInTheDocument();
    });

    it('should save changes when Ctrl+Enter is pressed in edit mode', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} />);
      
      // Enter edit mode
      const card = screen.getByRole('button', { name: /^Task:/ });
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
      const card = screen.getByRole('button', { name: /^Task:/ });
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
      
      const card = screen.getByRole('button', { name: /^Task:/ });
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
      
      const card = screen.getByRole('button', { name: /^Task:/ });
      card.focus();
      
      await user.keyboard('{Enter}');
      expect(mockProps.onSelect).toHaveBeenCalledWith('test-task-1');
      
      await user.keyboard(' ');
      expect(mockProps.onSelect).toHaveBeenCalledWith('test-task-1');
    });

    it('should delete task when Ctrl+Delete is pressed', async () => {
      const user = userEvent.setup();
      render(<TaskCard {...mockProps} />);
      
      const card = screen.getByRole('button', { name: /^Task:/ });
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
      
      const card = screen.getByRole('button', { name: /^Task:/ });
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('Task: Test Task'));
    });

    it('should have proper tabIndex for keyboard navigation', () => {
      render(<TaskCard {...mockProps} />);
      
      const card = screen.getByRole('button', { name: /^Task:/ });
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    // KNOWN-FAILING, DELIBERATELY NOT WORKED AROUND (Run 148).
    // Root cause proven, not inferred: `isSelected` is VISUAL ONLY. It drives
    // 'ring-2 ring-primary bg-primary/5' (TaskCard.tsx L658, L707) and nothing
    // else -- the component contains no aria-pressed, no aria-selected, no
    // aria-current, and its aria-label never varies with selection. A screen
    // reader user gets no indication at all that a card is selected.
    // RESOLVED via option (b), `aria-pressed={isSelected}`.
    // The three options were not equivalent:
    //   (a) append 'Selected.' to the aria-label -- works, but overloads the
    //       name with state, so the state is re-read on every re-announcement
    //       and cannot be queried as state by assistive tech;
    //   (b) aria-pressed -- the standard toggle semantic, VALID on
    //       role="button", announced as "pressed"/"not pressed"; chosen;
    //   (c) listbox/grid semantics with aria-selected -- INVALID on
    //       role="button" and a much larger restructure.
    // Both polarities are pinned so this cannot pass vacuously.
    it('should expose selection state to screen readers', () => {
      const { rerender } = render(<TaskCard {...mockProps} isSelected={true} />);

      expect(screen.getByRole('button', { name: /^Task:/ }))
        .toHaveAttribute('aria-pressed', 'true');

      rerender(<TaskCard {...mockProps} isSelected={false} />);
      expect(screen.getByRole('button', { name: /^Task:/ }))
        .toHaveAttribute('aria-pressed', 'false');
    });

    it('should have proper checkbox accessibility', () => {
      render(<TaskCard {...mockProps} />);
      
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-label', 'Mark task complete');
    });
  });

  describe('Performance & Edge Cases', () => {
    it('should handle undefined task gracefully', () => {
      render(<TaskCard {...mockProps} task={undefined as unknown as Task} />);
      
      // validateTask(undefined) doesn't throw (optional chaining), so it
      // never hits the catch block's '[Error Loading Task]' fallback -- it
      // sanitizes undefined the same way as any other corrupted, non-throwing
      // input and renders the sanitized placeholder title instead.
      expect(screen.getByText('[Corrupted Title]')).toBeInTheDocument();
    });

    it('should fall back to [Error Loading Task] when validation itself throws', () => {
      // Positive control for the branch the previous version of the test above
      // was reaching for. validateTask()'s catch block IS live -- it just needs
      // an input that throws while being *read*, not merely a missing one.
      // Verified reachable by 4 of 14 adversarial inputs (throwing id getter,
      // throwing title getter, Proxy with throwing ownKeys, tags array holding
      // a throwing element); a throwing getter is the minimal such case.
      const explosiveTask = {
        get id(): string { throw new Error('exploding getter'); },
      } as unknown as Task;

      expect(() =>
        render(<TaskCard {...mockProps} task={explosiveTask} />)
      ).not.toThrow();

      expect(screen.getByText('[Error Loading Task]')).toBeInTheDocument();
      expect(mockToastFn).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('Critical error'),
        })
      );
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
