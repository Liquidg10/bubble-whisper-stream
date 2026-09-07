import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { taskRelationshipTraceKey } from '../relationshipLabels';
import { AtomicRelationshipPanel } from '../AtomicRelationshipPanel';
import { AtomicRenderer } from '../AtomicRendererUnified';
import { taskToBubble } from '@/adapters/taskAdapter';
import { createTask, type Task, type TaskRelationship } from '@/types/task';
import { createUserDomainLink } from '@/domain/lifeDomains';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const task = (id: string, updates: Partial<Task> = {}): Task => ({ ...createTask(id), id, ...updates });
const relationship = (kind: TaskRelationship['kind'] = 'depends-on'): TaskRelationship => ({
  id: 'connection', targetTaskId: 'target', kind, userConfirmed: true, source: 'user', reason: 'Our chosen connection.',
});

describe('Atomic relationship projections', () => {
  it('keeps imported relationship ids distinct by their actual endpoints and kinds', () => {
    const source = task('source');
    const target = task('target');
    const other = task('other');
    const base = { source, target, relationship: relationship() };
    expect(new Set([taskRelationshipTraceKey(base), taskRelationshipTraceKey({ ...base, target: other, relationship: { ...base.relationship, targetTaskId: other.id } }), taskRelationshipTraceKey({ ...base, relationship: { ...base.relationship, kind: 'supports' } })]).size).toBe(3);
  });
  it('counts current completed support and tradeoffs once per canonical action and removes them on reopening', () => {
    const source = task('source', { title: 'One action', completed: true, domainLinks: [createUserDomainLink('Career'),
      createUserDomainLink('Home', { effect: 'tradeoff' })] });
    const props = { onOpenTask: vi.fn(), onTrace: vi.fn(), canTrace: () => false };
    const { rerender, container } = render(<AtomicRelationshipPanel tasks={[source, source]} {...props} />);
    fireEvent.click(screen.getByText('Completed work across your life'));
    const career = container.querySelector('[data-contribution-area="career"]') as HTMLElement;
    const home = container.querySelector('[data-contribution-area="home"]') as HTMLElement;
    expect(career).toHaveTextContent('1 supporting action · 0 tradeoffs');
    expect(home).toHaveTextContent('0 supporting actions · 1 tradeoff');
    fireEvent.click(within(career).getByRole('button', { name: 'One action · Support' }));
    expect(props.onOpenTask).toHaveBeenCalledWith('source');
    rerender(<AtomicRelationshipPanel tasks={[{ ...source, completed: false }]} {...props} />);
    expect(screen.queryByText('Completed work across your life')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Completed contributions by life area' })).not.toBeInTheDocument();
  });

  it('shows dependency completion, offers each canonical task, and keeps unlinked tasks accessible without a trace button', () => {
    const source = task('source', { title: 'Present', relationships: [relationship()] });
    const target = task('target', { title: 'Prepare' });
    const onOpenTask = vi.fn();
    const props = { onOpenTask, onTrace: vi.fn(), canTrace: () => false };
    const { rerender } = render(<AtomicRelationshipPanel tasks={[source, target]} {...props} />);
    fireEvent.click(screen.getByText('Task relationships (1)'));
    const list = screen.getByRole('list', { name: 'Confirmed task relationships' });
    expect(list).toHaveTextContent('Present depends on Prepare');
    expect(list).toHaveTextContent('0 of 1 prerequisites complete.');
    expect(within(list).queryByRole('button', { name: /Trace connection/ })).not.toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: 'Open connected task' }));
    expect(onOpenTask).toHaveBeenCalledWith('target');
    rerender(<AtomicRelationshipPanel tasks={[source, { ...target, completed: true }]} {...props} />);
    expect(screen.getByRole('list', { name: 'Confirmed task relationships' })).toHaveTextContent('Prerequisites complete — ready when you are.');
  });

  it('does not promote pending or malformed links into typed relationship claims', () => {
    const source = task('source', { relationships: [{ ...relationship(), userConfirmed: false },
      { ...relationship('supports'), id: 'future', kind: 'future' as TaskRelationship['kind'] }] });
    render(<AtomicRelationshipPanel tasks={[source, task('target')]} onOpenTask={vi.fn()} onTrace={vi.fn()} canTrace={() => true} />);
    expect(screen.queryByText(/Task relationships/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Trace connection/ })).not.toBeInTheDocument();
  });
});

describe('Atomic typed traces and completed nuclei', () => {
  beforeEach(() => {
    vi.mocked(window.matchMedia).mockImplementation(query => ({ matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
      right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) } as DOMRect);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['supports', 'depends-on', 'tradeoff'] as const)('traces a %s relationship with a typed line and returns keyboard focus on clear', async kind => {
    const source = task('source', { title: 'Present', relationships: [relationship(kind)], domainLinks: [createUserDomainLink('Career')] });
    const target = task('target', { title: 'Prepare', domainLinks: [createUserDomainLink('Home')] });
    const bubbles = [source, target].map(taskToBubble);
    const before = JSON.stringify(bubbles);
    const onTimeHorizonUpdate = vi.fn();
    const onBubbleSelect = vi.fn();
    render(<AtomicRenderer bubbles={bubbles} onTimeHorizonUpdate={onTimeHorizonUpdate} onBubbleSelect={onBubbleSelect} reducedMotion />);
    await screen.findByRole('button', { name: /Career molecule/ });
    fireEvent.click(screen.getByText('Connections (1)'));
    fireEvent.click(screen.getByText('Task relationships (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Trace connection from Present to Prepare' }));
    const trace = screen.getByTestId('atomic-task-relationship-trace');
    expect(trace).toHaveAttribute('data-relationship-kind', kind);
    const path = trace.querySelector('path')!;
    expect(path.getAttribute('d')).toMatch(/^M [-\d.]+ [-\d.]+ Q /);
    if (kind === 'supports') expect(path).not.toHaveAttribute('stroke-dasharray');
    else expect(path).toHaveAttribute('stroke-dasharray');
    expect(trace.querySelectorAll('circle')).toHaveLength(2);
    expect(screen.getByTestId('atomic-task-trace-status')).toHaveTextContent(kind === 'supports' ? 'Present helps Prepare'
      : kind === 'depends-on' ? 'Present depends on Prepare' : 'Present has a tradeoff with Prepare');
    const clear = screen.getByRole('button', { name: 'Clear task connection trace' });
    expect(clear).toHaveFocus();
    fireEvent.click(clear);
    expect(screen.queryByTestId('atomic-task-relationship-trace')).not.toBeInTheDocument();
    expect(screen.getByText('Connections (1)')).toHaveFocus();
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
    expect(onBubbleSelect).not.toHaveBeenCalled();
    expect(JSON.stringify(bubbles)).toBe(before);
  });

  it('clears a typed trace after the underlying confirmed relationship is removed', async () => {
    const source = task('source', { title: 'Present', relationships: [relationship()], domainLinks: [createUserDomainLink('Career')] });
    const target = task('target', { title: 'Prepare', domainLinks: [createUserDomainLink('Home')] });
    const { rerender } = render(<AtomicRenderer bubbles={[source, target].map(taskToBubble)} reducedMotion />);
    await screen.findByRole('button', { name: /Career molecule/ });
    fireEvent.click(screen.getByText('Connections (1)'));
    fireEvent.click(screen.getByText('Task relationships (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Trace connection from Present to Prepare' }));
    expect(screen.getByTestId('atomic-task-relationship-trace')).toBeInTheDocument();
    rerender(<AtomicRenderer bubbles={[{ ...source, relationships: [] }, target].map(taskToBubble)} reducedMotion />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear task connection trace' })).not.toBeInTheDocument());
    expect(screen.queryByTestId('atomic-task-relationship-trace')).not.toBeInTheDocument();
    expect(screen.getByText('Task connection trace cleared because the connection changed.')).toBeInTheDocument();
  });

  it('updates completed contribution badges and accessible nucleus descriptions after reopening', async () => {
    const source = task('source', { title: 'A finished action', completed: true, domainLinks: [createUserDomainLink('Career'),
      createUserDomainLink('Home', { effect: 'tradeoff' })] });
    const { rerender, container } = render(<AtomicRenderer bubbles={[taskToBubble(source)]} reducedMotion />);
    expect(await screen.findByRole('button', { name: /Career molecule.*1 completed supporting actions, 0 completed tradeoffs/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Home molecule.*0 completed supporting actions, 1 completed tradeoffs/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-completed-area]')).toHaveLength(2);
    rerender(<AtomicRenderer bubbles={[taskToBubble({ ...source, completed: false })]} reducedMotion />);
    await waitFor(() => expect(container.querySelectorAll('[data-completed-area]')).toHaveLength(0));
    expect(screen.getByRole('button', { name: /Career molecule/ }).getAttribute('aria-label')).not.toContain('completed supporting actions');
  });

  it('keeps an unknown effect reviewable without labeling it as support in shared thought connections', async () => {
    const source = task('thought', { title: 'An idea across my life', type: 'thought', domainLinks: [createUserDomainLink('Career'),
      { ...createUserDomainLink('Home'), effect: 'future' as Task['domainLinks'][number]['effect'] }] });
    render(<AtomicRenderer bubbles={[taskToBubble(source)]} reducedMotion />);
    await screen.findByRole('button', { name: /Career molecule/ });
    fireEvent.click(screen.getByText('Connections (1)'));
    const areas = screen.getByRole('list', { name: 'Life areas for An idea across my life' });
    expect(within(areas).getAllByText('Supports')).toHaveLength(1);
    expect(within(areas).getByText('Needs review')).toBeVisible();
    expect(screen.queryByText('Completed work across your life')).not.toBeInTheDocument();
  });
});
