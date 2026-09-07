import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LifeConnectionsEditor } from '@/components/LifeConnectionsEditor';
import { createUserDomainLink } from '@/domain/lifeDomains';
import { useTaskStore } from '@/stores/taskStore';
import { createTask, type Task, type TaskDomainLink } from '@/types/task';

const task: Task = { ...createTask('An action'), id: 'source' };
function Harness({ initial, onChange = vi.fn() }: { initial: TaskDomainLink[]; onChange?: (links: TaskDomainLink[]) => void }) {
  const [links, setLinks] = useState(initial);
  return <LifeConnectionsEditor task={task} links={links} onChange={next => { setLinks(next); onChange(next); }} />;
}

describe('LifeConnectionsEditor effects', () => {
  beforeEach(() => useTaskStore.setState({ tasks: [] }));

  it('keeps legacy support as the default and lets the user record a tradeoff without changing the area ID', async () => {
    const user = userEvent.setup();
    const original = { ...createUserDomainLink('Home', { strength: 'secondary' }), domainId: 'custom_home' };
    const onChange = vi.fn();
    render(<Harness initial={[original]} onChange={onChange} />);
    const control = screen.getByRole('combobox', { name: 'How this connects to Home' });
    expect(control).toHaveValue('supports');
    expect(onChange).not.toHaveBeenCalled();
    await user.selectOptions(control, 'tradeoff');
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: original.id, domainId: 'custom_home', strength: 'secondary', effect: 'tradeoff' })]);
    expect(screen.getByRole('textbox', { name: 'Why Home matters (optional)' })).toHaveAttribute('placeholder', 'What is the tradeoff for Home?');
    await user.click(screen.getByRole('button', { name: 'Undo updating Home' }));
    expect(onChange).toHaveBeenLastCalledWith([original]);
    expect(control).toHaveValue('supports');
  });

  it('shows an understood pending tradeoff before explicit confirmation and preserves its grounding', async () => {
    const user = userEvent.setup();
    const pending = { ...createUserDomainLink('Home', { effect: 'tradeoff' }), userConfirmed: false, source: 'import' as const,
      suggestionReason: 'An imported possibility for your review.' };
    const onChange = vi.fn();
    render(<Harness initial={[pending]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Suggest connections' }));
    expect(screen.getByText('Suggested as a tradeoff for this area.')).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Link to Home' }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: pending.id, effect: 'tradeoff', userConfirmed: true,
      suggestionReason: pending.suggestionReason })]);
    expect(screen.getByRole('combobox', { name: 'How this connects to Home' })).toHaveValue('tradeoff');
  });

  it('requires an explicit effect choice for an unknown future pending effect', async () => {
    const user = userEvent.setup();
    const pending = { ...createUserDomainLink('Home'), userConfirmed: false, effect: 'future' as TaskDomainLink['effect'] };
    const onChange = vi.fn();
    render(<Harness initial={[pending]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Suggest connections' }));
    const confirm = screen.getByRole('button', { name: 'Link to Home' });
    expect(confirm).toBeDisabled();
    const review = screen.getByRole('combobox', { name: 'Choose how this connects to Home' });
    expect(review).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
    await user.selectOptions(review, 'tradeoff');
    await user.click(confirm);
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: pending.id, effect: 'tradeoff', userConfirmed: true })]);
  });

  it('does not display an unknown confirmed effect as support before the user chooses', () => {
    const original = { ...createUserDomainLink('Home'), effect: 'future' as TaskDomainLink['effect'] };
    const onChange = vi.fn();
    render(<Harness initial={[original]} onChange={onChange} />);
    expect(screen.getByRole('combobox', { name: 'How this connects to Home' })).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
  });
});
