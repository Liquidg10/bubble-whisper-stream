import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingDataWizard } from '@/components/OnboardingDataWizard';

const addBubble = vi.fn();

vi.mock('@/stores/bubbleStore', () => ({
  useBubbleStore: () => ({ addBubble }),
}));

vi.mock('@/services/selfModelV2Service', () => ({
  selfModelV2Service: {
    updateSelfModel: vi.fn(),
  },
}));

describe('OnboardingDataWizard accessibility', () => {
  beforeEach(() => {
    addBubble.mockReset();
  });

  const renderWizard = () => render(
    <OnboardingDataWizard
      isOpen
      onClose={vi.fn()}
      onComplete={vi.fn()}
    />,
  );

  it('announces every step while preserving keyboard progression', async () => {
    const user = userEvent.setup();
    renderWizard();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Step 1 of 5: Welcome',
    );

    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Step 2 of 5: Basic Info',
      );
    });
    expect(next).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Step 3 of 5: Daily Routine',
      );
    });
  });

  it('gives added routine fields stable visible labels', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Add Routine' }));

    expect(screen.getByRole('textbox', { name: 'Routine 1' })).toBeVisible();
    expect(screen.getByRole('textbox', {
      name: 'Time for routine 1 (optional)',
    })).toBeVisible();
  });

  it('exposes communication style as one responsive radio group', async () => {
    const user = userEvent.setup();
    renderWizard();

    for (let step = 0; step < 4; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }

    const group = screen.getByRole('radiogroup', {
      name: 'How do you prefer encouragement and reminders?',
    });
    expect(group).toHaveClass('grid-cols-1', 'sm:grid-cols-2');

    const selected = screen.getByRole('radio', {
      name: 'Warm and supportive',
    });
    const unselected = screen.getByRole('radio', {
      name: 'Motivating and encouraging',
    });

    await user.click(selected);
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(unselected).toHaveAttribute('aria-checked', 'false');
    expect(selected.querySelector('span')).toHaveClass(
      'whitespace-normal',
      'break-words',
    );
  });
});
