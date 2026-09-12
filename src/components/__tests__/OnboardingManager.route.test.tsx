import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bubble } from '@/types/bubble';
import { useBubbleStore } from '@/stores/bubbleStore';
import { OnboardingManager } from '@/components/OnboardingManager';

const service = vi.hoisted(() => ({
  hasCompletedOnboarding: vi.fn<() => Promise<boolean>>(),
  trackActivity: vi.fn(),
}));
vi.mock('@/services/userContextService', () => ({ userContextService: service }));
vi.mock('@/providers/ProgressiveOnboardingProvider', () => ({
  useProgressiveOnboarding: () => ({ state: { isEnabled: true, hasSkippedProgression: false } }),
}));
vi.mock('@/stores/bubbleStore', async () => {
  const { create } = await import('zustand');
  return { useBubbleStore: create(() => ({ bubbles: [] as Bubble[] })) };
});
vi.mock('@/components/OnboardingDataWizard', () => ({
  OnboardingDataWizard: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => isOpen
    ? <section role="dialog" aria-label="Welcome"><button onClick={onClose}>Close welcome</button></section>
    : null,
}));

function deferred() {
  let resolve!: (value: boolean) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<boolean>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function renderManager(path: string) {
  render(<MemoryRouter initialEntries={[path]}>
    <Link to="/">Canvas</Link><Link to="/settings">Settings</Link><Link to="/list">List</Link>
    <OnboardingManager />
  </MemoryRouter>);
}

function guideBubble(): Bubble {
  return { id: 'guide', type: 'Task', content: 'First step', createdAt: 1, updatedAt: 1, x: 0, y: 0, size: 0.5, tags: [], metadata: { bubbleGarden: { pack: 'living-bubbles-v1', lesson: 'move' } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  useBubbleStore.setState({ bubbles: [] });
  service.hasCompletedOnboarding.mockResolvedValue(false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Onboarding route and guide boundaries', () => {
  it('leaves a new canvas launch clear without starting the legacy check', () => {
    renderManager('/');
    expect(service.hasCompletedOnboarding).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Welcome' })).not.toBeInTheDocument();
  });

  it.each(['resolve', 'reject'] as const)('ignores a late %s after navigating from List to Canvas', async outcome => {
    const check = deferred();
    service.hasCompletedOnboarding.mockReturnValueOnce(check.promise);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderManager('/list');
    expect(service.hasCompletedOnboarding).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('link', { name: 'Canvas' }));
    await act(async () => {
      if (outcome === 'resolve') check.resolve(false);
      else check.reject(new Error('Simulated delayed context failure'));
    });
    expect(screen.queryByRole('dialog', { name: 'Welcome' })).not.toBeInTheDocument();
    expect(service.hasCompletedOnboarding).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight check when a guide bubble becomes available', async () => {
    const check = deferred();
    service.hasCompletedOnboarding.mockReturnValueOnce(check.promise);
    renderManager('/list');
    act(() => useBubbleStore.setState({ bubbles: [guideBubble()] }));
    await act(async () => { check.resolve(false); });
    expect(screen.queryByRole('dialog', { name: 'Welcome' })).not.toBeInTheDocument();
  });

  it('does not check or display the legacy wizard for an existing guide', () => {
    useBubbleStore.setState({ bubbles: [guideBubble()] });
    renderManager('/settings');
    expect(service.hasCompletedOnboarding).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Welcome' })).not.toBeInTheDocument();
  });

  it('allows direct-route onboarding and keeps an explicit dismissal across navigation', async () => {
    renderManager('/list');
    expect(await screen.findByRole('dialog', { name: 'Welcome' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close welcome' }));
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('link', { name: 'List' }));
    expect(screen.queryByRole('dialog', { name: 'Welcome' })).not.toBeInTheDocument();
    expect(service.hasCompletedOnboarding).toHaveBeenCalledTimes(1);
  });
});
