/**
 * Regression tests for the cross-device sync-conflict surface wired up in
 * REVIVE Run 124 (2026-07-27).
 *
 * Before this, conflict resolution was unreachable for real users:
 * `setShowConflictDialog(true)` appeared nowhere in the codebase, the only
 * `sync-conflict` listener (SyncDashboard.tsx:59) lived in a component that is
 * never imported or rendered anywhere, and nothing read the conflicts
 * crossDeviceSyncService persists to localStorage. These tests pin all three
 * entry paths plus the two incompatible event payload shapes the sync layer
 * actually emits.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { crossDeviceSyncService } from '@/services/crossDeviceSyncService';
import type { SyncConflict } from '@/services/crossDeviceSyncService';
import { resetMockBubbleStore } from '@/test/helpers/mockBubbleStore';

vi.mock('@/stores/bubbleStore', async () => {
  const { makeBubbleStoreMockModule } = await import('@/test/helpers/mockBubbleStore');
  return makeBubbleStoreMockModule();
});
vi.mock('@/services/crossDeviceSyncService');
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      signUp: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      signInWithOAuth: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
}));

const CONFLICT: SyncConflict = {
  id: 'conflict-1',
  entityType: 'bubble',
  entityId: 'bubble-1',
  localVersion: { content: 'Local version' },
  remoteVersion: { content: 'Remote version' },
  timestamp: new Date().toISOString(),
};

describe('cross-device sync conflict surface', () => {
  beforeEach(() => {
    // <App/> mounts its own <BrowserRouter> over the real jsdom history, which
    // is never reset between tests; without this, a test that navigates leaves
    // later mounts on the wrong route (REVIVE Run 108).
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
    resetMockBubbleStore();
    vi.mocked(crossDeviceSyncService.getStoredConflicts).mockReturnValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows nothing when there are no conflicts', async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/sync conflict detected/i)).not.toBeInTheDocument());
  });

  it('hydrates conflicts persisted before this session', async () => {
    vi.mocked(crossDeviceSyncService.getStoredConflicts).mockReturnValue([CONFLICT]);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/sync conflict detected/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /resolve conflict/i })).toBeInTheDocument();
  });

  it('skips conflicts already marked resolved', async () => {
    vi.mocked(crossDeviceSyncService.getStoredConflicts)
      .mockReturnValue([{ ...CONFLICT, resolved: true }]);
    render(<App />);

    await waitFor(() => expect(screen.queryByText(/sync conflict detected/i)).not.toBeInTheDocument());
  });

  it("announces a live conflict from crossDeviceSyncService's bare payload", async () => {
    render(<App />);

    window.dispatchEvent(new CustomEvent('sync-conflict', { detail: CONFLICT }));

    await waitFor(() => {
      expect(screen.getByText(/sync conflict detected/i)).toBeInTheDocument();
    });
  });

  it("announces a live conflict from enhancedSyncService's wrapped snake_case payload", async () => {
    render(<App />);

    window.dispatchEvent(new CustomEvent('sync-conflict', {
      detail: {
        conflict: {
          id: 'conflict-2',
          entity_type: 'bubble',
          entity_id: 'bubble-2',
          local_data: '{"content":"Local"}',
          remote_data: '{"content":"Remote"}',
          local_timestamp: new Date().toISOString(),
          remote_timestamp: new Date().toISOString(),
        },
      },
    }));

    await waitFor(() => {
      expect(screen.getByText(/sync conflict detected/i)).toBeInTheDocument();
    });
  });

  it('ignores malformed payloads instead of announcing an empty conflict', async () => {
    render(<App />);

    window.dispatchEvent(new CustomEvent('sync-conflict', { detail: null }));
    window.dispatchEvent(new CustomEvent('sync-conflict', { detail: {} }));
    window.dispatchEvent(new CustomEvent('sync-conflict', { detail: { conflict: {} } }));

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/sync conflict detected/i)).not.toBeInTheDocument();
  });

  it('does not double-announce the same conflict id', async () => {
    render(<App />);

    window.dispatchEvent(new CustomEvent('sync-conflict', { detail: CONFLICT }));
    window.dispatchEvent(new CustomEvent('sync-conflict', { detail: CONFLICT }));

    await waitFor(() => {
      expect(screen.getByText('Sync conflict detected')).toBeInTheDocument();
    });
  });

  it('opens the dialog and resolves with exactly the two documented arguments', async () => {
    const user = userEvent.setup();
    vi.mocked(crossDeviceSyncService.getStoredConflicts).mockReturnValue([CONFLICT]);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /resolve conflict/i }));
    expect(screen.getByText(/sync conflict resolution/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /keep local/i }));

    // Two arguments, not three: 'keep-local' has no merged payload, and an
    // explicit trailing `undefined` is a different call than omitting it.
    expect(crossDeviceSyncService.resolveConflict).toHaveBeenCalledWith('conflict-1', 'keep-local');

    // Resolving clears the announcement.
    await waitFor(() => {
      expect(screen.queryByText(/sync conflict detected/i)).not.toBeInTheDocument();
    });
  });

  it('survives a storage read that throws', async () => {
    vi.mocked(crossDeviceSyncService.getStoredConflicts).mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });

    expect(() => render(<App />)).not.toThrow();
    await waitFor(() => expect(screen.queryByText(/sync conflict detected/i)).not.toBeInTheDocument());
  });
});
