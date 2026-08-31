import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GlimmerNotifications } from '../GlimmerNotifications';

const { state, service } = vi.hoisted(() => ({
  state: {
    glimmers: [{ id: 'saved-notice', tone: 'supportive', message: 'A saved message', createdAt: 1, dismissed: false }],
    settings: { intelligenceEnabled: true, glimmersEnabled: true },
    bubbles: [], reminders: [], addGlimmer: vi.fn(), dismissGlimmer: vi.fn(),
  },
  service: { shouldTriggerGlimmer: vi.fn(), generateGlimmer: vi.fn() },
}));
vi.mock('@/stores/bubbleStore', () => ({ useBubbleStore: () => state }));
vi.mock('@/services/glimmerService', () => ({ glimmerService: service }));
vi.mock('@/components/GlimmerCard', () => ({
  GlimmerCard: ({ glimmer }: { glimmer: { message: string } }) => <p>{glimmer.message}</p>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.settings.intelligenceEnabled = true;
  state.settings.glimmersEnabled = true;
  service.shouldTriggerGlimmer.mockResolvedValue(false);
  state.dismissGlimmer.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('saved Glimmer flow placement', () => {
  it('keeps an existing message visible without a fixed overlay or a new generation', async () => {
    render(<GlimmerNotifications />);
    expect(await screen.findByText('A saved message')).toBeInTheDocument();
    const notice = screen.getByTestId('saved-assistant-message');
    expect(notice.className).not.toMatch(/\b(?:fixed|absolute|z-\d+)\b/);
    expect(notice).toHaveClass('w-full', 'max-w-sm');
    expect(service.generateGlimmer).not.toHaveBeenCalled();
    expect(state.dismissGlimmer).not.toHaveBeenCalled();
  });

  it('keeps the existing saved-message dismissal action', async () => {
    render(<GlimmerNotifications />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss saved message' }));
    await waitFor(() => expect(screen.queryByText('A saved message')).not.toBeInTheDocument());
    expect(state.dismissGlimmer).toHaveBeenCalledExactlyOnceWith('saved-notice');
  });

  it('keeps the existing intelligence-disabled behavior', () => {
    state.settings.intelligenceEnabled = false;
    render(<GlimmerNotifications />);
    expect(screen.queryByTestId('saved-assistant-message')).not.toBeInTheDocument();
    expect(service.shouldTriggerGlimmer).not.toHaveBeenCalled();
  });
});
