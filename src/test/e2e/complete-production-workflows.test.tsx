import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { useBubbleStore } from '@/stores/bubbleStore';
import { crossDeviceSyncService } from '@/services/crossDeviceSyncService';
import { modalityService } from '@/services/modalityService';

// Mock all external services
vi.mock('@/stores/bubbleStore');
vi.mock('@/services/crossDeviceSyncService');
vi.mock('@/services/modalityService');
vi.mock('@/integrations/supabase/client');

const renderApp = () => {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
};

describe('Complete Production Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock bubble store
    (useBubbleStore as any).mockReturnValue({
      bubbles: [],
      selectedBubbles: [],
      isLoading: false,
      addBubble: vi.fn(),
      updateBubble: vi.fn(),
      deleteBubble: vi.fn(),
      selectBubble: vi.fn(),
      clearSelection: vi.fn(),
      mergeBubbles: vi.fn()
    });

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

  describe('End-to-End User Journey', () => {
    it('should complete full user workflow from onboarding to collaboration', async () => {
      const user = userEvent.setup();
      renderApp();

      // 1. Initial load and onboarding
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });

      // 2. Create first bubble via radial capture
      const radialButton = screen.getByRole('button', { name: /add bubble/i });
      await user.click(radialButton);

      // Simulate text input
      const textInput = screen.getByPlaceholderText(/what's on your mind/i);
      await user.type(textInput, 'My first thought bubble');
      
      const createButton = screen.getByRole('button', { name: /create/i });
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
      const radialButton = screen.getByRole('button', { name: /add bubble/i });
      await user.click(radialButton);

      const textInput = screen.getByPlaceholderText(/what's on your mind/i);
      await user.type(textInput, 'Offline bubble');
      
      const createButton = screen.getByRole('button', { name: /create/i });
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
      const radialButton = screen.getByRole('button', { name: /add bubble/i });
      await user.click(radialButton);

      const textInput = screen.getByPlaceholderText(/what's on your mind/i);
      await user.type(textInput, 'I feel overwhelmed with work today');
      
      // Enable AI analysis
      const aiToggle = screen.getByRole('switch', { name: /ai analysis/i });
      await user.click(aiToggle);

      const createButton = screen.getByRole('button', { name: /create/i });
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

      (useBubbleStore as any).mockReturnValue({
        bubbles: largeBubbleSet,
        selectedBubbles: [],
        isLoading: false,
        addBubble: vi.fn(),
        updateBubble: vi.fn(),
        deleteBubble: vi.fn(),
        selectBubble: vi.fn(),
        clearSelection: vi.fn(),
        mergeBubbles: vi.fn()
      });

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
      
      // Mock storage error
      (useBubbleStore as any).addBubble = vi.fn().mockRejectedValue(
        new Error('Storage quota exceeded')
      );

      renderApp();

      // Attempt to create bubble
      const radialButton = screen.getByRole('button', { name: /add bubble/i });
      await user.click(radialButton);

      const textInput = screen.getByPlaceholderText(/what's on your mind/i);
      await user.type(textInput, 'Test bubble');
      
      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      // Verify error handling and recovery options
      await waitFor(() => {
        expect(screen.getByText(/storage error/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /clear cache/i })).toBeInTheDocument();
    });
  });
});