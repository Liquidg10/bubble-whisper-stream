import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../AppShell';

vi.mock('@/stores/bubbleStore', () => ({ useBubbleStore: () => ({ settings: {} }) }));
vi.mock('@/providers/ProgressiveOnboardingProvider', () => ({
  useProgressiveOnboarding: () => ({ state: {}, skipProgression: vi.fn(), rewindToDay: vi.fn() }),
}));
vi.mock('@/components/GlimmerNotificationSystem', () => ({
  GlimmerNotificationSystem: () => <p>Newly generated glimmer</p>,
}));
vi.mock('@/components/GlimmerNotifications', () => ({
  GlimmerNotifications: () => <p>Saved undismissed glimmer</p>,
}));
vi.mock('@/components/ThemeToggle', () => ({ CompactThemeToggle: () => null }));
vi.mock('@/components/OfflineDetector', () => ({ OfflineDetector: () => null }));
vi.mock('@/components/OfflineStatusBanner', () => ({ OfflineStatusBanner: () => null }));
vi.mock('@/components/AudioQueueIndicator', () => ({ AudioQueueIndicator: () => null }));
vi.mock('@/components/CleanHouseHeaderTimer', () => ({ CleanHouseHeaderTimer: () => null }));
vi.mock('@/components/PomodoroHeaderTimer', () => ({ PomodoroHeaderTimer: () => null }));
vi.mock('@/components/HeaderVoiceCaptureUnified', () => ({ HeaderVoiceCapture: () => null }));
vi.mock('@/components/OnboardingProgressIndicator', () => ({ OnboardingProgressIndicator: () => null }));
vi.mock('@/components/SmartAIAssistant', () => ({ SmartAIAssistant: () => null }));
vi.mock('@/components/ViewModeToggle', () => ({ ViewModeToggle: () => null }));
vi.mock('@/components/AuthStatus', () => ({ AuthStatus: () => null }));
vi.mock('@/components/IntegrationStatusIndicator', () => ({ IntegrationStatusIndicator: () => null }));
vi.mock('@/components/NarrativeSearch', () => ({ default: () => null }));

afterEach(cleanup);

function mountShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div data-testid="route-viewport">Canvas</div>} />
          <Route path="/calendar" element={<div data-testid="route-viewport">Calendar page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell non-obstructing Glimmer placement', () => {
  it('places both home messages after, not inside, the full-height route viewport', () => {
    mountShell();
    const messages = screen.getByRole('complementary', { name: 'Glimmer messages' });
    const routeContainer = messages.previousElementSibling;
    expect(routeContainer).toHaveClass('h-full', 'flex', 'flex-col');
    expect(routeContainer).toContainElement(screen.getByTestId('route-viewport'));
    expect(routeContainer).not.toContainElement(messages);
    expect(messages).toContainElement(screen.getByText('Newly generated glimmer'));
    expect(messages).toContainElement(screen.getByText('Saved undismissed glimmer'));
  });

  it('retains the saved-message home-only mount scope across navigation', () => {
    mountShell();
    fireEvent.click(screen.getByRole('link', { name: 'Calendar' }));
    expect(screen.getByText('Calendar page')).toBeInTheDocument();
    expect(screen.getByText('Newly generated glimmer')).toBeInTheDocument();
    expect(screen.queryByText('Saved undismissed glimmer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Canvas' }));
    expect(screen.getByText('Saved undismissed glimmer')).toBeInTheDocument();
  });

  it('does not mount the legacy generator on a direct non-home route', () => {
    mountShell('/calendar');
    expect(screen.getByText('Newly generated glimmer')).toBeInTheDocument();
    expect(screen.queryByText('Saved undismissed glimmer')).not.toBeInTheDocument();
  });
});
