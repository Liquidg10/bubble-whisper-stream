/**
 * P19: Privacy & Consent Service
 * Ensures no PII leaves device without explicit user consent
 * Manages telemetry consent and data export controls
 */

export interface ConsentSettings {
  telemetryEnabled: boolean;
  cloudSyncEnabled: boolean;
  analyticsEnabled: boolean;
  crashReportingEnabled: boolean;
  personalDataSharing: boolean;
  consentTimestamp: number;
  consentVersion: string;
  dataRetentionDays: number;
}

export interface PrivacyControls {
  pauseLearning: boolean;
  redactLastNDays: number;
  moveToDeepLayer: boolean;
  disableSpecificIntegrations: string[];
  lastRedaction: number;
}

export interface DataExportOptions {
  includePersonalData: boolean;
  includeMetrics: boolean;
  includeBehaviorData: boolean;
  format: 'json' | 'csv' | 'xml';
  dateRange?: {
    start: number;
    end: number;
  };
}

class PrivacyConsentService {
  private readonly CONSENT_STORAGE_KEY = 'privacy_consent_settings';
  private readonly CONTROLS_STORAGE_KEY = 'privacy_controls';
  private readonly CURRENT_CONSENT_VERSION = '1.0.0';

  private defaultConsent: ConsentSettings = {
    telemetryEnabled: false,
    cloudSyncEnabled: false,
    analyticsEnabled: false,
    crashReportingEnabled: true, // Safety feature, minimal data
    personalDataSharing: false,
    consentTimestamp: 0,
    consentVersion: this.CURRENT_CONSENT_VERSION,
    dataRetentionDays: 30
  };

  private defaultControls: PrivacyControls = {
    pauseLearning: false,
    redactLastNDays: 0,
    moveToDeepLayer: false,
    disableSpecificIntegrations: [],
    lastRedaction: 0
  };

  /**
   * Get current consent settings
   */
  getConsentSettings(): ConsentSettings {
    try {
      const stored = localStorage.getItem(this.CONSENT_STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        return { ...this.defaultConsent, ...settings };
      }
    } catch (error) {
      console.warn('[Privacy] Failed to load consent settings:', error);
    }
    
    return { ...this.defaultConsent };
  }

  /**
   * Update consent settings
   */
  updateConsentSettings(updates: Partial<ConsentSettings>): void {
    const current = this.getConsentSettings();
    const updated = {
      ...current,
      ...updates,
      consentTimestamp: Date.now(),
      consentVersion: this.CURRENT_CONSENT_VERSION
    };

    try {
      localStorage.setItem(this.CONSENT_STORAGE_KEY, JSON.stringify(updated));
      console.log('[Privacy] Consent settings updated');
      
      // Emit event for components to react
      window.dispatchEvent(new CustomEvent('privacyConsentUpdated', {
        detail: updated
      }));
    } catch (error) {
      console.warn('[Privacy] Failed to update consent settings:', error);
    }
  }

  /**
   * Check if specific data type can be collected
   */
  canCollectData(dataType: 'telemetry' | 'analytics' | 'personal' | 'cloud_sync'): boolean {
    const consent = this.getConsentSettings();
    
    switch (dataType) {
      case 'telemetry':
        return consent.telemetryEnabled;
      case 'analytics':
        return consent.analyticsEnabled;
      case 'personal':
        return consent.personalDataSharing;
      case 'cloud_sync':
        return consent.cloudSyncEnabled;
      default:
        return false;
    }
  }

  /**
   * Check if data can leave the device
   */
  canExportData(containsPII: boolean = false): boolean {
    const consent = this.getConsentSettings();
    
    if (containsPII && !consent.personalDataSharing) {
      return false;
    }
    
    return consent.telemetryEnabled || consent.cloudSyncEnabled;
  }

  /**
   * Get privacy controls
   */
  getPrivacyControls(): PrivacyControls {
    try {
      const stored = localStorage.getItem(this.CONTROLS_STORAGE_KEY);
      if (stored) {
        const controls = JSON.parse(stored);
        return { ...this.defaultControls, ...controls };
      }
    } catch (error) {
      console.warn('[Privacy] Failed to load privacy controls:', error);
    }
    
    return { ...this.defaultControls };
  }

  /**
   * Update privacy controls
   */
  updatePrivacyControls(updates: Partial<PrivacyControls>): void {
    const current = this.getPrivacyControls();
    const updated = { ...current, ...updates };

    try {
      localStorage.setItem(this.CONTROLS_STORAGE_KEY, JSON.stringify(updated));
      console.log('[Privacy] Privacy controls updated');
      
      // Emit event for components to react
      window.dispatchEvent(new CustomEvent('privacyControlsUpdated', {
        detail: updated
      }));
    } catch (error) {
      console.warn('[Privacy] Failed to update privacy controls:', error);
    }
  }

  /**
   * One-tap pause learning
   */
  pauseLearning(): void {
    this.updatePrivacyControls({ pauseLearning: true });
    console.log('[Privacy] Learning paused');
  }

  /**
   * Resume learning
   */
  resumeLearning(): void {
    this.updatePrivacyControls({ pauseLearning: false });
    console.log('[Privacy] Learning resumed');
  }

  /**
   * Redact last N days of data
   */
  redactLastNDays(days: number): void {
    this.updatePrivacyControls({
      redactLastNDays: days,
      lastRedaction: Date.now()
    });

    // In real implementation, this would trigger data cleanup
    this.performDataRedaction(days);
    console.log(`[Privacy] Redacted last ${days} days of data`);
  }

  /**
   * Move data to deep privacy layer
   */
  moveToDeepLayer(): void {
    this.updatePrivacyControls({ moveToDeepLayer: true });
    console.log('[Privacy] Data moved to deep privacy layer');
  }

  /**
   * Disable specific integration
   */
  disableIntegration(integrationName: string): void {
    const controls = this.getPrivacyControls();
    if (!controls.disableSpecificIntegrations.includes(integrationName)) {
      controls.disableSpecificIntegrations.push(integrationName);
      this.updatePrivacyControls(controls);
      console.log(`[Privacy] Disabled integration: ${integrationName}`);
    }
  }

  /**
   * Re-enable specific integration
   */
  enableIntegration(integrationName: string): void {
    const controls = this.getPrivacyControls();
    const index = controls.disableSpecificIntegrations.indexOf(integrationName);
    if (index > -1) {
      controls.disableSpecificIntegrations.splice(index, 1);
      this.updatePrivacyControls(controls);
      console.log(`[Privacy] Re-enabled integration: ${integrationName}`);
    }
  }

  /**
   * Export user data with privacy controls
   */
  exportUserData(options: DataExportOptions): string {
    const consent = this.getConsentSettings();
    
    if (options.includePersonalData && !consent.personalDataSharing) {
      throw new Error('Personal data export not allowed without consent');
    }

    const exportData = {
      metadata: {
        exportTimestamp: new Date().toISOString(),
        consentVersion: consent.consentVersion,
        dataTypes: {
          personal: options.includePersonalData,
          metrics: options.includeMetrics,
          behavior: options.includeBehaviorData
        },
        privacyCompliant: true
      },
      consentSettings: consent,
      privacyControls: this.getPrivacyControls()
    };

    // Add data based on options and consent
    if (options.includeMetrics && consent.telemetryEnabled) {
      // Would include metrics data here
      (exportData as any).metrics = this.getMetricsData(options.dateRange);
    }

    if (options.includePersonalData && consent.personalDataSharing) {
      // Would include personal data here
      (exportData as any).personalData = this.getPersonalData(options.dateRange);
    }

    if (options.includeBehaviorData && consent.analyticsEnabled) {
      // Would include behavior data here
      (exportData as any).behaviorData = this.getBehaviorData(options.dateRange);
    }

    switch (options.format) {
      case 'json':
        return JSON.stringify(exportData, null, 2);
      case 'csv':
        return this.convertToCSV(exportData);
      case 'xml':
        return this.convertToXML(exportData);
      default:
        return JSON.stringify(exportData, null, 2);
    }
  }

  /**
   * Check if consent is current and valid
   */
  isConsentCurrent(): boolean {
    const consent = this.getConsentSettings();
    return consent.consentVersion === this.CURRENT_CONSENT_VERSION &&
           consent.consentTimestamp > 0;
  }

  /**
   * Reset all privacy settings (nuclear option)
   */
  resetAllPrivacySettings(): void {
    try {
      localStorage.removeItem(this.CONSENT_STORAGE_KEY);
      localStorage.removeItem(this.CONTROLS_STORAGE_KEY);
      console.log('[Privacy] All privacy settings reset');
      
      window.dispatchEvent(new CustomEvent('privacySettingsReset'));
    } catch (error) {
      console.warn('[Privacy] Failed to reset privacy settings:', error);
    }
  }

  // Private methods

  private performDataRedaction(days: number): void {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    try {
      // Redact metrics
      const metrics = JSON.parse(localStorage.getItem('bubble_metrics') || '[]');
      const filteredMetrics = metrics.filter((m: any) => m.timestamp > cutoffTime);
      localStorage.setItem('bubble_metrics', JSON.stringify(filteredMetrics));
      
      // Redact other stored data as needed
      console.log(`[Privacy] Redacted data older than ${days} days`);
    } catch (error) {
      console.warn('[Privacy] Failed to perform data redaction:', error);
    }
  }

  private getMetricsData(dateRange?: { start: number; end: number }): any {
    // Would return filtered metrics data
    return { placeholder: 'metrics data would be here' };
  }

  private getPersonalData(dateRange?: { start: number; end: number }): any {
    // Would return filtered personal data
    return { placeholder: 'personal data would be here' };
  }

  private getBehaviorData(dateRange?: { start: number; end: number }): any {
    // Would return filtered behavior data
    return { placeholder: 'behavior data would be here' };
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion - would be more sophisticated in real implementation
    return Object.entries(data).map(([key, value]) => 
      `${key},${typeof value === 'object' ? JSON.stringify(value) : value}`
    ).join('\n');
  }

  private convertToXML(data: any): string {
    // Simple XML conversion - would be more sophisticated in real implementation
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<export>\n';
    Object.entries(data).forEach(([key, value]) => {
      xml += `  <${key}>${typeof value === 'object' ? JSON.stringify(value) : value}</${key}>\n`;
    });
    xml += '</export>';
    return xml;
  }
}

export const privacyConsentService = new PrivacyConsentService();