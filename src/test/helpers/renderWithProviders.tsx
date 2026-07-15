/**
 * Shared "render with app providers" test helper.
 *
 * WHY THIS EXISTS
 * ----------------
 * Several suites `render()` a component in isolation (e.g. `<BubbleCanvas />`
 * in load-testing.test.tsx) without any of the context providers the real
 * app tree supplies via `src/App.tsx`
 * (`<ThemeProvider><AccessibilityProvider>...<BrowserRouter>...`).
 * Components that call `useTheme()` (`@/themes/provider`) throw
 * synchronously outside a `ThemeProvider` ("useTheme must be used within a
 * ThemeProvider") -- confirmed for `BubbleCanvas` (calls `useTheme()`
 * directly, `src/components/BubbleCanvas.tsx:53`). `useAccessibility()`
 * (`@/components/AccessibilityProvider`) throws the same way for any
 * consumer. This is a second, distinct "class-B" harness-failure shape from
 * the incomplete-store-mock crash `mockBubbleStore.ts` fixes -- missing
 * context, not missing store fields -- and is the companion helper Run 73
 * named as the next mechanical batch.
 *
 * SCOPE: wraps only the three providers isolated component tests have
 * actually been observed to need (Router + ThemeProvider +
 * AccessibilityProvider), not the full 8-provider App.tsx stack
 * (FeatureFlags/ProgressiveOnboarding/CalmMode/Auth/QueryClient). Add a
 * provider here only once a suite demonstrates it needs one -- keep this
 * minimal so failures stay legible.
 *
 * NOTE: `AccessibilityProvider` itself calls `useBubbleStore()` internally
 * (to read/sync `highContrast`/`reducedMotion`), so callers must ALSO mock
 * `@/stores/bubbleStore` -- pair this with `mockBubbleStore.ts`. This helper
 * does not do that for you.
 *
 * USAGE:
 *   import { renderWithProviders } from '@/test/helpers/renderWithProviders';
 *   renderWithProviders(<BubbleCanvas />);
 */
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@/themes/provider';
import { AccessibilityProvider } from '@/components/AccessibilityProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AccessibilityProvider>{children}</AccessibilityProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

/** `@testing-library/react`'s `render`, pre-wrapped with `AppProviders`. */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): RenderResult {
  return render(ui, { wrapper: AppProviders, ...options });
}
