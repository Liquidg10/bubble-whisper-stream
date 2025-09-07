/**
 * PROMPT 10: CBT Pilot Cohort Management
 * Environment-based user inclusion/exclusion for safe rollout
 */

import type { FeatureFlag } from '@/config/flags';

export interface PilotConfig {
  enabled: boolean;
  userList: string[];
  overrideFlags?: Partial<Record<FeatureFlag, boolean>>;
  description?: string;
  silentStabilization?: {
    enabled: boolean;
    durationDays: number;
    cohortStartDates: Record<string, number>; // userId -> timestamp
    precisionThreshold: number;
  };
}

export interface PilotStatus {
  isInPilot: boolean;
  pilotEnabled: boolean;
  userEligible: boolean;
  flagOverrides: Partial<Record<FeatureFlag, boolean>>;
  source: 'pilot' | 'feature_flag' | 'default';
}

class CBTPilotService {
  private readonly STORAGE_KEY = 'cbt_pilot_config';
  private readonly ENV_USER_LIST = 'CBT_PILOT_USERS'; // Note: Not VITE_ since this is backend config
  
  // Default pilot configuration
  private defaultConfig: PilotConfig = {
    enabled: false,
    userList: [],
    overrideFlags: {
      cbtAssist: true,
      cbtSilentObserve: true,
      cbtCrisisEnabled: true // Keep crisis enabled for pilot
    },
    description: 'CBT Assistance Pilot Program',
    silentStabilization: {
      enabled: true,
      durationDays: 7,
      cohortStartDates: {},
      precisionThreshold: 0.80
    }
  };

  /**
   * Check if user is in pilot cohort
   */
  isUserInPilot(userId?: string): boolean {
    if (!userId) return false;
    
    const config = this.getPilotConfig();
    if (!config.enabled) return false;
    
    return config.userList.includes(userId);
  }

  /**
   * Get pilot status for user
   */
  getPilotStatus(userId?: string): PilotStatus {
    const isInPilot = this.isUserInPilot(userId);
    const config = this.getPilotConfig();
    
    return {
      isInPilot,
      pilotEnabled: config.enabled,
      userEligible: Boolean(userId && config.userList.includes(userId)),
      flagOverrides: isInPilot ? (config.overrideFlags || {}) : {},
      source: isInPilot ? 'pilot' : 'feature_flag'
    };
  }

  /**
   * Get feature flag value considering pilot status and silent stabilization
   */
  getFeatureFlag(flag: FeatureFlag, userId?: string, defaultValue: boolean = false): boolean {
    const pilotStatus = this.getPilotStatus(userId);
    
    // Special handling for cbtSilentObserve during stabilization period
    if (flag === 'cbtSilentObserve' && pilotStatus.isInPilot && userId) {
      if (this.isInSilentStabilization(userId)) {
        return true; // Force silent observe during stabilization
      }
    }
    
    // If user is in pilot and flag has override, use that
    if (pilotStatus.isInPilot && pilotStatus.flagOverrides[flag] !== undefined) {
      return pilotStatus.flagOverrides[flag]!;
    }
    
    // Otherwise use normal feature flag logic
    return this.getStandardFeatureFlag(flag, defaultValue);
  }

  /**
   * Update pilot configuration (dev only)
   */
  updatePilotConfig(config: Partial<PilotConfig>): void {
    const current = this.getPilotConfig();
    const updated = { ...current, ...config };
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
      console.log('[CBT Pilot] Configuration updated:', updated);
    } catch (error) {
      console.warn('[CBT Pilot] Failed to update config:', error);
    }
  }

  /**
   * Add user to pilot cohort
   */
  addUserToPilot(userId: string): void {
    const config = this.getPilotConfig();
    if (!config.userList.includes(userId)) {
      config.userList.push(userId);
      
      // Record start date for silent stabilization
      if (config.silentStabilization?.enabled) {
        if (!config.silentStabilization.cohortStartDates) {
          config.silentStabilization.cohortStartDates = {};
        }
        config.silentStabilization.cohortStartDates[userId] = Date.now();
      }
      
      this.updatePilotConfig(config);
      console.log(`[CBT Pilot] Added user ${userId} to pilot`);
    }
  }

  /**
   * Remove user from pilot cohort
   */
  removeUserFromPilot(userId: string): void {
    const config = this.getPilotConfig();
    const index = config.userList.indexOf(userId);
    if (index > -1) {
      config.userList.splice(index, 1);
      this.updatePilotConfig(config);
      console.log(`[CBT Pilot] Removed user ${userId} from pilot`);
    }
  }

  /**
   * Enable/disable pilot program
   */
  setPilotEnabled(enabled: boolean): void {
    this.updatePilotConfig({ enabled });
    console.log(`[CBT Pilot] Pilot program ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get pilot cohort statistics
   */
  getPilotStats(): {
    enabled: boolean;
    totalUsers: number;
    userList: string[];
    flagOverrides: string[];
    lastUpdated?: number;
    silentStabilization?: {
      enabled: boolean;
      usersInStabilization: string[];
      usersReady: string[];
    };
  } {
    const config = this.getPilotConfig();
    const silentStabilization = config.silentStabilization?.enabled ? {
      enabled: true,
      usersInStabilization: config.userList.filter(userId => this.isInSilentStabilization(userId)),
      usersReady: config.userList.filter(userId => !this.isInSilentStabilization(userId))
    } : undefined;
    
    return {
      enabled: config.enabled,
      totalUsers: config.userList.length,
      userList: config.userList,
      flagOverrides: Object.keys(config.overrideFlags || {}),
      lastUpdated: this.getLastUpdated(),
      silentStabilization
    };
  }

  /**
   * Load pilot users from environment (if available)
   */
  loadFromEnvironment(): void {
    try {
      // In a real deployment, this would come from environment variables
      // For now, we'll simulate with a localStorage fallback
      const envUsers = localStorage.getItem('CBT_PILOT_ENV_USERS');
      if (envUsers) {
        const userList = envUsers.split(',').map(u => u.trim()).filter(Boolean);
        this.updatePilotConfig({
          enabled: userList.length > 0,
          userList
        });
        console.log('[CBT Pilot] Loaded users from environment:', userList);
      }
    } catch (error) {
      console.warn('[CBT Pilot] Failed to load from environment:', error);
    }
  }

  /**
   * Reset pilot configuration
   */
  resetPilotConfig(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('[CBT Pilot] Configuration reset to defaults');
    } catch (error) {
      console.warn('[CBT Pilot] Failed to reset config:', error);
    }
  }

  /**
   * Check if user is in silent stabilization period
   */
  isInSilentStabilization(userId: string): boolean {
    const config = this.getPilotConfig();
    if (!config.silentStabilization?.enabled || !config.silentStabilization.cohortStartDates) {
      return false;
    }
    
    const startDate = config.silentStabilization.cohortStartDates[userId];
    if (!startDate) return false;
    
    const daysSinceStart = (Date.now() - startDate) / (1000 * 60 * 60 * 24);
    return daysSinceStart < config.silentStabilization.durationDays;
  }

  /**
   * Manually graduate user from silent stabilization (dev override)
   */
  graduateUserFromStabilization(userId: string): void {
    const config = this.getPilotConfig();
    if (config.silentStabilization?.cohortStartDates?.[userId]) {
      delete config.silentStabilization.cohortStartDates[userId];
      this.updatePilotConfig(config);
      console.log(`[CBT Pilot] Graduated user ${userId} from silent stabilization`);
    }
  }

  /**
   * Export pilot configuration
   */
  exportConfig(): string {
    const config = this.getPilotConfig();
    const stats = this.getPilotStats();
    
    return JSON.stringify({
      config,
      stats,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  // Private methods

  private getPilotConfig(): PilotConfig {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored);
        return { ...this.defaultConfig, ...config };
      }
    } catch (error) {
      console.warn('[CBT Pilot] Failed to load config:', error);
    }
    
    return { ...this.defaultConfig };
  }

  private getStandardFeatureFlag(flag: FeatureFlag, defaultValue: boolean): boolean {
    try {
      // Check localStorage override first
      const override = localStorage.getItem(`feature_flag_${flag}`);
      if (override !== null) {
        return override === 'true';
      }
      
      // In a real app, this would check remote feature flags or environment
      // For now, return default
      return defaultValue;
    } catch (error) {
      console.warn(`[CBT Pilot] Failed to get feature flag ${flag}:`, error);
      return defaultValue;
    }
  }

  private getLastUpdated(): number | undefined {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored);
        return config.lastUpdated;
      }
    } catch (error) {
      // Silent fail
    }
    return undefined;
  }
}

export const cbtPilotService = new CBTPilotService();

// Auto-load from environment on startup
if (typeof window !== 'undefined') {
  cbtPilotService.loadFromEnvironment();
}
