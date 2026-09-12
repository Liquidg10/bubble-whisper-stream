import { afterEach, describe, expect, it } from 'vitest';
import { calmModeService } from '../calmModeService';

afterEach(() => {
  calmModeService.disableCalmMode();
  calmModeService.updateAccessibilitySettings({ reducedMotion: false, highContrast: false });
});

describe('calm mode activation', () => {
  it('does not apply preset restrictions while calm mode is off', () => {
    calmModeService.disableCalmMode();
    expect(calmModeService.getAnimationPreferences().reduceMotion).toBe(false);
    expect(document.body).not.toHaveClass('reduce-motion', 'high-contrast', 'large-targets');
    expect(calmModeService.shouldLimitStimuli('parallax')).toBe(false);
  });

  it('applies the preset only while enabled and removes CSS overrides when disabled', () => {
    calmModeService.enableCalmMode();
    expect(document.body).toHaveClass('calm-mode', 'reduce-motion', 'large-targets');
    expect(calmModeService.getAnimationPreferences().reduceMotion).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--animation-duration')).toBe('0ms');
    calmModeService.disableCalmMode();
    expect(document.body).not.toHaveClass('calm-mode', 'reduce-motion', 'large-targets');
    expect(document.documentElement.style.getPropertyValue('--animation-duration')).toBe('');
  });

  it('preserves independently chosen accessibility restrictions with calm mode off', () => {
    calmModeService.updateAccessibilitySettings({ reducedMotion: true, highContrast: true });
    calmModeService.disableCalmMode();
    expect(document.body).toHaveClass('reduce-motion', 'high-contrast');
    expect(calmModeService.getAnimationPreferences().reduceMotion).toBe(true);
  });
});
