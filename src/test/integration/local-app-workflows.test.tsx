import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { useBubbleStore } from '@/stores/bubbleStore';
import { userContextService } from '@/services/userContextService';
import { storageService } from '@/services/storage';

const initialSettings = { ...useBubbleStore.getState().settings };

const bubbleLabel = (content: string) =>
  content.slice(0, 20) + (content.length > 20 ? '...' : '');

describe('Current local app workflows', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    window.history.pushState({}, '', '/');
    useBubbleStore.setState({
      bubbles: [],
      settings: { ...initialSettings, biometricLock: false },
    });

    // App onboarding depends on IndexedDB-backed user context. This suite is
    // about the post-onboarding local workflow, so keep that boundary explicit.
    vi.spyOn(userContextService, 'hasCompletedOnboarding').mockResolvedValue(true);

    // jsdom's IndexedDB shim does not complete storageService.initialize().
    // Spy only on the persistence methods this workflow owns, then assert the
    // calls below so these are observable contracts rather than no-op mocks.
    vi.spyOn(storageService, 'isInitialized').mockReturnValue(true);
    vi.spyOn(storageService, 'createBubble').mockResolvedValue(undefined);
    vi.spyOn(storageService, 'updateBubble').mockResolvedValue(undefined);
    vi.spyOn(storageService, 'deleteBubble').mockResolvedValue(undefined);
    vi.spyOn(storageService, 'updateSettings').mockResolvedValue(undefined);
  });

  it('persists create, edit, and delete through the current local bubble UI', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /capture thought/i }));
    await user.click(screen.getByRole('button', { name: 'Text' }));
    await user.type(
      screen.getByPlaceholderText(/what's on your mind/i),
      'My first thought bubble',
    );
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(storageService.createBubble).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'My first thought bubble',
          type: 'Thought',
        }),
      );
      expect(screen.getByText(bubbleLabel('My first thought bubble')))
        .toBeInTheDocument();
    });
    const createdBubble = vi.mocked(storageService.createBubble).mock.calls[0][0];

    await user.click(screen.getByText(bubbleLabel('My first thought bubble')));
    const editInput = screen.getByDisplayValue('My first thought bubble');
    await user.clear(editInput);
    await user.type(editInput, 'My updated thought bubble');

    await waitFor(() => {
      expect(storageService.updateBubble).toHaveBeenCalledWith(
        expect.objectContaining({
          id: createdBubble.id,
          content: 'My updated thought bubble',
        }),
      );
    }, { timeout: 2_000 });

    await user.click(screen.getByRole('button', { name: /done/i }));
    await user.click(screen.getByText(bubbleLabel('My updated thought bubble')));
    await user.click(screen.getByRole('button', { name: /delete bubble/i }));

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', {
      name: 'Yes, delete',
    }));

    await waitFor(() => {
      expect(storageService.deleteBubble).toHaveBeenCalledWith(createdBubble.id);
      expect(screen.queryByText(bubbleLabel('My updated thought bubble')))
        .not.toBeInTheDocument();
    });
  });

  it('persists the biometric-lock preference without claiming a biometric ceremony', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /settings/i }));
    await user.click(screen.getByRole('tab', { name: /privacy/i }));

    const biometricToggle = await screen.findByRole('switch', {
      name: /biometric/i,
    });
    expect(biometricToggle).not.toBeChecked();
    await user.click(biometricToggle);

    await waitFor(() => {
      expect(biometricToggle).toBeChecked();
      expect(storageService.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ biometricLock: true }),
      );
    });
    expect(useBubbleStore.getState().settings.biometricLock).toBe(true);
  });
});
