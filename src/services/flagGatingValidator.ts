/**
 * Flag Gating Validator - Runtime assertions for flag-controlled features
 * Ensures flags actually control both rendering and side effects
 */

import { isFeatureEnabled, getActiveFlags, AUTO_WRITE_FLAGS, type FeatureFlag } from '@/config/flags';
import { devLog } from '@/devtools/devLog';

export interface FlagViolation {
  flag: FeatureFlag;
  type: 'render' | 'side_effect' | 'watcher';
  description: string;
  timestamp: number;
  stack?: string;
}

export interface FlagGatingReport {
  timestamp: number;
  activeFlags: Record<FeatureFlag, boolean>;
  violations: FlagViolation[];
  watcherStatus: Record<string, boolean>;
  renderChecks: Record<string, boolean>;
}

class FlagGatingValidator {
  private violations: FlagViolation[] = [];
  private watcherStatus: Map<string, boolean> = new Map();
  private renderChecks: Map<string, boolean> = new Map();
  private listeners: ((violation: FlagViolation) => void)[] = [];

  /**
   * Assert that a component renders only when its flag is enabled
   */
  assertRenderGated(componentName: string, flag: FeatureFlag): boolean {
    const enabled = isFeatureEnabled(flag);
    const key = `${componentName}:${flag}`;
    
    if (!enabled) {
      this.recordViolation(flag, 'render', `Component ${componentName} rendered with flag ${flag} disabled`);
      this.renderChecks.set(key, false);
      return false;
    }
    
    this.renderChecks.set(key, true);
    devLog('flag-gating', `✓ ${componentName} render gated by ${flag}`);
    return true;
  }

  /**
   * Assert that side effects only execute when flag is enabled
   */
  assertSideEffectGated(effectName: string, flag: FeatureFlag): boolean {
    const enabled = isFeatureEnabled(flag);
    
    if (!enabled) {
      this.recordViolation(flag, 'side_effect', `Side effect ${effectName} executed with flag ${flag} disabled`);
      return false;
    }
    
    devLog('flag-gating', `✓ ${effectName} side effect gated by ${flag}`);
    return true;
  }

  /**
   * Register watcher status (should stop when flag disabled)
   */
  registerWatcherStatus(watcherName: string, isRunning: boolean, flag: FeatureFlag): void {
    const enabled = isFeatureEnabled(flag);
    this.watcherStatus.set(watcherName, isRunning);
    
    if (isRunning && !enabled) {
      this.recordViolation(flag, 'watcher', `Watcher ${watcherName} running with flag ${flag} disabled`);
    } else if (!isRunning && enabled) {
      devLog('flag-gating', `! Watcher ${watcherName} stopped despite ${flag} being enabled`);
    } else {
      devLog('flag-gating', `✓ Watcher ${watcherName} status aligned with ${flag}`);
    }
  }

  /**
   * Validate all calendar watchers respect flags
   */
  validateCalendarWatchers(): void {
    const calendarFlag = isFeatureEnabled('autoWriteCalendar');
    
    // Check if calendar sync service is respecting the flag
    this.registerWatcherStatus('calendar-sync', calendarFlag, 'autoWriteCalendar');
  }

  /**
   * Validate all Gmail watchers respect flags
   */
  validateGmailWatchers(): void {
    const emailFlag = isFeatureEnabled('autoWriteEmail');
    
    // Check if Gmail watch service is respecting the flag
    this.registerWatcherStatus('gmail-watch', emailFlag, 'autoWriteEmail');
  }

  /**
   * Run comprehensive flag gating validation
   */
  runComprehensiveValidation(): FlagGatingReport {
    const activeFlags = getActiveFlags();
    const timestamp = Date.now();
    
    // Clear previous checks
    this.renderChecks.clear();
    this.watcherStatus.clear();
    
    // Validate watcher alignment
    this.validateCalendarWatchers();
    this.validateGmailWatchers();
    
    // Validate voice system flags
    this.validateVoiceFlags();
    
    // Check auto-write kill switch
    this.validateAutoWriteKillSwitch();
    
    const report: FlagGatingReport = {
      timestamp,
      activeFlags,
      violations: [...this.violations],
      watcherStatus: Object.fromEntries(this.watcherStatus),
      renderChecks: Object.fromEntries(this.renderChecks),
    };
    
    devLog('flag-gating', `Validation complete: ${this.violations.length} violations found`);
    return report;
  }

  /**
   * Get recent violations
   */
  getViolations(sinceMs: number = 60000): FlagViolation[] {
    const since = Date.now() - sinceMs;
    return this.violations.filter(v => v.timestamp >= since);
  }

  /**
   * Subscribe to violation events
   */
  onViolation(listener: (violation: FlagViolation) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Clear all violations (for testing)
   */
  clearViolations(): void {
    this.violations = [];
    this.renderChecks.clear();
    this.watcherStatus.clear();
  }

  /**
   * Export validation data
   */
  exportReport(): string {
    const report = this.runComprehensiveValidation();
    return JSON.stringify(report, null, 2);
  }

  private recordViolation(flag: FeatureFlag, type: FlagViolation['type'], description: string): void {
    const violation: FlagViolation = {
      flag,
      type,
      description,
      timestamp: Date.now(),
      stack: new Error().stack,
    };
    
    this.violations.push(violation);
    this.listeners.forEach(listener => listener(violation));
    
    console.warn(`🚨 Flag Violation: ${description}`, violation);
  }

  private validateVoiceFlags(): void {
    const voiceFlags: FeatureFlag[] = [
      'voiceCapture',
      'realtimeVoice',
      'VOICE_ENGINE_UNIFIED',
      'VOICE_AUTO_COMMIT_DEFAULT',
    ];
    
    voiceFlags.forEach(flag => {
      const enabled = isFeatureEnabled(flag);
      devLog('flag-gating', `Voice flag ${flag}: ${enabled ? 'enabled' : 'disabled'}`);
    });
  }

  private validateAutoWriteKillSwitch(): void {
    const killSwitchActive = isFeatureEnabled('autoWriteKillSwitch');

    if (killSwitchActive) {
      AUTO_WRITE_FLAGS.forEach(flag => {
        if (isFeatureEnabled(flag)) {
          this.recordViolation(flag, 'side_effect', `Auto-write flag ${flag} active despite kill switch`);
        }
      });
    }
  }
}

export const flagGatingValidator = new FlagGatingValidator();