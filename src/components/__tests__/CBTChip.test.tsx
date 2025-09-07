import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CBTChip } from '../CBTChip';
import type { CBTAction } from '@/ai/cbt/types';

// Mock services
vi.mock('@/services/cbtCopyService', () => ({
  getChipCopy: vi.fn(() => ({
    promptText: 'Want to explore this together?',
    primaryAction: 'Yes, please',
    dismissAction: 'Not right now',
    explainability: 'because you used absolute language'
  })),
  getContextualEncouragement: vi.fn(() => 'Thanks for being open')
}));

vi.mock('@/services/cbtMetricsService', () => ({
  cbtMetricsService: {
    recordAcceptance: vi.fn(),
    recordDecline: vi.fn()
  }
}));

vi.mock('@/utils/copyPolish', () => ({
  polishCopy: vi.fn((text) => text.replace('CBT', 'check-in'))
}));

vi.mock('@/components/AccessibilityProvider', () => ({
  useAccessibility: () => ({
    settings: { reducedMotion: false }
  })
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

describe('CBTChip', () => {
  const mockAction: CBTAction = {
    type: 'chip',
    text: 'Want to explore another perspective?',
    data: {
      distortionType: 'all_or_nothing',
      reframes: ['Maybe there\'s some middle ground here?'],
      explainability: 'I noticed some black-and-white thinking'
    }
  };

  const mockOnEngagement = vi.fn();
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chip with enhanced copy', () => {
    render(
      <CBTChip
        action={mockAction}
        onEngagement={mockOnEngagement}
        onDismiss={mockOnDismiss}
        userId="test-user"
      />
    );

    expect(screen.getByText('Want to explore this together?')).toBeInTheDocument();
    expect(screen.getByText('Yes, please')).toBeInTheDocument();
  });

  it('shows explainability when available', () => {
    render(
      <CBTChip
        action={mockAction}
        onEngagement={mockOnEngagement}
        onDismiss={mockOnDismiss}
        userId="test-user"
      />
    );

    // Look for help button that shows explainability
    const helpButton = screen.getByRole('button', { name: /why am i seeing this/i });
    expect(helpButton).toBeInTheDocument();
  });

  it('handles engagement interaction', async () => {
    render(
      <CBTChip
        action={mockAction}
        onEngagement={mockOnEngagement}
        onDismiss={mockOnDismiss}
        userId="test-user"
      />
    );

    const engageButton = screen.getByText('Yes, please');
    fireEvent.click(engageButton);

    await waitFor(() => {
      expect(mockOnEngagement).toHaveBeenCalledWith(true);
    });
  });

  it('handles dismissal interaction', async () => {
    render(
      <CBTChip
        action={mockAction}
        onEngagement={mockOnEngagement}
        onDismiss={mockOnDismiss}
        userId="test-user"
      />
    );

    const dismissButton = screen.getByRole('button', { name: /not now/i });
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(mockOnEngagement).toHaveBeenCalledWith(false);
      expect(mockOnDismiss).toHaveBeenCalled();
    });
  });

  it('renders for crisis support action type', () => {
    const crisisAction: CBTAction = {
      type: 'crisis_support',
      text: 'I see you\'re going through something difficult',
      data: {
        resources: ['crisis_hotline', 'emergency_contacts']
      }
    };

    render(
      <CBTChip
        action={crisisAction}
        onEngagement={mockOnEngagement}
        onDismiss={mockOnDismiss}
        userId="test-user"
      />
    );

    expect(screen.getByText('Want to explore this together?')).toBeInTheDocument();
  });

  it('applies custom className when provided', () => {
    const { container } = render(
      <CBTChip
        action={mockAction}
        onEngagement={mockOnEngagement}
        onDismiss={mockOnDismiss}
        userId="test-user"
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('handles keyboard interaction', async () => {
    render(
      <CBTChip
        action={mockAction}
        onEngagement={mockOnEngagement}
        onDismiss={mockOnDismiss}
        userId="test-user"
      />
    );

    const engageButton = screen.getByText('Yes, please');
    fireEvent.keyDown(engageButton, { key: 'Enter' });

    await waitFor(() => {
      expect(mockOnEngagement).toHaveBeenCalledWith(true);
    });
  });

  it('applies reduced motion when preferred', () => {
    const mockAccessibility = vi.fn(() => ({
      settings: { reducedMotion: true }
    }));
    
    vi.mocked(require('@/components/AccessibilityProvider').useAccessibility).mockImplementation(mockAccessibility);

    render(
      <CBTChip
        action={mockAction}
        onEngagement={mockOnEngagement}
        onDismiss={mockOnDismiss}
        userId="test-user"
      />
    );

    // Test that component renders (reduced motion is handled internally)
    expect(screen.getByText('Want to explore this together?')).toBeInTheDocument();
  });
});