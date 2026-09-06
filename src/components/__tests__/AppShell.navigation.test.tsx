import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../AppShell';

const store = vi.hoisted(() => ({ settings: { intelligenceEnabled: false } }));
vi.mock('@/stores/bubbleStore', () => ({ useBubbleStore: () => store }));
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
vi.mock('@/components/ViewModeToggle', () => ({ ViewModeToggle: () => <div role="group" aria-label="Canvas view">View choices</div> }));
vi.mock('@/components/AuthStatus', () => ({ AuthStatus: () => null }));
vi.mock('@/components/IntegrationStatusIndicator', () => ({ IntegrationStatusIndicator: () => null }));

afterEach(() => { cleanup(); store.settings.intelligenceEnabled = false; });

function mountShell(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<div>Page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Calm shell navigation', () => {
  it('keeps four primary destinations and reveals secondary routes in More', async () => {
    mountShell();
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(4);
    expect(screen.queryByRole('menuitem', { name: 'Timeline' })).not.toBeInTheDocument();
    await act(async () => { fireEvent.keyDown(screen.getByRole('button', { name: 'More destinations' }), { key: 'Enter' }); });
    expect(screen.getByRole('menuitem', { name: 'Timeline' })).toHaveAttribute('href', '/timeline');
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('menuitem', { name: 'CBT worksheet' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(screen.queryByRole('group', { name: 'Canvas view' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  }, 30_000);

  it('preserves the conditional CBT destination', async () => {
    store.settings.intelligenceEnabled = true;
    mountShell();
    await act(async () => { fireEvent.keyDown(screen.getByRole('button', { name: 'More destinations' }), { key: 'Enter' }); });
    expect(screen.getByRole('menuitem', { name: 'CBT worksheet' })).toHaveAttribute('href', '/cbt-worksheet');
  }, 30_000);

  it('shows view controls only on a canvas representation', () => {
    mountShell('/calendar');
    expect(screen.queryByRole('group', { name: 'Canvas view' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Canvas' }));
    expect(screen.getByRole('group', { name: 'Canvas view' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Canvas' })).toHaveAttribute('aria-current', 'page');
  });

  it('reveals account and appearance controls on demand and links to real integration settings', () => {
    mountShell();
    const trigger = screen.getByRole('button', { name: 'Quick tools' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute('href', '/settings?tab=integrations');
    fireEvent.click(trigger);
    expect(screen.queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
  });
});
