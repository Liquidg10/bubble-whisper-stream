import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CBTOnboardingBanner } from '../CBTOnboardingBanner';

// Mock stores
const mockUpdateSettings = vi.fn();
const mockUpdateOnboarding = vi.fn();

vi.mock('@/stores/bubbleStore', () => ({
  useBubbleStore: vi.fn(() => ({
    cbtSettings: {
      assistLevel: 'ask',
      autoLogMode: 'ask',
      cbtAssistEnabled: true
    },
    cbtOnboardingState: {
      hasShownBanner: false,
      bannerDismissedAt: undefined,
      initialChoice: undefined,
      onboardingCompleted: false
    },
    updateCBTSettings: mockUpdateSettings,
    updateCBTOnboardingState: mockUpdateOnboarding
  }))
}));

vi.mock('@/config/flags', () => ({
  isFeatureEnabled: vi.fn((flag) => flag === 'cbtAssist')
}));

describe('CBTOnboardingBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders onboarding banner when not shown before', () => {
    render(<CBTOnboardingBanner />);

    expect(screen.getByText('Would you like gentle check-ins?')).toBeInTheDocument();
    expect(screen.getByText(/I've noticed some patterns/)).toBeInTheDocument();
    expect(screen.getByText('No thanks')).toBeInTheDocument();
    expect(screen.getByText('Ask me first')).toBeInTheDocument();
    expect(screen.getByText('Yes, please')).toBeInTheDocument();
  });

  it('does not render when banner already shown', () => {
    vi.mocked(require('@/stores/bubbleStore').useBubbleStore).mockReturnValue({
      cbtSettings: { assistLevel: 'ask', autoLogMode: 'ask', cbtAssistEnabled: true },
      cbtOnboardingState: {
        hasShownBanner: true,
        bannerDismissedAt: Date.now() - 1000,
        initialChoice: 'ask',
        onboardingCompleted: true
      },
      updateCBTSettings: mockUpdateSettings,
      updateCBTOnboardingState: mockUpdateOnboarding
    });

    render(<CBTOnboardingBanner />);

    expect(screen.queryByText('Would you like gentle check-ins?')).not.toBeInTheDocument();
  });

  it('does not render when CBT feature disabled', () => {
    vi.mocked(require('@/config/flags').isFeatureEnabled).mockReturnValue(false);

    render(<CBTOnboardingBanner />);

    expect(screen.queryByText('Would you like gentle check-ins?')).not.toBeInTheDocument();
  });

  it('handles "No thanks" selection', async () => {
    render(<CBTOnboardingBanner />);

    const noThanksButton = screen.getByText('No thanks');
    fireEvent.click(noThanksButton);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        assistLevel: 'off',
        cbtAssistEnabled: false
      });
      expect(mockUpdateOnboarding).toHaveBeenCalledWith({
        hasShownBanner: true,
        bannerDismissedAt: expect.any(Number),
        initialChoice: 'off',
        onboardingCompleted: true
      });
    });
  });

  it('handles "Ask me first" selection', async () => {
    render(<CBTOnboardingBanner />);

    const askFirstButton = screen.getByText('Ask me first');
    fireEvent.click(askFirstButton);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        assistLevel: 'subtle',
        cbtAssistEnabled: true
      });
      expect(mockUpdateOnboarding).toHaveBeenCalledWith({
        hasShownBanner: true,
        bannerDismissedAt: expect.any(Number),
        initialChoice: 'ask',
        onboardingCompleted: true
      });
    });
  });

  it('handles "Yes, please" selection', async () => {
    render(<CBTOnboardingBanner />);

    const yesPleaseButton = screen.getByText('Yes, please');
    fireEvent.click(yesPleaseButton);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        assistLevel: 'standard',
        cbtAssistEnabled: true
      });
      expect(mockUpdateOnboarding).toHaveBeenCalledWith({
        hasShownBanner: true,
        bannerDismissedAt: expect.any(Number),
        initialChoice: 'on',
        onboardingCompleted: true
      });
    });
  });

  it('includes privacy information links', () => {
    render(<CBTOnboardingBanner />);

    expect(screen.getByText('Learn about your data')).toBeInTheDocument();
    expect(screen.getByText('Delete everything')).toBeInTheDocument();
  });

  it('can be dismissed without making choice', async () => {
    render(<CBTOnboardingBanner />);

    const dismissButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(mockUpdateOnboarding).toHaveBeenCalledWith({
        hasShownBanner: true,
        bannerDismissedAt: expect.any(Number),
        initialChoice: undefined,
        onboardingCompleted: false
      });
    });
  });

  it('respects 7-day dismissal cooldown', () => {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    vi.mocked(require('@/stores/bubbleStore').useBubbleStore).mockReturnValue({
      cbtSettings: { assistLevel: 'ask', autoLogMode: 'ask', cbtAssistEnabled: true },
      cbtOnboardingState: {
        hasShownBanner: true,
        bannerDismissedAt: sevenDaysAgo,
        initialChoice: undefined,
        onboardingCompleted: false
      },
      updateCBTSettings: mockUpdateSettings,
      updateCBTOnboardingState: mockUpdateOnboarding
    });

    render(<CBTOnboardingBanner />);

    // Should show again after 7 days
    expect(screen.getByText('Would you like gentle check-ins?')).toBeInTheDocument();
  });

  it('applies accessibility attributes', () => {
    render(<CBTOnboardingBanner />);

    const banner = screen.getByRole('banner');
    expect(banner).toHaveAttribute('aria-label', expect.stringContaining('CBT'));
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveAttribute('aria-describedby');
    });
  });
});