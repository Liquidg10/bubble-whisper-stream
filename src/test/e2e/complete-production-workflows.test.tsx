import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { crossDeviceSyncService } from '@/services/crossDeviceSyncService';
import { modalityService } from '@/services/modalityService';
import { resetMockBubbleStore, setMockBubbleState } from '@/test/helpers/mockBubbleStore';

// Mock all external services.
//
// bubbleStore: faithful, selector-aware mock via the shared helper (see
// src/test/helpers/mockBubbleStore.ts) instead of a bare `vi.mock(...)`
// auto-mock + ad hoc `.mockReturnValue(...)`. The bare auto-mock made
// `useBubbleStore()` return a fixed object with no `settings` key, so
// `ProgressiveOnboardingProvider` (mounted deep inside <App/>) crashed at
// `settings.progressiveOnboarding` -- this suite's actual class-B failure
// signature (11/11 failing on that single crash, confirmed 2026-07-14
// REVIVE Run 78). It also could not answer App.tsx's
// `useBubbleStore(state => state.initializeStore)` selector call correctly;
// the shared helper's selector-awareness fix (this same run) is required
// for <App/> to mount at all.
vi.mock('@/stores/bubbleStore', async () => {
  const { makeBubbleStoreMockModule } = await import('@/test/helpers/mockBubbleStore');
  return makeBubbleStoreMockModule();
});
vi.mock('@/services/crossDeviceSyncService');
vi.mock('@/services/modalityService');
// bubbleStore + Router are the only class-B/mount bugs `mockBubbleStore.ts`
// and `renderApp()` fix; a THIRD, independent one lives here. A bare
// `vi.mock('@/integrations/supabase/client')` auto-mocks `supabase.auth.*`
// as functions returning `undefined`. `AuthProvider` (one of App.tsx's 8
// providers, wraps the whole tree) destructures
// `const { data: { subscription } } = supabase.auth.onAuthStateChange(...)`
// and `const { data: { session } } = await supabase.auth.getSession()`
// unconditionally in its mount effect (src/providers/AuthProvider.tsx:18,36)
// -- both throw "Cannot destructure property 'data' of ... as it is
// undefined" on the auto-mock's `undefined` return, independent of the
// bubbleStore/Router fixes above and masked by them until now. Stubs the
// full supabase.auth.* surface AuthProvider calls (verified against
// AuthProvider.tsx) so it mounts like a signed-out session.
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

// NOTE: <App/> already renders its own internal <BrowserRouter> (App.tsx:140).
// The original test wrapped it in a SECOND <BrowserRouter> here, which React
// Router forbids outright ("You cannot render a <Router> inside another
// <Router>"). This was masked until now by the earlier store-mock crash
// (ProgressiveOnboardingProvider throws before render ever reaches App's
// internal BrowserRouter) -- fixing that crash surfaced this second,
// independent test-scaffolding bug. Pure harness fix: render <App/> directly.
const renderApp = () => {
  return render(<App />);
};

// Full-<App/>-tree store surface: every field/action the mounted tree reads
// during initial render (App.tsx's `initializeStore` selector call,
// AppShell/Index/AccessibilityProvider/ProgressiveOnboardingProvider/
// HeaderVoiceCapture's whole-state destructures). `settings` itself comes
// from the shared helper's `createMockSettings()` default (already includes
// `progressiveOnboarding`); this only adds the actions + loading/selection
// fields this suite's original inline mock declared, so behavior for those
// fields is unchanged from before -- only the missing `settings` (and now-
// working `initializeStore`) are new.
const productionAppStoreStubs = () => ({
  initializeStore: vi.fn(() => Promise.resolve()),
  selectedBubbles: new Set<string>(),
  isLoading: false,
  addBubble: vi.fn(),
  updateBubble: vi.fn(),
  deleteBubble: vi.fn(),
  selectBubble: vi.fn(),
  clearSelection: vi.fn(),
  mergeBubbles: vi.fn(),
  updateSettings: vi.fn(),
});

describe('Complete Production Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockBubbleStore();

    // Mock bubble store: full App-tree surface (see productionAppStoreStubs
    // above). bubbles: [] and settings come from the shared helper's
    // defaults; this layers in the actions/flags this suite needs.
    setMockBubbleState(productionAppStoreStubs());

    // Mock sync service
    (crossDeviceSyncService as any).initialize = vi.fn();
    (crossDeviceSyncService as any).getSyncStatus = vi.fn().mockReturnValue({
      isConnected: true,
      lastSync: new Date(),
      pendingChanges: 0
    });

    // Mock modality service
    (modalityService as any).transcribeVoice = vi.fn().mockResolvedValue({
      success: true,
      text: 'Test transcription',
      because: 'Test transcription'
    });
    (modalityService as any).analyzePhoto = vi.fn().mockResolvedValue({
      success: true,
      analysis: 'Test photo analysis',
      because: 'Test analysis'
    });
  });

  // Guards against a real, verified leak: this file has no afterEach, and
  // 'should handle offline-to-online sync workflow' below sets
  // navigator.onLine=false then throws (getByRole('add bubble') not found,
  // see REVIVE Run 78) BEFORE its own value:true restore line runs -- so
  // onLine stays stuck false for every later test in this file. Currently
  // masked because those later tests already fail for their own unrelated,
  // pre-diagnosed reasons (Run 78) -- but it's live latent pollution that
  // would surface as a confusing regression the moment those are fixed.
  // Verified via a temporary DIAGNOSTIC-PROBE test: failed
  // ('expected false to be true') before this afterEach, passes after.
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: true,
    });
  });

  describe('End-to-End User Journey', () => {
    it('should complete full user workflow from onboarding to collaboration', async () => {
      const user = userEvent.setup();
      renderApp();

      // 1. Initial load and onboarding
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });

      // 2. Create first bubble via radial capture
      const radialButton = screen.getByRole('button', { name: /capture thought/i });
      await user.click(radialButton);
      const textMenuItem = await screen.findByRole('button', { name: /^text$/i });
      await user.click(textMenuItem);

      // Simulate text input
      const textInput = screen.getByPlaceholderText(/what's on your mind/i);
      await user.type(textInput, 'My first thought bubble');
      
      const createButton = screen.getByRole('button', { name: /save/i });
      await user.click(createButton);

      // 3. Test voice capture workflow
      const voiceButton = screen.getByRole('button', { name: /voice/i });
      await user.click(voiceButton);

      // Simulate voice recording completion
      await waitFor(() => {
        expect(modalityService.transcribeVoice).toHaveBeenCalled();
      });

      // 4. Test photo capture workflow
      const photoButton = screen.getByRole('button', { name: /photo/i });
      await user.click(photoButton);

      // Simulate photo capture
      await waitFor(() => {
        expect(modalityService.analyzePhoto).toHaveBeenCalled();
      });

      // 5. Test search functionality
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      const searchInput = screen.getByPlaceholderText(/search bubbles/i);
      await user.type(searchInput, 'thought');

      // 6. Test temporal navigation
      const timelineButton = screen.getByRole('button', { name: /timeline/i });
      await user.click(timelineButton);

      // 7. Test collaboration features
      const settingsButton = screen.getByRole('button', { name: /settings/i });
      await user.click(settingsButton);

      const collaborationTab = screen.getByRole('tab', { name: /collaboration/i });
      await user.click(collaborationTab);

      // Verify all major features are accessible
      expect(screen.getByText(/cross.device sync/i)).toBeInTheDocument();
    });

    it('should handle offline-to-online sync workflow', async () => {
      const user = userEvent.setup();
      
      // Mock offline state
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });

      renderApp();

      // Create bubbles while offline
      const radialButton = screen.getByRole('button', { name: /capture thought/i });
      await user.click(radialButton);
      const textMenuItem = await screen.findByRole('button', { name: /^text$/i });
      await user.click(textMenuItem);

      const textInput = screen.getByPlaceholderText(/what's on your mind/i);
      await user.type(textInput, 'Offline bubble');
      
      const createButton = screen.getByRole('button', { name: /save/i });
      await user.click(createButton);

      // Simulate going online
      Object.defineProperty(navigator, 'onLine', {
        value: true
      });

      // Trigger online event
      fireEvent(window, new Event('online'));

      // Verify sync service is called
      await waitFor(() => {
        expect(crossDeviceSyncService.initialize).toHaveBeenCalled();
      });
    });
  });

  describe('Multi-Device Collaboration', () => {
    it('should handle real-time collaboration workflow', async () => {
      const user = userEvent.setup();
      renderApp();

      // Navigate to collaboration settings
      const settingsButton = screen.getByRole('button', { name: /settings/i });
      await user.click(settingsButton);

      const collaborationTab = screen.getByRole('tab', { name: /collaboration/i });
      await user.click(collaborationTab);

      // Enable collaboration
      const enableButton = screen.getByRole('button', { name: /enable collaboration/i });
      await user.click(enableButton);

      // Share a bubble
      const shareButton = screen.getByRole('button', { name: /share/i });
      await user.click(shareButton);

      // Set sharing permissions
      const viewOnlyRadio = screen.getByRole('radio', { name: /view only/i });
      await user.click(viewOnlyRadio);

      const confirmShare = screen.getByRole('button', { name: /confirm share/i });
      await user.click(confirmShare);

      // Verify sharing workflow
      expect(screen.getByText(/sharing enabled/i)).toBeInTheDocument();
    });

    it('should handle conflict resolution workflow', async () => {
      const user = userEvent.setup();
      
      // Mock conflict scenario
      (crossDeviceSyncService as any).getStoredConflicts = vi.fn().mockReturnValue([
        {
          id: 'conflict-1',
          entityType: 'bubble',
          entityId: 'bubble-1',
          localData: { content: 'Local version' },
          remoteData: { content: 'Remote version' },
          timestamp: new Date()
        }
      ]);

      renderApp();

      // Conflict notification should appear
      await waitFor(() => {
        expect(screen.getByText(/sync conflict detected/i)).toBeInTheDocument();
      });

      // Open conflict resolution
      const resolveButton = screen.getByRole('button', { name: /resolve conflict/i });
      await user.click(resolveButton);

      // Choose resolution
      const keepLocalButton = screen.getByRole('button', { name: /keep local/i });
      await user.click(keepLocalButton);

      // Verify conflict resolution
      expect(crossDeviceSyncService.resolveConflict).toHaveBeenCalledWith(
        'conflict-1',
        'keep-local'
      );
    });
  });

  describe('AI Integration Workflows', () => {
    it('should complete AI-enhanced content creation workflow', async () => {
      const user = userEvent.setup();
      renderApp();

      // Create bubble with AI analysis
      const radialButton = screen.getByRole('button', { name: /capture thought/i });
      await user.click(radialButton);
      const textMenuItem = await screen.findByRole('button', { name: /^text$/i });
      await user.click(textMenuItem);

      const textInput = screen.getByPlaceholderText(/what's on your mind/i);
      await user.type(textInput, 'I feel overwhelmed with work today');
      
      // Enable AI analysis
      const aiToggle = screen.getByRole('switch', { name: /ai analysis/i });
      await user.click(aiToggle);

      const createButton = screen.getByRole('button', { name: /save/i });
      await user.click(createButton);

      // Verify AI analysis is triggered
      await waitFor(() => {
        expect(modalityService.analyzeSentiment).toHaveBeenCalledWith(
          'I feel overwhelmed with work today'
        );
      });

      // Check for AI-generated suggestions
      expect(screen.getByText(/ai insights/i)).toBeInTheDocument();
    });

    it('should handle CBT reframe workflow', async () => {
      const user = userEvent.setup();
      renderApp();

      // Navigate to CBT worksheet
      const cbtButton = screen.getByRole('button', { name: /cbt/i });
      await user.click(cbtButton);

      // Enter negative thought
      const thoughtInput = screen.getByPlaceholderText(/enter your thought/i);
      await user.type(thoughtInput, 'I always mess things up');

      // Request reframe
      const reframeButton = screen.getByRole('button', { name: /get reframe/i });
      await user.click(reframeButton);

      // Verify AI reframe request
      await waitFor(() => {
        expect(screen.getByText(/generating reframe/i)).toBeInTheDocument();
      });
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain performance with large datasets', async () => {
      const user = userEvent.setup();
      
      // Mock large dataset
      const largeBubbleSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `bubble-${i}`,
        content: `Test bubble ${i}`,
        type: 'thought',
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        created_at: new Date().toISOString()
      }));

      // beforeEach already applied productionAppStoreStubs(); layer the
      // large dataset on top rather than replacing the whole mocked state
      // (the old code's full-object replace is what silently dropped
      // `settings` here too, on top of duplicating the stub list).
      setMockBubbleState({ bubbles: largeBubbleSet });

      const startTime = performance.now();
      renderApp();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });

      const renderTime = performance.now() - startTime;

      // Should render large dataset in under 2 seconds
      expect(renderTime).toBeLessThan(2000);

      // Test search performance
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      const searchInput = screen.getByPlaceholderText(/search bubbles/i);
      
      const searchStartTime = performance.now();
      await user.type(searchInput, 'test');
      
      const searchTime = performance.now() - searchStartTime;

      // Search should be responsive
      expect(searchTime).toBeLessThan(500);
    });
  });

  describe('Accessibility Workflows', () => {
    it('should support full keyboard navigation', async () => {
      renderApp();

      // Test keyboard navigation through main interface
      await userEvent.tab(); // Should focus first interactive element
      await userEvent.keyboard('{Enter}'); // Should activate focused element

      // Verify focus management
      expect(document.activeElement).toBeInstanceOf(HTMLElement);

      // Test screen reader announcements
      const mainRegion = screen.getByRole('main');
      expect(mainRegion).toHaveAttribute('aria-label');
    });

    it('should support reduced motion preferences', async () => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      renderApp();

      // Verify reduced motion is respected
      const canvas = screen.getByRole('main');
      const computedStyle = window.getComputedStyle(canvas);
      
      // Animations should be reduced or disabled
      expect(computedStyle.animation).toBe('none');
    });
  });

  describe('Error Recovery Workflows', () => {
    it('should handle network errors gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock network error
      (modalityService.transcribeVoice as any).mockRejectedValue(
        new Error('Network error')
      );

      renderApp();

      // Attempt voice capture
      const voiceButton = screen.getByRole('button', { name: /voice/i });
      await user.click(voiceButton);

      // Verify error handling
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      // Verify retry mechanism
      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('should recover from storage errors', async () => {
      const user = userEvent.setup();
      
      // Mock storage error. NOTE: the original test wrote
      // `(useBubbleStore as any).addBubble = vi.fn()...` -- that sets a
      // property on the mock *hook function*, which nothing reads (the real
      // code reads `addBubble` off the hook's *return value*), so it was a
      // silent no-op. Fixed to actually override the store's addBubble
      // action via the shared helper.
      setMockBubbleState({
        addBubble: vi.fn().mockRejectedValue(new Error('Storage quota exceeded')),
      });

      renderApp();

      // Attempt to create bubble
      const radialButton = screen.getByRole('button', { name: /capture thought/i });
      await user.click(radialButton);
      const textMenuItem = await screen.findByRole('button', { name: /^text$/i });
      await user.click(textMenuItem);

      const textInput = screen.getByPlaceholderText(/what's on your mind/i);
      await user.type(textInput, 'Test bubble');
      
      const createButton = screen.getByRole('button', { name: /save/i });
      await user.click(createButton);

      // Verify error handling and recovery options
      await waitFor(() => {
        expect(screen.getByText(/storage error/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /clear cache/i })).toBeInTheDocument();
    });
  });
});