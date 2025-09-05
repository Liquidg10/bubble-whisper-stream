/**
 * Ambient Mode Service
 * Manages behavioral modes that retune app behavior, copy, and UI emphasis
 */

export type AmbientMode = 'supportive' | 'focused' | 'low-spoon';

export interface AmbientModeConfig {
  id: AmbientMode;
  name: string;
  description: string;
  icon: string;
  copyTone: 'gentle' | 'direct' | 'compassionate';
  notificationCadence: 'frequent' | 'reduced' | 'minimal';
  glimmerFrequency: 'high' | 'normal' | 'low';
  focusModeIntensity: 'light' | 'strong' | 'adaptive';
  cbtApproach: 'supportive' | 'structured' | 'gentle';
  reminderUrgency: 'standard' | 'strong' | 'deferred';
}

export const AMBIENT_MODES: Record<AmbientMode, AmbientModeConfig> = {
  supportive: {
    id: 'supportive',
    name: 'Supportive',
    description: 'Gentle guidance with encouraging reminders and frequent positive moments',
    icon: '🤗',
    copyTone: 'gentle',
    notificationCadence: 'frequent',
    glimmerFrequency: 'high',
    focusModeIntensity: 'light',
    cbtApproach: 'supportive',
    reminderUrgency: 'standard'
  },
  focused: {
    id: 'focused',
    name: 'Focused',
    description: 'Minimal distractions with clear, direct prompts for deep work',
    icon: '🎯',
    copyTone: 'direct',
    notificationCadence: 'reduced',
    glimmerFrequency: 'low',
    focusModeIntensity: 'strong',
    cbtApproach: 'structured',
    reminderUrgency: 'strong'
  },
  'low-spoon': {
    id: 'low-spoon',
    name: 'Low-Spoon',
    description: 'Gentle approach that reduces demands and defers non-urgent items',
    icon: '🥄',
    copyTone: 'compassionate',
    notificationCadence: 'minimal',
    glimmerFrequency: 'high',
    focusModeIntensity: 'adaptive',
    cbtApproach: 'gentle',
    reminderUrgency: 'deferred'
  }
};

class AmbientModeService {
  private currentMode: AmbientMode = 'supportive';
  private inferenceEnabled = false;
  private listeners: Array<(mode: AmbientMode) => void> = [];

  /**
   * Get the current ambient mode
   */
  getCurrentMode(): AmbientMode {
    const stored = localStorage.getItem('ambient-mode');
    if (stored && this.isValidMode(stored)) {
      this.currentMode = stored as AmbientMode;
    }
    return this.currentMode;
  }

  /**
   * Set the ambient mode
   */
  setMode(mode: AmbientMode): void {
    if (!this.isValidMode(mode)) {
      throw new Error(`Invalid ambient mode: ${mode}`);
    }
    
    this.currentMode = mode;
    localStorage.setItem('ambient-mode', mode);
    
    // Notify listeners
    this.listeners.forEach(listener => listener(mode));
    
    // Log mode change for transparency
    console.log(`[Ambient Mode] Switched to ${AMBIENT_MODES[mode].name} mode`);
  }

  /**
   * Get the current mode configuration
   */
  getCurrentConfig(): AmbientModeConfig {
    return AMBIENT_MODES[this.getCurrentMode()];
  }

  /**
   * Subscribe to mode changes
   */
  subscribe(listener: (mode: AmbientMode) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Check if inference is enabled
   */
  isInferenceEnabled(): boolean {
    return this.inferenceEnabled;
  }

  /**
   * Toggle mode inference
   */
  toggleInference(enabled: boolean): void {
    this.inferenceEnabled = enabled;
    localStorage.setItem('ambient-mode-inference', enabled.toString());
  }

  /**
   * Infer mode from user patterns (when enabled)
   */
  inferModeFromPatterns(patterns: {
    stressLevel?: number;
    activityLevel?: number;
    timeOfDay?: number;
    recentSnoozes?: number;
  }): AmbientMode | null {
    if (!this.inferenceEnabled) return null;

    const { stressLevel = 0, activityLevel = 0, timeOfDay = 12, recentSnoozes = 0 } = patterns;

    // Low-spoon indicators
    if (stressLevel > 7 || recentSnoozes > 3 || activityLevel < 2) {
      return 'low-spoon';
    }

    // Focused indicators (morning/afternoon work hours, high activity)
    if ((timeOfDay >= 9 && timeOfDay <= 17) && activityLevel > 6 && stressLevel < 4) {
      return 'focused';
    }

    // Default to supportive
    return 'supportive';
  }

  /**
   * Get copy modifications based on current mode
   */
  getModeCopy(baseText: string, context: 'reminder' | 'cbt' | 'notification' | 'general'): string {
    const config = this.getCurrentConfig();
    
    switch (context) {
      case 'reminder':
        return this.adjustReminderCopy(baseText, config);
      case 'cbt':
        return this.adjustCBTCopy(baseText, config);
      case 'notification':
        return this.adjustNotificationCopy(baseText, config);
      default:
        return this.adjustGeneralCopy(baseText, config);
    }
  }

  /**
   * Check if an action should be deferred based on current mode
   */
  shouldDefer(action: 'reminder' | 'notification' | 'prompt', urgency: 'low' | 'medium' | 'high'): boolean {
    const config = this.getCurrentConfig();
    
    if (config.id === 'low-spoon') {
      return urgency === 'low' || (urgency === 'medium' && action === 'notification');
    }
    
    if (config.id === 'focused') {
      return urgency === 'low' && action === 'notification';
    }
    
    return false;
  }

  private isValidMode(mode: string): mode is AmbientMode {
    return Object.keys(AMBIENT_MODES).includes(mode);
  }

  private adjustReminderCopy(text: string, config: AmbientModeConfig): string {
    switch (config.copyTone) {
      case 'gentle':
        return text.replace(/\b(must|should|need to)\b/gi, 'might want to')
                  .replace(/\b(deadline|urgent)\b/gi, 'when you\'re ready');
      case 'compassionate':
        return `When you have the energy: ${text.toLowerCase()}`;
      case 'direct':
        return text.replace(/\b(maybe|perhaps|might)\b/gi, '').trim();
      default:
        return text;
    }
  }

  private adjustCBTCopy(text: string, config: AmbientModeConfig): string {
    switch (config.cbtApproach) {
      case 'gentle':
        return text.replace(/\b(wrong|incorrect|bad)\b/gi, 'different')
                  .replace(/\b(challenge|fight)\b/gi, 'explore');
      case 'supportive':
        return `Let's gently explore: ${text}`;
      case 'structured':
        return text; // Keep direct CBT language
      default:
        return text;
    }
  }

  private adjustNotificationCopy(text: string, config: AmbientModeConfig): string {
    if (config.notificationCadence === 'minimal') {
      return text.replace(/!/g, '.').toLowerCase();
    }
    return text;
  }

  private adjustGeneralCopy(text: string, config: AmbientModeConfig): string {
    switch (config.copyTone) {
      case 'gentle':
        return text.replace(/\b(error|failed|wrong)\b/gi, 'oops');
      case 'compassionate':
        return text.replace(/\b(you should|you must)\b/gi, 'you might');
      default:
        return text;
    }
  }
}

export const ambientModeService = new AmbientModeService();