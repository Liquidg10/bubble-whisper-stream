import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import { GlimmerNotificationSystem } from '../GlimmerNotificationSystem';

// Mock the glimmer service, accessibility provider, and bubble store.
// vi.mock factories are hoisted above top-level const declarations, so each
// mock object must be created via vi.hoisted() -- referencing a plain const
// here throws "Cannot access before initialization" at module load time.
const { mockGlimmerService, mockAccessibility, mockBubbleStore, mockTTS } = vi.hoisted(() => ({
  mockGlimmerService: {
    shouldTriggerGlimmer: vi.fn(() => true),
    generateGlimmer: vi.fn(),
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
  mockTTS: {
    speak: vi.fn(() => Promise.resolve()),
    isAvailable: vi.fn(() => true),
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

vi.mock('@/services/tts', () => ({
  ttsService: mockTTS,
}));

const makeGlimmer = () => ({
  id: 'glimmer-1',
  tone: 'supportive' as const,
  message: 'You\'re doing great! Remember that progress isn\'t always linear.',
  cause: 'consistent_activity',
  createdAt: Date.now(),
  deliveredVia: 'text' as const,
});

async function flushGlimmerCheck() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('GlimmerNotificationSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockBubbleStore.settings.intelligenceEnabled = true;
    mockBubbleStore.settings.glimmersEnabled = true;
    mockBubbleStore.settings.ttsEnabled = true;
    mockGlimmerService.shouldTriggerGlimmer.mockReturnValue(true);
    mockGlimmerService.generateGlimmer.mockImplementation(async () =>
      mockGlimmerService.shouldTriggerGlimmer() ? makeGlimmer() : null
    );
    mockGlimmerService.dismissGlimmer.mockResolvedValue(undefined);
    mockTTS.speak.mockResolvedValue(undefined);
    mockTTS.isAvailable.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when intelligence is disabled', () => {
    mockBubbleStore.settings.intelligenceEnabled = false;
    
    const { container } = render(<GlimmerNotificationSystem />);
    expect(container.firstChild).toBeNull();
    expect(mockGlimmerService.generateGlimmer).not.toHaveBeenCalled();
  });

  it('generates glimmers when conditions are met', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    mockBubbleStore.settings.glimmersEnabled = true;

    render(<GlimmerNotificationSystem />);

    await flushGlimmerCheck();

    expect(mockGlimmerService.shouldTriggerGlimmer).toHaveBeenCalledTimes(1);
    expect(mockGlimmerService.generateGlimmer).toHaveBeenCalledTimes(1);
  });

  it('displays active glimmers with proper styling', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    
    render(<GlimmerNotificationSystem />);

    await flushGlimmerCheck();

    expect(screen.getByText(/You're doing great!/)).toBeInTheDocument();

    expect(screen.getByText('Assistant')).toBeInTheDocument();
    expect(screen.getByText('Glimmer')).toBeInTheDocument();
  });

  it('handles glimmer dismissal', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    
    render(<GlimmerNotificationSystem />);

    await flushGlimmerCheck();
    expect(screen.getByText(/You're doing great!/)).toBeInTheDocument();

    // Dismiss the glimmer
    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    await act(async () => {
      fireEvent.click(dismissButton);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.queryByText(/You're doing great!/)).not.toBeInTheDocument();
    expect(mockGlimmerService.dismissGlimmer).toHaveBeenCalledWith('glimmer-1');
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

    await flushGlimmerCheck();

    expect(mockGlimmerService.shouldTriggerGlimmer).toHaveBeenCalledTimes(1);
    expect(mockAccessibility.announceText).not.toHaveBeenCalled();
    expect(screen.queryByText(/You're doing great!/)).not.toBeInTheDocument();
  });

  it('announces glimmers to screen readers', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    
    render(<GlimmerNotificationSystem />);

    await flushGlimmerCheck();

    expect(mockAccessibility.announceText).toHaveBeenCalledWith(
      expect.stringContaining('New glimmer')
    );
  });

  it('handles TTS playback for glimmers', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    mockBubbleStore.settings.ttsEnabled = true;
    
    render(<GlimmerNotificationSystem />);

    await flushGlimmerCheck();
    expect(screen.getByText(/You're doing great!/)).toBeInTheDocument();

    const speakButton = screen.getByRole('button', { name: /read glimmer aloud/i });
    await act(async () => {
      fireEvent.click(speakButton);
      await Promise.resolve();
    });

    expect(mockTTS.speak).toHaveBeenCalledWith(
      expect.stringContaining('You\'re doing great!'),
      expect.objectContaining({ interrupt: true })
    );
  });

  it('respects frequency caps', async () => {
    mockBubbleStore.settings.intelligenceEnabled = true;
    mockGlimmerService.shouldTriggerGlimmer
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    
    render(<GlimmerNotificationSystem />);

    await flushGlimmerCheck();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(mockGlimmerService.shouldTriggerGlimmer).toHaveBeenCalledTimes(3);
    expect(mockAccessibility.announceText).toHaveBeenCalledTimes(1);
  });
});
