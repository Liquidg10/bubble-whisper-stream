import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { useBubbleStore } from '@/stores/bubbleStore';

// Mock all external services
vi.mock('@/services/crossDeviceSyncService');
vi.mock('@/services/advancedAIService');
vi.mock('@/services/vectorSearchService');

const renderApp = () => {
  return render(<App />);
};

describe('End-to-End User Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
        expect(screen.getByText('My first thought bubble')).toBeInTheDocument();
      });

      // 3. Edit the bubble
      const bubble = screen.getByText('My first thought bubble');
      await user.click(bubble);

      const editButton = screen.getByRole('button', { name: /edit/i });
      await user.click(editButton);

      const editInput = screen.getByDisplayValue('My first thought bubble');
      await user.clear(editInput);
      await user.type(editInput, 'My updated thought bubble');

      const updateButton = screen.getByRole('button', { name: /update/i });
      await user.click(updateButton);

      // 4. Verify update
      await waitFor(() => {
        expect(screen.getByText('My updated thought bubble')).toBeInTheDocument();
      });

      // 5. Delete the bubble
      await user.click(bubble);
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      const confirmDelete = screen.getByRole('button', { name: /confirm/i });
      await user.click(confirmDelete);

      // 6. Verify deletion
      await waitFor(() => {
        expect(screen.queryByText('My updated thought bubble')).not.toBeInTheDocument();
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
        
        // Wait for bubble to be created
        await waitFor(() => {
          expect(screen.getByText(thought)).toBeInTheDocument();
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