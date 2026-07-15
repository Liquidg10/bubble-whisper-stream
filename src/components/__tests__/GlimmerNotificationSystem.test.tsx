import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import { GlimmerNotificationSystem } from '../GlimmerNotificationSystem';

// Mock the glimmer service, accessibility provider, and bubble store.
// vi.mock factories are hoisted above top-level const declarations, so each
// mock object must be created via vi.hoisted() -- referencing a plain const
// here throws "Cannot access before initialization" at module load time.
const { mockGlimmerService, mockAccessibility, mockBubbleStore } = vi.hoisted(() => ({
  mockGlimmerService: {
    shouldTriggerGlimmer: vi.fn(() => true),
    generateGlimmer: vi.fn(() => Promise.resolve({
      id: 'glimmer-1',
      tone: 'supportive' as const, // was 'Friend', not a valid GlimmerTone -- crashed TONE_ICONS[tone] lookup
      message: 'You\'re doing great! Remember that progress isn\'t always linear.',
      cause: 'consistent_activity',
      createdAt: Date.now(),
      deliveredVia: 'text' as const,
    })),
    // real GlimmerNotificationSystem.tsx:64 calls glimmerService.dismissGlimmer(id) on
    // dismiss; this mock omitted it entirely -- unhandled "not a function" rejection.
    dismissGlimmer: vi.fn(() => Promise.resolve()),
  },
  // useAccessibility() actually returns { settings, updateSetting, announceText }
  // -- the component reads settings.reducedMotion; the previous mock only had
  // announceText, which crashed rendering with "Cannot read properties of
  // undefined (reading 'reducedMotion')" once the hoisting bug above was fixed.
  mockAccessibility: {
    settings: {
      dyslexiaFriendly: false,
      highContrast: false,
      reducedMotion: false,
      voiceNavigation: false,
      largeText: false,
      focusIndicators: false,
    },
    updateSetting: vi.fn(),
    announceText: vi.fn(),
  },
  mockBubbleStore: {
    settings: {
      intelligenceEnabled: true,
      glimmersEnabled: true,
      ttsEnabled: true,
    },
  },
}));

vi.mock('@/services/glimmerService', () => ({
  glimmerService: mockGlimmerService,
}));

vi.mock('@/components/AccessibilityProvider', () => ({
  useAccessibility: () => mockAccessibility,
}));

vi.mock('@/stores/bubbleStore', () => ({
  useBubbleStore: () => mockBubbleStore,
}));

describe('GlimmerNotificationSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when intelligence is disabled', () => {
    mockBubbleStore.settings.intelligenceEnabled = false;
    
    const { container } = render(<GlimmerNotificationSystem />);
    expect(container.firstChild).toBeNull();
  });

  it('generates glimmers when conditions are met', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    mockBubbleStore.settings.glimmersEnabled = true;

    render(<GlimmerNotificationSystem />);

    // Fast-forward past the initial check interval
    vi.advanceTimersByTime(900000); // 15 minutes

    await vi.waitFor(() => {
      expect(mockGlimmerService.shouldTriggerGlimmer).toHaveBeenCalled();
    });
  });

  it('displays active glimmers with proper styling', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    
    render(<GlimmerNotificationSystem />);

    // Trigger glimmer generation
    vi.advanceTimersByTime(900000);

    await vi.waitFor(() => {
      expect(screen.getByText(/You're doing great!/)).toBeInTheDocument();
    });

    // Check for proper tone badge
    expect(screen.getByText('Trusted Friend')).toBeInTheDocument();
  });

  it('handles glimmer dismissal', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    
    render(<GlimmerNotificationSystem />);

    // Wait for glimmer to appear
    vi.advanceTimersByTime(900000);

    await vi.waitFor(() => {
      expect(screen.getByText(/You're doing great!/)).toBeInTheDocument();
    });

    // Dismiss the glimmer
    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissButton);

    await vi.waitFor(() => {
      expect(screen.queryByText(/You're doing great!/)).not.toBeInTheDocument();
    });
  });

  it('respects quiet hours settings', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    mockBubbleStore.settings.glimmersEnabled = true;
    
    // Mock current time to be in quiet hours (11 PM)
    const mockDate = new Date();
    mockDate.setHours(23, 0, 0, 0);
    vi.setSystemTime(mockDate);

    mockGlimmerService.shouldTriggerGlimmer.mockReturnValue(false);

    render(<GlimmerNotificationSystem />);

    vi.advanceTimersByTime(900000);

    await vi.waitFor(() => {
      expect(mockGlimmerService.shouldTriggerGlimmer).toHaveBeenCalled();
    });

    // Should not generate glimmer during quiet hours
    expect(mockGlimmerService.generateGlimmer).not.toHaveBeenCalled();
  });

  it('announces glimmers to screen readers', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    
    render(<GlimmerNotificationSystem />);

    vi.advanceTimersByTime(900000);

    await vi.waitFor(() => {
      expect(mockAccessibility.announceText).toHaveBeenCalledWith(
        expect.stringContaining('New glimmer')
      );
    });
  });

  it('handles TTS playback for glimmers', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    mockBubbleStore.settings.ttsEnabled = true;
    
    const mockTTS = {
      speak: vi.fn(() => Promise.resolve()),
      isAvailable: () => true,
    };

    vi.doMock('@/services/tts', () => ({
      ttsService: mockTTS,
    }));

    render(<GlimmerNotificationSystem />);

    vi.advanceTimersByTime(900000);

    await vi.waitFor(() => {
      expect(screen.getByText(/You're doing great!/)).toBeInTheDocument();
    });

    // Click speak button
    const speakButton = screen.getByRole('button', { name: /speak/i });
    fireEvent.click(speakButton);

    await vi.waitFor(() => {
      expect(mockTTS.speak).toHaveBeenCalledWith(
        expect.stringContaining('You\'re doing great!')
      );
    });
  });

  it('respects frequency caps', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    
    render(<GlimmerNotificationSystem />);

    // Trigger multiple times rapidly
    vi.advanceTimersByTime(900000); // First trigger
    vi.advanceTimersByTime(900000); // Second trigger within cap window

    // Should only call generate once due to frequency cap
    await vi.waitFor(() => {
      expect(mockGlimmerService.generateGlimmer).toHaveBeenCalledTimes(1);
    });
  });
});