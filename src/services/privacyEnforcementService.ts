// Privacy Enforcement Service - Centralized privacy policy enforcement
// Ensures all adaptive actions respect user privacy preferences and consent

interface PrivacyPolicy {
  surface: boolean;
  context: boolean;
  deep: boolean;
}

interface ConnectorPrivacySettings {
  calendarSurfaceAccess: boolean;
  calendarContextAccess: boolean;
  calendarDeepAccess: boolean;
  gmailSurfaceAccess: boolean;
  gmailContextAccess: boolean;
  gmailDeepAccess: boolean;
  locationSurfaceAccess: boolean;
  locationContextAccess: boolean;
  locationDeepAccess: boolean;
  cbtSurfaceAccess: boolean;
  cbtContextAccess: boolean;
  cbtDeepAccess: boolean;
  financialSurfaceAccess: boolean;
  financialContextAccess: boolean;
  financialDeepAccess: boolean;
  cameraSurfaceAccess: boolean;
  cameraContextAccess: boolean;
  cameraDeepAccess: boolean;
}

interface PrivacyContext {
  requiredLayer: 'surface' | 'context' | 'deep';
  connectorType: keyof ConnectorPrivacySettings | string;
  dataTypes: string[];
  purpose: string;
}

class PrivacyEnforcementService {
  private defaultSettings: ConnectorPrivacySettings = {
    calendarSurfaceAccess: true,
    calendarContextAccess: false,
    calendarDeepAccess: false,
    gmailSurfaceAccess: true,
    gmailContextAccess: false,
    gmailDeepAccess: false,
    locationSurfaceAccess: false,
    locationContextAccess: false,
    locationDeepAccess: false,
    cbtSurfaceAccess: true,
    cbtContextAccess: true,
    cbtDeepAccess: true,
    financialSurfaceAccess: true,
    financialContextAccess: false,
    financialDeepAccess: false,
    cameraSurfaceAccess: true,
    cameraContextAccess: true,
    cameraDeepAccess: false
  };

  // Check if a specific action is allowed based on privacy settings
  canPerformAction(context: PrivacyContext, userSettings?: Partial<ConnectorPrivacySettings>): boolean {
    const settings = { ...this.defaultSettings, ...userSettings };
    
    // Build the settings key for this connector and layer
    const connectorPrefix = context.connectorType;
    const layerSuffix = `${context.requiredLayer.charAt(0).toUpperCase() + context.requiredLayer.slice(1)}Access`;
    const settingsKey = `${connectorPrefix}${layerSuffix}` as keyof ConnectorPrivacySettings;
    
    const isAllowed = settings[settingsKey];
    
    if (!isAllowed) {
      console.log(`🛡️ Privacy policy blocked action: ${context.connectorType} ${context.requiredLayer} access denied`);
      return false;
    }
    
    return true;
  }

  // Generate privacy-aware explanation for blocked actions
  getBlockedActionExplanation(context: PrivacyContext): string {
    return `This action requires ${context.requiredLayer} layer access to ${context.connectorType} data, which is currently disabled in your privacy settings.`;
  }

  // Get the minimum required privacy layer for a given data type
  getRequiredPrivacyLayer(dataType: string): 'surface' | 'context' | 'deep' {
    const deepDataTypes = ['emotional_patterns', 'cbt_insights', 'personal_triggers', 'mental_health'];
    const contextDataTypes = ['behavioral_patterns', 'routine_detection', 'adaptive_learning', 'location_patterns'];
    
    if (deepDataTypes.some(type => dataType.includes(type))) {
      return 'deep';
    }
    
    if (contextDataTypes.some(type => dataType.includes(type))) {
      return 'context';
    }
    
    return 'surface';
  }

  // Validate that all required explanations are present
  validateExplanation(explanation: string[]): boolean {
    if (!explanation || explanation.length === 0) {
      console.warn('🛡️ Privacy violation: Adaptive action missing required explanation');
      return false;
    }
    
    if (explanation.length < 2) {
      console.warn('🛡️ Privacy warning: Explanation should include at least 2 contributing factors');
    }
    
    return true;
  }

  // Generate privacy-compliant explanation based on available data
  generatePrivacyAwareExplanation(
    context: PrivacyContext,
    userSettings?: Partial<ConnectorPrivacySettings>
  ): string[] {
    const explanation: string[] = [];
    
    if (this.canPerformAction(context, userSettings)) {
      explanation.push(`Using ${context.requiredLayer} layer data from ${context.connectorType}`);
      explanation.push(`Purpose: ${context.purpose}`);
      
      if (context.dataTypes.length > 0) {
        explanation.push(`Data types: ${context.dataTypes.join(', ')}`);
      }
    } else {
      explanation.push('Limited to available privacy settings');
      explanation.push(`${context.connectorType} ${context.requiredLayer} access is disabled`);
    }
    
    return explanation;
  }

  // Check if data collection is paused for a specific layer
  isLayerPaused(layer: string): boolean {
    const pausedLayers = JSON.parse(localStorage.getItem('pausedPrivacyLayers') || '[]');
    return pausedLayers.includes(layer);
  }

  // Pause data collection for a specific layer
  pauseLayer(layer: string): void {
    const pausedLayers = JSON.parse(localStorage.getItem('pausedPrivacyLayers') || '[]');
    if (!pausedLayers.includes(layer)) {
      pausedLayers.push(layer);
      localStorage.setItem('pausedPrivacyLayers', JSON.stringify(pausedLayers));
      console.log(`🛡️ Privacy layer paused: ${layer}`);
    }
  }

  // Resume data collection for a specific layer
  resumeLayer(layer: string): void {
    const pausedLayers = JSON.parse(localStorage.getItem('pausedPrivacyLayers') || '[]');
    const filteredLayers = pausedLayers.filter((l: string) => l !== layer);
    localStorage.setItem('pausedPrivacyLayers', JSON.stringify(filteredLayers));
    console.log(`🛡️ Privacy layer resumed: ${layer}`);
  }

  // Get audit trail for privacy-related actions
  getPrivacyAuditTrail(): Array<{
    timestamp: number;
    action: string;
    layer: string;
    connector?: string;
    explanation: string[];
  }> {
    const auditTrail = JSON.parse(localStorage.getItem('privacyAuditTrail') || '[]');
    return auditTrail;
  }

  // Record privacy-related action in audit trail
  recordPrivacyAction(
    action: string,
    layer: string,
    explanation: string[],
    connector?: string
  ): void {
    const auditTrail = this.getPrivacyAuditTrail();
    const entry = {
      timestamp: Date.now(),
      action,
      layer,
      connector,
      explanation
    };
    
    auditTrail.push(entry);
    
    // Keep only last 100 entries
    if (auditTrail.length > 100) {
      auditTrail.splice(0, auditTrail.length - 100);
    }
    
    localStorage.setItem('privacyAuditTrail', JSON.stringify(auditTrail));
  }
}

export const privacyEnforcementService = new PrivacyEnforcementService();
export type { PrivacyContext, ConnectorPrivacySettings };
