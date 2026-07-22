import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { useBubbleStore } from '@/stores/bubbleStore';
import { userContextService } from '@/services/userContextService';
import { storageService } from '@/services/storage';

// Mock all external services
vi.mock('@/services/crossDeviceSyncService');
vi.mock('@/services/advancedAIService');
vi.mock('@/services/vectorSearchService');

// This app's default theme (iridescent-soap, src/themes/definitions/iridescent-soap.ts)
// renders bubbles through the experimental src/experimental/iridescent/BubbleRenderer.tsx
// canvas, not the src/components/BubbleCanvas.tsx + BubbleCard.tsx pair -- confirmed by
// inspecting the rendered DOM (`.iridescent-bubble` / `.soap-*` classes, not BubbleCard's
// markup) and by tracing the theme definition's import. That renderer truncates every
// bubble's on-canvas label to its first 20 characters + "..." whenever content is longer
// than 20 chars (BubbleRenderer.tsx ~L95: `content.slice(0, 20) + (content.length > 20 ?
// '...' : '')`) -- real, deliberate, verified product behavior (it would truncate in a
// real browser identically; nothing jsdom-specific about it), not a bug to work around.
// Several of this suite's fixtures ("My first thought bubble", "Feeling anxious about
// tomorrow", ...) are longer than 20 characters, so asserting on the raw, untruncated
// string can never match what the app actually renders on canvas. Mirror the app's own
// truncation here so assertions check the real rendered label. Does NOT apply to
// getByDisplayValue() checks against the edit form's input, which correctly holds the
// full untruncated content.
const bubbleLabel = (content: string) =>
  content.slice(0, 20) + (content.length > 20 ? '...' : '');

const renderApp = () => {
  return render(<App />);
};

describe('End-to-End User Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // App.tsx owns its own <BrowserRouter> (renderApp no longer wraps its own, per the
    // Router-nesting fix) which reads real jsdom window.history -- a global that is NOT
    // reset between tests by RTL's automatic unmount/cleanup. Whatever route the previous
    // test's userEvent clicks navigated to (e.g. /cbt-worksheet, /settings) is still the
    // current URL when the next test's fresh <App/> mounts, so it silently renders the
    // wrong page. Reset explicitly so every test starts at "/" regardless of run order.
    window.history.pushState({}, '', '/');
    // OnboardingManager scroll-locks the whole app (body pointer-events:none) whenever
    // userContextService.hasCompletedOnboarding() resolves false -- which it always does
    // in jsdom, because selfModelV2Service's real IndexedDB call throws ("Database not
    // initialized") and getUserContext() swallows that into a bare {} default. Spy on
    // just this one method (not a full module mock) so every other real
    // userContextService/selfModelV2Service behavior this suite may exercise is untouched.
    vi.spyOn(userContextService, 'hasCompletedOnboarding').mockResolvedValue(true);
    // storageService.initialize() opens a real IndexedDB connection via window.indexedDB.open().
    // The suite's global mock (src/test/setup.ts) returns a static request object whose
    // onsuccess/onerror/onupgradeneeded handlers are assigned but never invoked -- so the
    // returned promise never settles and storageService's private `db` field stays null
    // forever. isInitialized() (`db !== null`) is therefore always false in this suite, which
    // makes addBubble() silently no-op (early-return + console.warn, no thrown error) and would
    // make updateBubble/deleteBubble throw "Database not initialized" (caught internally, also
    // silent). Proved directly with a temporary diagnostic probe before this fix: after a full,
    // error-free capture -> Text -> type -> Save flow, isInitialized() was still false and the
    // store's bubbles array was still empty. Spy on just the 4 methods this file's tests
    // exercise (isInitialized/createBubble/updateBubble/deleteBubble) on the real singleton --
    // same targeted-spy pattern as the hasCompletedOnboarding fix above -- rather than touching
    // the shared global indexedDB mock, which every other test file in the suite also depends on.
    vi.spyOn(storageService, 'isInitialized').mockReturnValue(true);
    vi.spyOn(storageService, 'createBubble').mockResolvedValue(undefined);
    vi.spyOn(storageService, 'updateBubble').mockResolvedValue(undefined);
    vi.spyOn(storageService, 'deleteBubble').mockResolvedValue(undefined);
  });

  describe('Complete Bubble Lifecycle', () => {
    it('should create, edit, sync, and delete a bubble', async () => {
      const user = userEvent.setup();
      renderApp();

      // 1. Create a bubble via radial capture
      const captureButton = screen.getByRole('button', { name: /capture thought/i });
      await user.click(captureButton);

      const textMenuItem = screen.getByRole('button', { name: 'Text' });
      await user.click(textMenuItem);

      const textInput = screen.getByPlaceholderText(/what's on your mind/i);
      await user.type(textInput, 'My first thought bubble');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // 2. Verify bubble appears on canvas
      await waitFor(() => {
        expect(screen.getByText(bubbleLabel('My first thought bubble'))).toBeInTheDocument();
      });

      // 3. Edit the bubble. Clicking a bubble opens BubbleDetail (src/components/BubbleDetail.tsx)
      // directly into an always-editable view -- its Content field is a live-bound <Textarea>
      // (value={editedBubble.content}), not a separate read-only "view" gated behind an "Edit"
      // button. Confirmed directly (diagnostic probe dumping all buttons in the open dialog):
      // 6 buttons total -- Play (TTS), tag Plus, Done, Remind, Delete, Radix's default Close --
      // none named "Edit". Interact with the Textarea directly via getByDisplayValue, which the
      // edit form's input correctly exposes (untruncated, unlike the canvas label).
      const bubble = screen.getByText(bubbleLabel('My first thought bubble'));
      await user.click(bubble);

      const editInput = screen.getByDisplayValue('My first thought bubble');
      await user.clear(editInput);
      await user.type(editInput, 'My updated thought bubble');

      // BubbleDetail auto-saves via a 1000ms debounce on every Content keystroke
      // (debouncedSave -> updateBubble() -> storageService.updateBubble(), confirmed directly:
      // the same probe observed storageService.updateBubble called once, ~1s after typing, with
      // the exact edited content) -- there is no separate "Update" button in the dialog (same
      // 6-button inventory as above). Wait for the debounced save to actually fire rather than
      // looking for a button that doesn't exist.
      await waitFor(() => {
        expect(storageService.updateBubble).toHaveBeenCalledWith(
          expect.objectContaining({ content: 'My updated thought bubble' })
        );
      }, { timeout: 2000 });

      // 4. Verify update (canvas re-renders once updateBubble's local store `set()` runs)
      await waitFor(() => {
        expect(screen.getByText(bubbleLabel('My updated thought bubble'))).toBeInTheDocument();
      });

      // BubbleDetail never auto-closes itself (no equivalent of a legacy "Save & close" -- the
      // Textarea's onChange only ever schedules the debounced save above); Radix's Dialog
      // overlay sets pointer-events:none on the rest of the page while open, so the canvas is
      // unclickable until the dialog closes. Confirmed directly: re-clicking the canvas with the
      // dialog still open throws "Unable to perform pointer interaction... pointer-events: none"
      // rather than reaching the delete flow at all. Close it the same way a real user would --
      // the "Done" button -- before interacting with the canvas again.
      const doneButton = screen.getByRole('button', { name: /done/i });
      await user.click(doneButton);

      // 5. Delete the bubble. Re-query by the bubble's current (updated) label -- the `bubble`
      // reference above points at now-stale "My first thought bubble" DOM text that no longer
      // exists post-edit; reusing it here would silently click a detached node.
      const updatedBubble = screen.getByText(bubbleLabel('My updated thought bubble'));
      await user.click(updatedBubble);

      // NOT FIXED HERE -- a real, distinct, precisely-diagnosed gap, left honestly failing (same
      // standing practice as Run 90's mood-button gap). Confirmed directly via the same button
      // dump: BubbleDetail's delete control (<Button variant="destructive"><Trash2 /></Button>,
      // no text, no aria-label) has an EMPTY accessible name, so no role="button" name query can
      // ever find it -- not a wrong-label issue like the Edit/Update fixes above. Every other
      // icon-only button in this codebase sets an explicit aria-label (the capture FAB:
      // "Capture thought"; the view toggles: "Bubble view mode" / "Atomic view mode") -- this one
      // alone doesn't, reading like an oversight rather than a deliberate omission. Separately,
      // handleDelete() in BubbleDetail.tsx calls deleteBubble() immediately with zero confirmation
      // step, so even a correctly-named Delete button would never reach a "confirm" button either
      // -- a genuine product-UX question (is immediate delete intentional?), not a test bug.
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      const confirmDelete = screen.getByRole('button', { name: /confirm/i });
      await user.click(confirmDelete);

      // 6. Verify deletion
      await waitFor(() => {
        expect(screen.queryByText(bubbleLabel('My updated thought bubble'))).not.toBeInTheDocument();
      });
    });
  });

  describe('AI-Powered Workflows', () => {
    it('should generate CBT reframe for negative thought', async () => {
      const user = userEvent.setup();
      renderApp();

      // Navigate to CBT worksheet
      const cbtLink = screen.getByRole('link', { name: /cbt/i });
      await user.click(cbtLink);

      // Enter a negative thought
      const thoughtInput = screen.getByPlaceholderText(/enter your thought/i);
      await user.type(thoughtInput, 'I always fail at everything');

      // Select distortion
      const distortionSelect = screen.getByRole('combobox', { name: /distortions/i });
      await user.click(distortionSelect);
      
      const allOrNothingOption = screen.getByText('All-or-Nothing Thinking');
      await user.click(allOrNothingOption);

      // Generate reframe
      const reframeButton = screen.getByRole('button', { name: /generate reframe/i });
      await user.click(reframeButton);

      // Verify AI-generated reframe appears
      await waitFor(() => {
        expect(screen.getByText(/more balanced perspective/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should receive personalized glimmer notification', async () => {
      const user = userEvent.setup();
      renderApp();

      // Create a mood bubble indicating stress
      const captureButton = screen.getByRole('button', { name: /capture thought/i });
      await user.click(captureButton);

      const moodButton = screen.getByRole('button', { name: /mood/i });
      await user.click(moodButton);

      const stressButton = screen.getByRole('button', { name: /stressed/i });
      await user.click(stressButton);

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Wait for glimmer notification to appear
      await waitFor(() => {
        expect(screen.getByText(/gentle reminder/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify "because" explanation
      const becauseButton = screen.getByRole('button', { name: /because/i });
      await user.click(becauseButton);

      expect(screen.getByText(/detected stress/i)).toBeInTheDocument();
    });
  });

  describe('Search and Navigation', () => {
    it('should perform semantic search across bubbles', async () => {
      const user = userEvent.setup();
      renderApp();

      // Create several bubbles with different content
      const thoughts = [
        'Feeling anxious about tomorrow',
        'Great meeting with the team',
        'Worried about the presentation',
        'Excited about weekend plans'
      ];

      for (const thought of thoughts) {
        const captureButton = screen.getByRole('button', { name: /capture thought/i });
        await user.click(captureButton);

        const textMenuItem = screen.getByRole('button', { name: 'Text' });
        await user.click(textMenuItem);

        const textInput = screen.getByPlaceholderText(/what's on your mind/i);
        await user.type(textInput, thought);

        const saveButton = screen.getByRole('button', { name: /save/i });
        await user.click(saveButton);
        
        // Wait for bubble to be created. Its on-canvas label is the app's own
        // truncated form (see bubbleLabel() above), not the raw `thought` string --
        // all four fixtures here are longer than the 20-char truncation threshold.
        await waitFor(() => {
          expect(screen.getByText(bubbleLabel(thought))).toBeInTheDocument();
        });
      }

      // Open search
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Search for emotional content
      const searchInput = screen.getByPlaceholderText(/search your thoughts/i);
      await user.type(searchInput, 'anxious feelings');

      // Verify relevant results appear
      await waitFor(() => {
        expect(screen.getByText('Feeling anxious about tomorrow')).toBeInTheDocument();
        expect(screen.getByText('Worried about the presentation')).toBeInTheDocument();
      });

      // Verify irrelevant results don't appear
      expect(screen.queryByText('Great meeting with the team')).not.toBeInTheDocument();
    });

    it('should navigate temporal layers', async () => {
      const user = userEvent.setup();
      renderApp();

      // Open temporal navigation
      const temporalButton = screen.getByRole('button', { name: /time view/i });
      await user.click(temporalButton);

      // Switch to week view
      const weekButton = screen.getByRole('button', { name: /week/i });
      await user.click(weekButton);

      // Verify week view is active
      expect(screen.getByText(/week view/i)).toBeInTheDocument();

      // Switch to month view
      const monthButton = screen.getByRole('button', { name: /month/i });
      await user.click(monthButton);

      // Verify month view is active
      expect(screen.getByText(/month view/i)).toBeInTheDocument();
    });
  });

  describe('Cross-Device Sync Workflow', () => {
    it('should handle sync conflict resolution', async () => {
      const user = userEvent.setup();
      renderApp();

      // Simulate sync conflict appearing
      // This would typically be triggered by actual sync service
      const conflictNotification = screen.getByText(/sync conflict detected/i);
      await user.click(conflictNotification);

      // Choose resolution option
      const keepLocalButton = screen.getByRole('button', { name: /keep local/i });
      await user.click(keepLocalButton);

      // Verify conflict is resolved
      await waitFor(() => {
        expect(screen.queryByText(/sync conflict/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Plugin Management Workflow', () => {
    it('should install and manage plugins', async () => {
      const user = userEvent.setup();
      renderApp();

      // Navigate to settings
      const settingsLink = screen.getByRole('link', { name: /settings/i });
      await user.click(settingsLink);

      // Open plugin manager
      const pluginButton = screen.getByRole('button', { name: /manage plugins/i });
      await user.click(pluginButton);

      // Install a plugin
      const installButton = screen.getByRole('button', { name: /install plugin/i });
      await user.click(installButton);

      // Verify plugin appears in list
      await waitFor(() => {
        expect(screen.getByText(/grocery helper/i)).toBeInTheDocument();
      });

      // Toggle plugin on/off
      const pluginToggle = screen.getByRole('switch', { name: /grocery helper/i });
      await user.click(pluginToggle);

      // Verify toggle state changed
      expect(pluginToggle).toBeChecked();
    });
  });

  describe('Privacy and Security Workflow', () => {
    it('should enable biometric protection', async () => {
      const user = userEvent.setup();
      renderApp();

      // Navigate to settings
      const settingsLink = screen.getByRole('link', { name: /settings/i });
      await user.click(settingsLink);

      // Enable biometric lock
      const biometricToggle = screen.getByRole('switch', { name: /biometric/i });
      await user.click(biometricToggle);

      // Verify biometric prompt appears
      expect(screen.getByText(/authenticate/i)).toBeInTheDocument();

      // Simulate successful authentication
      const authenticateButton = screen.getByRole('button', { name: /authenticate/i });
      await user.click(authenticateButton);

      // Verify biometric is enabled
      await waitFor(() => {
        expect(biometricToggle).toBeChecked();
      });
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain responsiveness with 100+ bubbles', async () => {
      const user = userEvent.setup();
      renderApp();

      const startTime = performance.now();

      // Create 100 bubbles rapidly
      for (let i = 0; i < 100; i++) {
        const store = useBubbleStore.getState();
        await store.addBubble({
          id: `load-test-${i}`,
          type: 'Thought',
          content: `Load test bubble ${i}`,
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          size: 1,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in under 5 seconds even with 100 bubbles
      expect(duration).toBeLessThan(5000);

      // Canvas should still be responsive
      const canvas = screen.getByTestId('bubble-canvas');
      await user.click(canvas);

      // Click should register within reasonable time
      expect(canvas).toHaveFocus();
    });
  });
});