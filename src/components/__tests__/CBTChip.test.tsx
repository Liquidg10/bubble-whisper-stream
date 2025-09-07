import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CBTChip } from '../CBTChip';
import type { CBTAction } from '@/ai/cbt/types';

// Mock services
vi.mock('@/services/cbtCopyService', () => ({
  cbtCopyService: {
    getChipCopy: vi.fn(() => ({
      promptText: 'Want to explore this together?',
      primaryAction: 'Yes, please',
      dismissAction: 'Not right now',
      explainability: 'because you used absolute language'
    })),
    recordVariantInteraction: vi.fn()
  }
}));

vi.mock('@/services/tts', () => ({
  ttsService: {
    isAvailable: () => true,
    speak: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('@/utils/copyPolish', () => ({
  polishCopy: vi.fn((text) => text.replace('CBT', 'check-in'))
}));

describe('CBTChip', () => {
  const mockAction: CBTAction = {
    type: 'gentle_chip',
    title: 'Another way to see this',
    description: 'Consider that there might be middle ground here.',
    actions: [
      { label: 'Explore this', type: 'primary' },
      { label: 'Not now', type: 'secondary' }
    ],
    explainability: 'because you used absolute language like "always"'
  };

  const mockOnEngage = vi.fn();
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chip with enhanced copy', () => {
    render(
      <CBTChip
        action={mockAction}
        onEngage={mockOnEngage}
        onDismiss={mockOnDismiss}
        traceId="trace-123"
        compact={false}
      />
    );

    expect(screen.getByText('Want to explore this together?')).toBeInTheDocument();
    expect(screen.getByText('Yes, please')).toBeInTheDocument();
    expect(screen.getByText('Not right now')).toBeInTheDocument();
  });

  it('shows explainability with polished copy', () => {
    render(
      <CBTChip
        action={mockAction}
        onEngage={mockOnEngage}
        onDismiss={mockOnDismiss}
        traceId="trace-123"
        compact={false}
      />
    );

    expect(screen.getByText(/because you used absolute language/)).toBeInTheDocument();
  });

  it('handles engagement interaction', async () => {
    render(
      <CBTChip
        action={mockAction}
        onEngage={mockOnEngage}
        onDismiss={mockOnDismiss}
        traceId="trace-123"
        compact={false}
      />
    );

    const engageButton = screen.getByText('Yes, please');
    fireEvent.click(engageButton);

    await waitFor(() => {
      expect(mockOnEngage).toHaveBeenCalledWith('trace-123', true);
    });
  });

  it('handles dismissal interaction', async () => {
    render(
      <CBTChip
        action={mockAction}
        onEngage={mockOnEngage}
        onDismiss={mockOnDismiss}
        traceId="trace-123"
        compact={false}
      />
    );

    const dismissButton = screen.getByText('Not right now');
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(mockOnDismiss).toHaveBeenCalledWith('trace-123', false);
    });
  });

  it('provides TTS read-back when available', async () => {
    const { ttsService } = await import('@/services/tts');
    
    render(
      <CBTChip
        action={mockAction}
        onEngage={mockOnEngage}
        onDismiss={mockOnDismiss}
        traceId="trace-123"
        compact={false}
      />
    );

    const ttsButton = screen.getByRole('button', { name: /read kindly/i });
    fireEvent.click(ttsButton);

    await waitFor(() => {
      expect(ttsService.speak).toHaveBeenCalledWith(
        expect.stringContaining('Want to explore this together')
      );
    });
  });

  it('renders compact variant', () => {
    render(
      <CBTChip
        action={mockAction}
        onEngage={mockOnEngage}
        onDismiss={mockOnDismiss}
        traceId="trace-123"
        compact={true}
      />
    );

    const chipElement = screen.getByRole('article');
    expect(chipElement).toHaveClass('compact');
  });

  it('handles crisis support action type', () => {
    const crisisAction: CBTAction = {
      type: 'crisis_support',
      title: 'You\'re not alone',
      description: 'Here are some resources that can help right now.',
      resources: [
        { name: 'Crisis Text Line', contact: 'Text HOME to 741741', type: 'immediate' }
      ],
      priority: 'immediate'
    };

    render(
      <CBTChip
        action={crisisAction}
        onEngage={mockOnEngage}
        onDismiss={mockOnDismiss}
        traceId="trace-123"
        compact={false}
      />
    );

    expect(screen.getByText('You\'re not alone')).toBeInTheDocument();
    expect(screen.getByText('Crisis Text Line')).toBeInTheDocument();
  });

  it('records copy variant interaction on engagement', async () => {
    const { cbtCopyService } = await import('@/services/cbtCopyService');
    
    render(
      <CBTChip
        action={mockAction}
        onEngage={mockOnEngage}
        onDismiss={mockOnDismiss}
        traceId="trace-123"
        compact={false}
      />
    );

    const engageButton = screen.getByText('Yes, please');
    fireEvent.click(engageButton);

    await waitFor(() => {
      expect(cbtCopyService.recordVariantInteraction).toHaveBeenCalledWith(
        expect.any(String), // variant ID
        'engaged',
        'trace-123'
      );
    });
  });

  it('applies reduced motion when preferred', () => {
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

    render(
      <CBTChip
        action={mockAction}
        onEngage={mockOnEngage}
        onDismiss={mockOnDismiss}
        traceId="trace-123"
        compact={false}
      />
    );

    const chipElement = screen.getByRole('article');
    expect(chipElement).toHaveClass('motion-reduce');
  });
});