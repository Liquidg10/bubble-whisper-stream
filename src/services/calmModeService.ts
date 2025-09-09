/**
 * Calm Mode Service
 * Provides reduced-stimuli experience for neurodivergent users
 */

export interface CalmModeSettings {
  enabled: boolean;
  reduceAnimations: boolean;
  increaseContrast: boolean;
  limitConcurrentStimuli: boolean;
  simplifyInterface: boolean;
  largeTargets: boolean;
  readAloudEnabled: boolean;
  focusRingStyle: 'subtle' | 'prominent' | 'high-contrast';
}

export interface AccessibilitySettings {
  highContrast: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  focusVisible: boolean;
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
  voiceConfirmations: boolean;
}

class CalmModeService {
  private settings: CalmModeSettings = {
    enabled: false,
    reduceAnimations: true,
    increaseContrast: true,
    limitConcurrentStimuli: true,
    simplifyInterface: true,
    largeTargets: true,
    readAloudEnabled: false,
    focusRingStyle: 'prominent'
  };

  private accessibilitySettings: AccessibilitySettings = {
    highContrast: false,
    reducedMotion: false,
    largeText: false,
    focusVisible: true,
    screenReaderOptimized: false,
    keyboardNavigation: true,
    voiceConfirmations: false
  };

  constructor() {
    this.loadSettings();
    this.detectSystemPreferences();
    this.applySettings();
  }

  /**
   * Get current calm mode settings
   */
  getSettings(): CalmModeSettings {
    return { ...this.settings };
  }

  /**
   * Get current accessibility settings
   */
  getAccessibilitySettings(): AccessibilitySettings {
    return { ...this.accessibilitySettings };
  }

  /**
   * Update calm mode settings
   */
  updateSettings(newSettings: Partial<CalmModeSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    this.applySettings();
    this.emitSettingsChange();
  }

  /**
   * Update accessibility settings
   */
  updateAccessibilitySettings(newSettings: Partial<AccessibilitySettings>): void {
    this.accessibilitySettings = { ...this.accessibilitySettings, ...newSettings };
    this.saveSettings();
    this.applySettings();
    this.emitSettingsChange();
  }

  /**
   * Enable calm mode with default settings
   */
  enableCalmMode(): void {
    this.updateSettings({ enabled: true });
  }

  /**
   * Disable calm mode
   */
  disableCalmMode(): void {
    this.updateSettings({ enabled: false });
  }

  /**
   * Check if calm mode is enabled
   */
  isCalmModeEnabled(): boolean {
    return this.settings.enabled;
  }

  /**
   * Get CSS classes for current mode
   */
  getCSSClasses(): string {
    const classes: string[] = [];

    if (this.settings.enabled) {
      classes.push('calm-mode');
    }

    if (this.settings.reduceAnimations || this.accessibilitySettings.reducedMotion) {
      classes.push('reduce-motion');
    }

    if (this.settings.increaseContrast || this.accessibilitySettings.highContrast) {
      classes.push('high-contrast');
    }

    if (this.settings.largeTargets) {
      classes.push('large-targets');
    }

    if (this.accessibilitySettings.largeText) {
      classes.push('large-text');
    }

    if (this.settings.focusRingStyle === 'high-contrast') {
      classes.push('focus-high-contrast');
    } else if (this.settings.focusRingStyle === 'prominent') {
      classes.push('focus-prominent');
    }

    return classes.join(' ');
  }

  /**
   * Get animation preferences
   */
  getAnimationPreferences(): {
    reduceMotion: boolean;
    enableParallax: boolean;
    enableTransitions: boolean;
    animationDuration: 'fast' | 'normal' | 'slow' | 'none';
  } {
    const isReduced = this.settings.reduceAnimations || this.accessibilitySettings.reducedMotion;
    
    return {
      reduceMotion: isReduced,
      enableParallax: !isReduced,
      enableTransitions: !isReduced,
      animationDuration: isReduced ? 'none' : 'normal'
    };
  }

  /**
   * Check if feature should be limited due to stimuli reduction
   */
  shouldLimitStimuli(feature: 'notifications' | 'parallax' | 'autoplay' | 'flashing'): boolean {
    if (!this.settings.limitConcurrentStimuli) return false;

    switch (feature) {
      case 'notifications':
        return true; // Limit to one at a time
      case 'parallax':
        return true; // Disable parallax effects
      case 'autoplay':
        return true; // No auto-playing content
      case 'flashing':
        return true; // No flashing or rapid changes
      default:
        return false;
    }
  }

  /**
   * Get button size preference
   */
  getButtonSize(): 'sm' | 'default' | 'lg' | 'xl' {
    if (this.settings.largeTargets) return 'xl';
    if (this.accessibilitySettings.largeText) return 'lg';
    return 'default';
  }

  /**
   * Detect system accessibility preferences
   */
  private detectSystemPreferences(): void {
    if (typeof window === 'undefined') return;

    // Detect reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      this.accessibilitySettings.reducedMotion = true;
    }

    // Detect high contrast preference
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
    if (prefersHighContrast) {
      this.accessibilitySettings.highContrast = true;
    }

    // Listen for changes
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.updateAccessibilitySettings({ reducedMotion: e.matches });
    });

    window.matchMedia('(prefers-contrast: high)').addEventListener('change', (e) => {
      this.updateAccessibilitySettings({ highContrast: e.matches });
    });
  }

  /**
   * Apply settings to DOM
   */
  private applySettings(): void {
    if (typeof document === 'undefined') return;

    const body = document.body;
    const classes = this.getCSSClasses();
    
    // Remove existing calm mode classes
    body.classList.remove('calm-mode', 'reduce-motion', 'high-contrast', 'large-targets', 'large-text', 'focus-high-contrast', 'focus-prominent');
    
    // Add current classes
    if (classes) {
      body.classList.add(...classes.split(' '));
    }

    // Set CSS custom properties
    const root = document.documentElement;
    
    if (this.settings.enabled) {
      root.style.setProperty('--animation-duration', this.settings.reduceAnimations ? '0ms' : '200ms');
      root.style.setProperty('--transition-duration', this.settings.reduceAnimations ? '0ms' : '150ms');
      root.style.setProperty('--button-min-height', this.settings.largeTargets ? '48px' : '36px');
      root.style.setProperty('--touch-target-size', this.settings.largeTargets ? '48px' : '40px');
    }
  }

  /**
   * Load settings from storage
   */
  private loadSettings(): void {
    try {
      const stored = localStorage.getItem('calm-mode-settings');
      if (stored) {
        this.settings = { ...this.settings, ...JSON.parse(stored) };
      }

      const storedA11y = localStorage.getItem('accessibility-settings');
      if (storedA11y) {
        this.accessibilitySettings = { ...this.accessibilitySettings, ...JSON.parse(storedA11y) };
      }
    } catch (error) {
      console.warn('Failed to load calm mode settings:', error);
    }
  }

  /**
   * Save settings to storage
   */
  private saveSettings(): void {
    try {
      localStorage.setItem('calm-mode-settings', JSON.stringify(this.settings));
      localStorage.setItem('accessibility-settings', JSON.stringify(this.accessibilitySettings));
    } catch (error) {
      console.warn('Failed to save calm mode settings:', error);
    }
  }

  /**
   * Emit settings change event
   */
  private emitSettingsChange(): void {
    if (typeof window === 'undefined') return;
    
    window.dispatchEvent(new CustomEvent('calmModeChange', {
      detail: {
        calmMode: this.settings,
        accessibility: this.accessibilitySettings
      }
    }));
  }
}

export const calmModeService = new CalmModeService();