import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/FeatureFlags', () => ({
  useFeatureFlags: () => ({ isFeatureEnabled: () => false }),
}));

vi.mock('@/config/flags', () => ({ isFeatureEnabled: () => false }));

vi.mock('@/components/settings/GeneralSettings', () => ({
  GeneralSettings: () => <div data-testid="general-content" />,
}));
vi.mock('@/components/IntelligenceSettings', () => ({
  IntelligenceSettings: () => <div data-testid="intelligence-content" />,
}));
vi.mock('@/components/settings/IntegrationsSettings', () => ({
  IntegrationsSettings: () => <div data-testid="integrations-content" />,
}));
vi.mock('@/components/settings/PrivacySecuritySettings', () => ({
  PrivacySecuritySettings: () => <div data-testid="privacy-content" />,
}));
vi.mock('@/components/settings/AdvancedSettings', () => ({
  AdvancedSettings: () => <div data-testid="advanced-content" />,
}));
vi.mock('@/components/settings/AISettings', () => ({
  AISettings: () => <div data-testid="ai-content" />,
}));
vi.mock('@/components/settings/ThoughtSupportSettings', () => ({
  ThoughtSupportSettings: () => <div data-testid="thought-content" />,
}));
vi.mock('@/components/settings/SafetySettings', () => ({
  SafetySettings: () => <div data-testid="safety-content" />,
}));
vi.mock('@/components/settings/AuditSettings', () => ({
  AuditSettings: () => <div data-testid="audit-content" />,
}));
vi.mock('@/components/settings/OnboardingSettings', () => ({
  OnboardingSettings: () => <div data-testid="onboarding-content" />,
}));
vi.mock('@/components/settings/AccessibilitySettings', () => ({
  AccessibilitySettings: () => <div data-testid="accessibility-content" />,
}));
vi.mock('@/components/settings/AutoWriteSettings', () => ({
  AutoWriteSettings: () => <div data-testid="autowrite-content" />,
}));

import { Settings } from '@/pages/Settings';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="settings-location">{location.search}</output>;
}

function renderSettings(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Settings />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('Settings callback return route', () => {
  it('keeps mobile selection and the URL in sync without losing callback context', () => {
    renderSettings('/settings?tab=integrations&returnTo=calendar');
    fireEvent.change(screen.getByRole('combobox', { name: 'Settings section' }), { target: { value: 'accessibility' } });
    expect(screen.getByTestId('accessibility-content')).toBeInTheDocument();
    expect(screen.queryByTestId('integrations-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-location')).toHaveTextContent('?tab=accessibility&returnTo=calendar');
    expect(screen.getByRole('tab', { name: 'Accessibility' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not offer gated sections in either navigation control', () => {
    renderSettings('/settings?tab=thought-support');
    expect(screen.getByTestId('general-content')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Thought support' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Advanced' })).not.toBeInTheDocument();
  });

  it('opens the Integrations tab requested by the Calendar callback', () => {
    renderSettings('/settings?tab=integrations');

    expect(screen.getByRole('tab', { name: 'Integrations' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('integrations-content')).toBeInTheDocument();
  });

  it('falls back to General for an unavailable conditional tab', () => {
    renderSettings('/settings?tab=advanced');

    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('general-content')).toBeInTheDocument();
  });
});
