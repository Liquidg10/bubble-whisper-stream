import { storageService } from './storage';
import { consentService } from './consentService';
import { CBTEntry, Glimmer, Reminder, SelfModelAudit, PatternHint } from '../types/bubble';

export interface ExportData {
  version: string;
  exportedAt: number;
  redacted: boolean;
  data: {
    bubbles?: any[];
    cbtEntries?: CBTEntry[];
    glimmers?: Glimmer[];
    reminders?: Reminder[];
    selfModelAudits?: SelfModelAudit[];
    patternHints?: PatternHint[];
    preferences?: Record<string, any>;
  };
}

export interface ExportOptions {
  includeDeepLayer?: boolean;
  includeCBTEntries?: boolean;
  includeGlimmers?: boolean;
  includeReminders?: boolean;
  includeAudits?: boolean;
  dateRange?: {
    start: number;
    end: number;
  };
  redactSensitive?: boolean;
}

class ExportService {
  private readonly VERSION = '2.0.0';

  async exportData(options: ExportOptions = {}): Promise<ExportData> {
    const {
      includeDeepLayer = false,
      includeCBTEntries = true,
      includeGlimmers = true,
      includeReminders = true,
      includeAudits = false,
      dateRange,
      redactSensitive = false
    } = options;

    // Check consent for deep layer data
    const hasDeepConsent = await consentService.hasConsent('deep');
    const canIncludeDeep = includeDeepLayer && hasDeepConsent;

    const exportData: ExportData = {
      version: this.VERSION,
      exportedAt: Date.now(),
      redacted: redactSensitive || !canIncludeDeep,
      data: {}
    };

    try {
      // Export bubbles (using existing method)
      const allBubbles = await storageService.getAllBubbles?.() || [];
      if (allBubbles.length > 0) {
        exportData.data.bubbles = this.filterByDateRange(
          allBubbles.map(bubble => this.redactBubbleIfNeeded(bubble, redactSensitive)),
          dateRange
        );
      }

      // Export CBT entries (placeholder - will be implemented when storage service is extended)
      if (includeCBTEntries) {
        exportData.data.cbtEntries = [];
      }

      // Export glimmers (placeholder - will be implemented when storage service is extended)
      if (includeGlimmers) {
        exportData.data.glimmers = [];
      }

      // Export reminders (placeholder - will be implemented when storage service is extended)
      if (includeReminders) {
        exportData.data.reminders = [];
      }

      // Export audits (placeholder - will be implemented when storage service is extended)
      if (includeAudits && canIncludeDeep) {
        exportData.data.selfModelAudits = [];
      }

      // Export pattern hints (placeholder - will be implemented when storage service is extended)
      exportData.data.patternHints = [];

      // Export preferences (excluding sensitive data)
      const preferences = await storageService.getSettings();
      exportData.data.preferences = this.redactPreferencesIfNeeded(preferences, redactSensitive);

    } catch (error) {
      console.error('Export failed:', error);
      throw new Error('Failed to export data. Please try again.');
    }

    return exportData;
  }

  async createEncryptedExport(options: ExportOptions = {}): Promise<string> {
    const data = await this.exportData(options);
    // In a real implementation, this would use crypto to encrypt the JSON
    // For now, we'll return base64 encoded JSON
    const jsonString = JSON.stringify(data, null, 2);
    return btoa(jsonString);
  }

  async createRedactedExport(options: ExportOptions = {}): Promise<ExportData> {
    return this.exportData({
      ...options,
      includeDeepLayer: false,
      redactSensitive: true
    });
  }

  private filterByDateRange<T extends { createdAt: number }>(
    items: T[],
    dateRange?: { start: number; end: number }
  ): T[] {
    if (!dateRange) return items;
    return items.filter(item => 
      item.createdAt >= dateRange.start && item.createdAt <= dateRange.end
    );
  }

  private redactBubbleIfNeeded(bubble: any, redact: boolean): any {
    if (!redact) return bubble;
    
    return {
      ...bubble,
      content: '[REDACTED]',
      voice_notes: undefined,
      photos: bubble.photos ? bubble.photos.map(() => '[REDACTED_PHOTO]') : undefined
    };
  }

  private redactCBTEntryIfNeeded(entry: CBTEntry, redact: boolean): CBTEntry {
    if (!redact) return entry;
    
    return {
      ...entry,
      thought: '[REDACTED]',
      evidenceFor: entry.evidenceFor ? '[REDACTED]' : undefined,
      evidenceAgainst: entry.evidenceAgainst ? '[REDACTED]' : undefined,
      reframe: entry.reframe ? '[REDACTED]' : undefined
    };
  }

  private redactPreferencesIfNeeded(preferences: any, redact: boolean): any {
    if (!redact) return preferences;
    
    const safePreferences = { ...preferences };
    
    // Remove potentially sensitive preferences
    delete safePreferences.medicationTimes;
    delete safePreferences.triggers;
    delete safePreferences.deepLayerSettings;
    
    return safePreferences;
  }

  private anonymizePatternKey(key: string): string {
    // Replace specific identifiers with generic ones
    return key
      .replace(/morning|afternoon|evening|night/g, '[TIME]')
      .replace(/home|work|[a-z]+_location/g, '[LOCATION]')
      .replace(/\d+/g, '[NUMBER]');
  }
}

export const exportService = new ExportService();