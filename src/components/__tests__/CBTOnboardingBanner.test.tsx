import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { mockUseBubbleStore, resetMockBubbleStore, setMockSettings } from '@/test/helpers/mockBubbleStore';
import { CBTOnboardingBanner } from '../CBTOnboardingBanner';

// Shared store mock (Run 73/75 helpers) instead of this file's own stale,
// hand-rolled shape (`cbtSettings`/`cbtOnboardingState`/`updateCBTSettings`/
// `updateCBTOnboardingState` at the top level of the hook's return value).
// The REAL component (src/components/CBTOnboardingBanner.tsx) destructures
// `{ settings, updateSettings } = useBubbleStore()` and reads
// `settings.cbtSettings?.cbtAssistEnabled` -- there is no `cbtOnboardingState`
// concept in the store at all. "Has the banner been shown / when was it
// dismissed" is tracked in real `localStorage` keys
// (`cbt_onboarding_shown`, `cbt_onboarding_dismissed_at`,
// `cbt_onboarding_choice`), not store state -- verified by reading the
// component source line-by-line (useEffect lines 31-60, handleChoice lines
// 62-94, handleDismiss lines 96-104, REVIVE Run 83).
vi.mock('@/stores/bubbleStore', async () => {
  const { makeBubbleStoreMockModule } = await import('@/test/helpers/mockBubbleStore');
  return makeBubbleStoreMockModule();
});

describe('CBTOnboardingBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockBubbleStore();
    localStorage.clear();
    // CBT enabled by default so the banner is eligible to show; individual
    // tests override via setMockSettings where they need a different state.
    setMockSettings({
      cbtSettings: {
        cbtAssistEnabled: true,
        assistLevel: 'ask',
        autoLogMode: 'ask',
        privacyLayer: 'context',
        quietHours: { enabled: false, start: '22:00', end: '07:00' },
        topicExclusions: [],
        neverInterveneOn: [],
      },
    });
  });

  it('renders onboarding banner when not shown before', () => {
    renderWithProviders(<CBTOnboardingBanner />);

    expect(screen.getByText('Would you like gentle check-ins?')).toBeInTheDocument();
    expect(screen.getByText(/I've noticed some patterns/)).toBeInTheDocument();
    expect(screen.getByText('No thanks')).toBeInTheDocument();
    expect(screen.getByText('Ask me first')).toBeInTheDocument();
    expect(screen.getByText('Yes, please')).toBeInTheDocument();
  });

  it('does not render when banner already shown', () => {
    localStorage.setItem('cbt_onboarding_shown', 'true');

    renderWithProviders(<CBTOnboardingBanner />);

    expect(screen.queryByText('Would you like gentle check-ins?')).not.toBeInTheDocument();
  });

  it('does not render when CBT is disabled in settings', () => {
    // Real gate is settings.cbtSettings.cbtAssistEnabled -- the component has
    // no @/config/flags dependency at all (confirmed: not imported anywhere
    // in CBTOnboardingBanner.tsx). The original test mocked isFeatureEnabled,
    // which the component never calls; rewritten to exercise the real gate.
    setMockSettings({ cbtSettings: { cbtAssistEnabled: false } });

    renderWithProviders(<CBTOnboardingBanner />);

    expect(screen.queryByText('Would you like gentle check-ins?')).not.toBeInTheDocument();
  });

  it('handles "No thanks" selection', async () => {
    renderWithProviders(<CBTOnboardingBanner />);

    fireEvent.click(screen.getByText('No thanks'));

    await waitFor(() => {
      expect(mockUseBubbleStore().updateSettings).toHaveBeenCalledWith({
        cbtSettings: expect.objectContaining({
          cbtAssistEnabled: false,
          assistLevel: 'off',
          autoLogMode: 'off',
        }),
      });
    });
    expect(localStorage.getItem('cbt_onboarding_shown')).toBe('true');
    expect(localStorage.getItem('cbt_onboarding_choice')).toBe('off');
  });

  it('handles "Ask me first" selection', async () => {
    renderWithProviders(<CBTOnboardingBanner />);

    fireEvent.click(screen.getByText('Ask me first'));

    await waitFor(() => {
      expect(mockUseBubbleStore().updateSettings).toHaveBeenCalledWith({
        cbtSettings: expect.objectContaining({
          cbtAssistEnabled: true,
          assistLevel: 'subtle',
          autoLogMode: 'ask',
        }),
      });
    });
    expect(localStorage.getItem('cbt_onboarding_choice')).toBe('ask');
  });

  it('handles "Yes, please" selection', async () => {
    renderWithProviders(<CBTOnboardingBanner />);

    fireEvent.click(screen.getByText('Yes, please'));

    await waitFor(() => {
      expect(mockUseBubbleStore().updateSettings).toHaveBeenCalledWith({
        cbtSettings: expect.objectContaining({
          cbtAssistEnabled: true,
          assistLevel: 'standard',
          autoLogMode: 'on',
        }),
      });
    });
    expect(localStorage.getItem('cbt_onboarding_choice')).toBe('on');
  });

  it('includes privacy information links', () => {
    renderWithProviders(<CBTOnboardingBanner />);

    // Source-verified: the real footer button reads "Learn more", not
    // "Learn about your data" (src/components/CBTOnboardingBanner.tsx:257).
    expect(screen.getByText('Learn more')).toBeInTheDocument();
    expect(screen.getByText('Delete everything')).toBeInTheDocument();
  });

  it('can be dismissed without making choice', async () => {
    renderWithProviders(<CBTOnboardingBanner />);

    // Source-verified: the dismiss button's real aria-label is "Ask me
    // later" (line 181), not "close".
    fireEvent.click(screen.getByRole('button', { name: /ask me later/i }));

    await waitFor(() => {
      expect(localStorage.getItem('cbt_onboarding_dismissed_at')).not.toBeNull();
    });
  });

  it('respects 7-day dismissal cooldown', () => {
    // 8 days, not exactly 7: the component's check is a strict `>` against
    // weekInMs, so a fixture computed as "exactly 7 days ago" is a boundary
    // race against the few ms that elapse before the effect reads
    // Date.now() again. 8 days removes that flakiness without changing
    // what's being verified (re-offer after the cooldown window).
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem('cbt_onboarding_shown', 'true');
    localStorage.setItem('cbt_onboarding_dismissed_at', String(eightDaysAgo));

    renderWithProviders(<CBTOnboardingBanner />);

    // Should show again after the cooldown window has passed
    expect(screen.getByText('Would you like gentle check-ins?')).toBeInTheDocument();
  });

  it('applies accessibility attributes', () => {
    // NOT FIXED -- left failing on purpose. Source-verified real gap, not a
    // stale query: the component has no `role="banner"`, no `aria-label`
    // containing "CBT" anywhere, and none of its buttons set
    // `aria-describedby` (src/components/CBTOnboardingBanner.tsx, full read,
    // REVIVE Run 83). Fixing this means adding real accessibility attributes
    // to product code, outside REVIVE's test-harness-only bar (same call as
    // Run 78's Bucket B). Flagged for Mark, not silently weakened or removed.
    renderWithProviders(<CBTOnboardingBanner />);

    const banner = screen.getByRole('banner');
    expect(banner).toHaveAttribute('aria-label', expect.stringContaining('CBT'));

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveAttribute('aria-describedby');
    });
  });
});
