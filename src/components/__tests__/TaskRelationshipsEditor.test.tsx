import { useState } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedTaskConnections, TaskRelationshipsEditor } from '@/components/TaskRelationshipsEditor';
import { useTaskStore } from '@/stores/taskStore';
import { createTask, type Task, type TaskRelationship } from '@/types/task';
import { createUserDomainLink } from '@/domain/lifeDomains';

const task = (id: string, updates: Partial<Task> = {}): Task => ({ ...createTask(id), id, ...updates });
const link = (targetTaskId: string, updates: Partial<TaskRelationship> = {}): TaskRelationship => ({
  id: `link-${targetTaskId}`, targetTaskId, kind: 'depends-on', userConfirmed: true, source: 'user', ...updates,
});

function Harness({ initial, onChange = vi.fn() }: { initial: Task; onChange?: (relationships: TaskRelationship[]) => void }) {
  const [current, setCurrent] = useState(initial);
  return <TaskRelationshipsEditor task={current} onChange={relationships => {
    setCurrent(value => ({ ...value, relationships }));
    onChange(relationships);
  }} />;
}

describe('TaskRelationshipsEditor', () => {
  beforeEach(() => useTaskStore.setState({ tasks: [] }));

  it('creates a reviewed prerequisite, preserves the canonical task, and offers removal plus Undo', async () => {
    const user = userEvent.setup();
    const source = task('present', { title: 'Present the idea' });
    const prerequisite = task('prepare', { title: 'Prepare the notes' });
    const onChange = vi.fn();
    useTaskStore.setState({ tasks: [source, prerequisite] });
    render(<Harness initial={source} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Connect another task' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Connected task' }), 'prepare');
    await user.type(screen.getByRole('textbox', { name: 'What does this connection mean? (optional)' }), 'I need the notes first.');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ targetTaskId: 'prepare', kind: 'depends-on', userConfirmed: true, reason: 'I need the notes first.' })]);
    expect(useTaskStore.getState().tasks).toEqual([source, prerequisite]);
    expect(screen.getByRole('status')).toHaveTextContent('Connection added to your changes');
    await user.click(screen.getByRole('button', { name: 'Remove depends on Prepare the notes' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    await user.click(screen.getByRole('button', { name: 'Undo connection change' }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ targetTaskId: 'prepare' })]);
  });

  it('cancels a draft without creating an edge and distinguishes duplicate titles', async () => {
    const user = userEvent.setup();
    const source = task('source');
    const onChange = vi.fn();
    useTaskStore.setState({ tasks: [source, task('one', { title: 'Same title' }), task('two', { title: 'Same title' }), task('reference', { actionability: 'reference' })] });
    render(<Harness initial={source} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Connect another task' }));
    expect(screen.getByRole('option', { name: 'Same title (task 1 of 2)' })).toHaveValue('one');
    expect(screen.getByRole('option', { name: 'Same title (task 2 of 2)' })).toHaveValue('two');
    expect(screen.queryByRole('option', { name: 'reference' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Connected task' }), 'two');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects a dependency cycle without writing or hiding the review form', async () => {
    const user = userEvent.setup();
    const source = task('source');
    const target = task('target', { relationships: [link('source')] });
    const onChange = vi.fn();
    useTaskStore.setState({ tasks: [source, target] });
    render(<Harness initial={source} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Connect another task' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Connected task' }), 'target');
    await user.click(screen.getByRole('button', { name: 'Add connection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('loop of prerequisites');
    expect(screen.getByRole('combobox', { name: 'Connected task' })).toHaveValue('target');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('derives incoming relationships and opens their source without editing a second record', async () => {
    const user = userEvent.setup();
    const source = task('source', { title: 'Prepare', relationships: [link('target', { kind: 'supports', reason: 'The notes help.' })] });
    const target = task('target');
    const onChange = vi.fn();
    const onOpenTask = vi.fn();
    useTaskStore.setState({ tasks: [source, target] });
    render(<TaskRelationshipsEditor task={target} onChange={onChange} onOpenTask={onOpenTask} />);
    const incoming = screen.getByRole('list', { name: 'Connections to this task' });
    expect(incoming).toHaveTextContent('Helped by Prepare');
    expect(within(incoming).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    await user.click(within(incoming).getByRole('button', { name: 'Open source task' }));
    expect(onOpenTask).toHaveBeenCalledWith('source');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('requires strict confirmation and retains future entries through confirm, remove, and Undo', async () => {
    const user = userEvent.setup();
    const pending = { ...link('target', { userConfirmed: 1 as unknown as boolean, suggestionReason: 'A reviewed local possibility.' }),
      futureReview: { preserved: true } };
    const unknown = [null, 'future data', ['future tuple']] as unknown as TaskRelationship[];
    const source = task('source', { relationships: [...unknown, pending] });
    const onChange = vi.fn();
    useTaskStore.setState({ tasks: [source, task('target')] });
    render(<Harness initial={source} onChange={onChange} />);
    expect(screen.getByText('Suggested connection — awaiting your review')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirm connection' }));
    expect(onChange).toHaveBeenLastCalledWith([...unknown, expect.objectContaining({ id: pending.id, userConfirmed: true,
      suggestionReason: pending.suggestionReason, futureReview: pending.futureReview })]);
    await user.click(screen.getByRole('button', { name: 'Remove depends on target' }));
    expect(onChange).toHaveBeenLastCalledWith(unknown);
    await user.click(screen.getByRole('button', { name: 'Undo connection change' }));
    expect(onChange).toHaveBeenLastCalledWith([...unknown, expect.objectContaining({ id: pending.id, userConfirmed: true })]);
  });

  it('keeps a missing prerequisite reviewable and does not offer confirmation for an unknown relationship kind', () => {
    const source = task('source', { relationships: [link('missing'), link('target', { id: 'future', kind: 'future' as TaskRelationship['kind'], userConfirmed: false })] });
    useTaskStore.setState({ tasks: [source, task('target')] });
    render(<Harness initial={source} />);
    expect(screen.getByText('This connection needs review; its task is unavailable.')).toBeVisible();
    expect(screen.getByText('Unrecognized connection')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirm connection' })).not.toBeInTheDocument();
  });

  it('confirms only the chosen imported row when distinct targets share a relationship ID', async () => {
    const user = userEvent.setup();
    const first = link('first', { id: 'duplicate-imported-id', userConfirmed: false });
    const second = link('second', { id: 'duplicate-imported-id', userConfirmed: false, suggestionReason: 'Preserve this separate suggestion.' });
    const source = task('source', { relationships: [first, second] });
    const onChange = vi.fn();
    useTaskStore.setState({ tasks: [source, task('first', { title: 'First action' }), task('second', { title: 'Second action' })] });
    render(<Harness initial={source} onChange={onChange} />);
    const rows = within(screen.getByRole('list', { name: 'Connections from this task' })).getAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: 'Confirm connection' }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: first.id, targetTaskId: 'first', userConfirmed: true }), second]);
    const savedRows = within(screen.getByRole('list', { name: 'Connections from this task' })).getAllByRole('listitem');
    expect(within(savedRows[0]).queryByRole('button', { name: 'Confirm connection' })).not.toBeInTheDocument();
    expect(within(savedRows[1]).getByRole('button', { name: 'Confirm connection' })).toBeVisible();
    expect(onChange.mock.lastCall?.[0][1]).toBe(second);
  });

  it('removes only the chosen imported row when distinct targets share a relationship ID', async () => {
    const user = userEvent.setup();
    const first = link('first', { id: 'duplicate-imported-id' });
    const second = link('second', { id: 'duplicate-imported-id', reason: 'Keep the other prerequisite.' });
    const source = task('source', { relationships: [first, second] });
    const onChange = vi.fn();
    useTaskStore.setState({ tasks: [source, task('first', { title: 'First action' }), task('second', { title: 'Second action' })] });
    render(<Harness initial={source} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Remove depends on First action' }));
    expect(onChange).toHaveBeenLastCalledWith([second]);
    expect(onChange.mock.lastCall?.[0][0]).toBe(second);
    expect(screen.getByRole('list', { name: 'Connections from this task' })).toHaveTextContent('Second action');
    await user.click(screen.getByRole('button', { name: 'Undo connection change' }));
    expect(onChange).toHaveBeenLastCalledWith([first, second]);
  });
});

describe('SavedTaskConnections', () => {
  beforeEach(() => useTaskStore.setState({ tasks: [] }));

  it('updates prerequisite readiness after saved completion and reopening', () => {
    const source = task('source', { relationships: [link('prepare')] });
    const prepare = task('prepare', { title: 'Prepare the notes' });
    useTaskStore.setState({ tasks: [source, prepare] });
    render(<SavedTaskConnections taskId="source" />);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting on 1 prerequisite');
    act(() => useTaskStore.setState({ tasks: [source, { ...prepare, completed: true }] }));
    expect(screen.getByRole('status')).toHaveTextContent('Ready: your prerequisites are complete');
    act(() => useTaskStore.setState({ tasks: [source, prepare] }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting on 1 prerequisite');
    expect(source.completed).toBe(false);
  });

  it('shows saved support and tradeoff separately, removing contributions when reopened', () => {
    const source = task('source', { domainLinks: [createUserDomainLink('Career'), createUserDomainLink('Home', { effect: 'tradeoff' })] });
    useTaskStore.setState({ tasks: [source] });
    render(<SavedTaskConnections taskId="source" />);
    expect(screen.queryByRole('status', { name: 'Completed work connections' })).not.toBeInTheDocument();
    act(() => useTaskStore.setState({ tasks: [{ ...source, completed: true }] }));
    const contribution = screen.getByRole('status', { name: 'Completed work connections' });
    expect(contribution).toHaveTextContent('Career · Support you noted');
    expect(contribution).toHaveTextContent('Home · Tradeoff you noted');
    act(() => useTaskStore.setState({ tasks: [source] }));
    expect(screen.queryByRole('status', { name: 'Completed work connections' })).not.toBeInTheDocument();
  });

  it('uses saved state while the adjacent editor has unpersisted completion or relationship changes', () => {
    const source = task('source', { domainLinks: [createUserDomainLink('Career')] });
    useTaskStore.setState({ tasks: [source, task('prepare')] });
    render(<><TaskRelationshipsEditor task={{ ...source, completed: true, relationships: [link('prepare')] }} onChange={vi.fn()} /><SavedTaskConnections taskId="source" /></>);
    expect(screen.queryByTestId('saved-task-connections')).not.toBeInTheDocument();
  });

  it('keeps missing prerequisites unresolved and hides unconfirmed or reference contributions', () => {
    const source = task('source', { completed: true, relationships: [link('missing')], domainLinks: [{ ...createUserDomainLink('Home'), userConfirmed: false }] });
    useTaskStore.setState({ tasks: [source] });
    const { rerender } = render(<SavedTaskConnections taskId="source" />);
    expect(screen.getByRole('status')).toHaveTextContent('A prerequisite needs review');
    expect(screen.getByRole('list', { name: 'Task prerequisites' })).toHaveTextContent('Unavailable prerequisite · Needs review');
    expect(screen.queryByRole('status', { name: 'Completed work connections' })).not.toBeInTheDocument();
    act(() => useTaskStore.setState({ tasks: [{ ...source, actionability: 'reference' }] }));
    rerender(<SavedTaskConnections taskId="source" />);
    expect(screen.queryByTestId('saved-task-connections')).not.toBeInTheDocument();
  });
});
