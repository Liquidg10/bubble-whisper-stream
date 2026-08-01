import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LifeConnectionsEditor } from '@/components/LifeConnectionsEditor';
import type { Task, TaskDomainLink } from '@/types/task';

const task: Task = {
  id: 'task-1',
  type: 'task',
  title: 'Walk with my family',
  completed: false,
  priority: 50,
  tags: [],
  createdAt: 1,
  updatedAt: 1,
};

function Harness({
  initialLinks = [],
  onChange = vi.fn(),
}: {
  initialLinks?: TaskDomainLink[];
  onChange?: (links: TaskDomainLink[]) => void;
}) {
  const [links, setLinks] = useState(initialLinks);
  return (
    <LifeConnectionsEditor
      task={task}
      links={links}
      onChange={(nextLinks) => {
        setLinks(nextLinks);
        onChange(nextLinks);
      }}
    />
  );
}

describe('LifeConnectionsEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps local hypotheses hidden until explicitly requested', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByText('Possible connection: Physical health')).not.toBeInTheDocument();
    const suggest = screen.getByRole('button', { name: 'Suggest connections' });
    expect(suggest).toHaveClass('h-11');

    await user.click(suggest);

    expect(screen.getByText('Possible connection: Physical health')).toBeVisible();
    expect(screen.getByText('Possible connection: Family')).toBeVisible();
  });

  it('confirms one suggestion, announces it, and offers a visible undo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Suggest connections' }));
    await user.click(screen.getByRole('button', { name: 'Link to Physical health' }));

    expect(screen.getByRole('list', { name: 'Confirmed life connections' })).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        domainId: 'physical-health',
        userConfirmed: true,
        source: 'rule',
      }),
    ]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Linked this task to Physical health. Undo available.',
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo linking Physical health' })).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Undo linking Physical health' }));
    expect(screen.queryByRole('list', { name: 'Confirmed life connections' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Undid the last Life Connections change.');
  });

  it('dismisses a proposal without mutating the canonical links', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Suggest connections' }));
    await user.click(screen.getByRole('button', { name: /Not this time.*Physical health/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Possible connection: Physical health')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Dismissed the Physical health suggestion. The task was not changed.',
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Link to Family' })).toHaveFocus();
    });
  });

  it('supports an offline manual connection and prevents duplicates', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Add your own connection' });
    await user.type(input, 'Creative practice');
    await user.click(screen.getByRole('button', { name: 'Add connection' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        domainId: 'creative-practice',
        source: 'user',
        userConfirmed: true,
      }),
    ]);

    await user.type(input, 'Creative practice');
    await user.click(screen.getByRole('button', { name: 'Add connection' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Creative practice is already connected to this task.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Creative practice is already connected to this task.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('edits and removes a confirmed connection with explicit accessible controls', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness
      initialLinks={[{
        id: 'link-1',
        domainId: 'family',
        label: 'Family',
        userConfirmed: true,
        source: 'user',
        strength: 'primary',
      }]}
      onChange={onChange}
    />);

    const name = screen.getByRole('textbox', { name: 'Connection name for Family' });
    await user.clear(name);
    await user.type(name, 'Chosen family');
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ label: 'Chosen family', domainId: 'family' }),
    ]);
    expect(screen.getByRole('button', { name: 'Remove Chosen family' })).toHaveClass('min-h-11');

    await user.click(screen.getByRole('button', { name: 'Remove Chosen family' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo removing Chosen family' })).toHaveFocus();
    });
  });

  it('cancels an inline edit on Escape without committing it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const parentEscape = vi.fn();
    render(
      <div onKeyDown={event => {
        if (event.key === 'Escape') parentEscape();
      }}>
        <Harness
          initialLinks={[{
            id: 'link-1',
            domainId: 'family',
            label: 'Family',
            userConfirmed: true,
            source: 'user',
          }]}
          onChange={onChange}
        />
      </div>,
    );

    const name = screen.getByRole('textbox', { name: 'Connection name for Family' });
    await user.clear(name);
    await user.type(name, 'Something else');
    await user.keyboard('{Escape}');

    expect(name).toHaveValue('Family');
    expect(name).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    expect(parentEscape).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(parentEscape).toHaveBeenCalledTimes(1);
  });

  it('resets drafts and undo when the task identity changes', async () => {
    const user = userEvent.setup();
    const onTaskAChange = vi.fn();
    const onTaskBChange = vi.fn();
    const { rerender } = render(
      <LifeConnectionsEditor task={task} links={[]} onChange={onTaskAChange} />,
    );

    const add = screen.getByRole('textbox', { name: 'Add your own connection' });
    await user.type(add, 'Creativity');
    await user.click(screen.getByRole('button', { name: 'Add connection' }));
    expect(screen.getByRole('button', { name: 'Undo linking Creativity' })).toBeVisible();

    rerender(
      <LifeConnectionsEditor
        task={{ ...task, id: 'task-2', title: 'A different task' }}
        links={[]}
        onChange={onTaskBChange}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Undo linking Creativity' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Add your own connection' })).toHaveValue('');
    expect(onTaskBChange).not.toHaveBeenCalled();
  });
});
