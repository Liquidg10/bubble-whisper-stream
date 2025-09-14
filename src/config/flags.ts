/**
 * Feature flags configuration
 * All new features must be behind a feature flag
 */

export const flags = {
  atomicUnified: true,
  bubblesFinishing: true,
  aiVision: true,
  voiceCapture: true,
  realtimeVoice: true,
  joyPage: true,
  emailIngest: true,
  receiptsOCR: true,
  emailIntegrationEnabled: true,
  receiptProcessing: true,
  outliner: true,
  focusMode: true,
  prioritizer: true,
  sync: true,
  searchV2: true,
  ambientModes: true,
  budget: true,
  
  // Task System (P1 - Non-destructive)
  taskAdapter: process.env.NODE_ENV === 'development',
  
  // ViewSDK (P2 - View contracts and event bus)
  viewSdk: process.env.NODE_ENV === 'development',
  
  // List View (P3 - First missing view)
  listView: true,
  
  // Kanban View (P4 - Column-based organization)
  kanbanView: true,
  contextEngine: true,
  
  // Matrix View (P5 - Eisenhower Matrix)
  matrixView: true,
  
  // Smart Defaults (P6 - Context-aware creation)
  smartDefaults: true,
  
  // Planning Mode (P7 - MCII-Lite planning)
  planningMode: true,
  
  // Context Drift Guard (P8 - Drift detection & rollback)
  contextDriftGuard: true,
  
  // Watch Health (P9 - Calendar/Gmail watch renewal) - PRODUCTION ENABLED
  watchHealth: true, // ENABLED - P9 production watch renewal
  
  // Incremental OAuth (P10 - Least privilege scope escalation) - PRODUCTION ENABLED
  incrementalOAuth: true, // ENABLED - P10 production OAuth
  
  // Cognitive Load Governor (P14 - Nudge budgets & cooldowns)
  loadGovernor: true, // ENABLED IN PRODUCTION - P14 Phase 1
  
  // CBT Assistant Feature Flags
  cbtAssist: false, // Main CBT assistant feature (default OFF)
  cbtSilentObserve: true, // Silent observation for testing (default ON)
  cbtCrisisEnabled: true, // Crisis intervention features (default ON)
  cbtDevRoutes: process.env.NODE_ENV === 'development', // Dev routes (default ON in dev)
  
  // Micro-Prompt Policy Engine
  adaptiveRemindersEnabled: true, // Micro-prompt policy and throttling
  
  // CRDT Pilot (P17 - Local-first multi-device) - PRODUCTION PILOT
  crdtPilot: true, // ENABLED - P17 production pilot for internal testing cohort
  
  // Persona Cast System (P18 - Evidence-based guidance)
  personaOrchestration: false, // OFF by default - development/testing only
  
  // Auto-Write Feature Flags (Safety Shell) - P12 TASK-AWARE INTEGRATION
  autoWriteCalendar: true, // ENABLED - P12 Task-aware calendar auto-write with safety gates
  autoWriteEmail: false, // DRAFTS ONLY - Never auto-send (P12)
  autoFinanceRead: false, // Read financial data (default OFF)
  autoFinanceInsights: false, // Generate financial insights (default OFF)
  autoWriteKillSwitch: false, // Global kill switch for all auto-write features (default OFF)
  
  // Voice System Consolidation (Phase 1)
  VOICE_ENGINE_UNIFIED: true,
  VOICE_SESSION_LOCK: true,
  VOICE_HOTKEY_UNIFIED: true,
  VOICE_ROUTER_UNIFIED: true,
  VOICE_DECISION_TRACE: true,
  VOICE_SETTINGS_UNIFIED: true,
  
  // Voice System Fallback Ladder
  VOICE_FALLBACK_LADDER: false,
  VOICE_WHISPER_ENABLED: false,
  VOICE_WEB_SPEECH_ENABLED: true,
  
  // Voice Auto-Commit & Confidence Gates
  VOICE_AUTO_COMMIT_DEFAULT: false,
  VOICE_CONFIDENCE_GATING: true,
  
  // Voice UI Features
  VOICE_TTS_CONFIRMATIONS: false,
  VOICE_LIVE_TRANSCRIPT: true,
  
  // Dev & Testing
  VOICE_DEV_ROUTE_ENABLED: true,
  VOICE_TELEMETRY_ENABLED: true,
  VOICE_DEBUG_LOGGING: true,
  
  // P19 Telemetry & Canary
  telemetryDashboard: process.env.NODE_ENV === 'development',
  taskCanary: process.env.NODE_ENV === 'development',
  privacyConsentV1: true,
  
  // P20 Phase 3 - Production Pipeline
  productionPipeline: true,
  migrationHelper: true,
  deploymentDashboard: process.env.NODE_ENV === 'development',
  
  // Phase 2: Architecture Completion
  dualWriteMigration: process.env.NODE_ENV === 'development',
  migrationParityDashboard: process.env.NODE_ENV === 'development',
  mergeConflictUI: process.env.NODE_ENV === 'development',
  decisionTracer: true,
  
  // Phase 3: End-User Polish
  unifiedDraftsFeed: true,
  personalEisenhower: true,
  splitViewComposer: true,
  diffView: true,

  // Phase 4: Activation Ritual + Dev Tools (WEEK 2-3)
  offlineLab: process.env.NODE_ENV === 'development',
  perfOverlay: process.env.NODE_ENV === 'development',
  activationRitualIntegration: true,
  completeE2ESuite: process.env.NODE_ENV === 'development',
  
  // P1 Masonry/Pinboard View (Calendar Focus)
  pinboardView: false, // Default OFF - progressive disclosure
  masonryAI: false, // AI suggestions for Masonry - Default OFF
  
  // P2 Calendar-AI Integration 
  calendarAIIntegration: false, // Seasonal & Habit engine integration - Default OFF
  calendarSuggestions: false, // AI scheduling suggestions - Default OFF
  
  // P3 Mobile & Performance Polish
  mobileGestures: true, // Touch gestures and mobile optimization
  performanceBudgets: process.env.NODE_ENV === 'development', // Performance monitoring
  
  // P4 Advanced Calendar Intelligence
  calendarIntelligence: false, // Stress detection and spacing suggestions - Default OFF
  conflictResolver: true, // Calendar conflict resolution
  
  // P5 Dev Health Dashboard Extensions
  calendarDevMetrics: process.env.NODE_ENV === 'development', // Calendar-specific dev metrics
} as const;

export type FeatureFlag = keyof typeof flags;

/**
 * Check if a feature flag is enabled
 * Supports localStorage overrides for development
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  // Check kill switch for auto-write features
  if (isAutoWriteFeature(flag) && isKillSwitchActive()) {
    return false;
  }
  
  // Check localStorage override first
  const storageKey = `flags.${flag}`;
  const override = localStorage.getItem(storageKey);
  
  if (override !== null) {
    return override === 'true';
  }
  
  // Fall back to default flag value
  return flags[flag];
}

export function updateFlag(flag: keyof typeof flags, value: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`flags.${flag}`, value.toString());
  }
}

/**
 * Check if a feature is an auto-write feature
 */
export function isAutoWriteFeature(flag: FeatureFlag): boolean {
  return ['autoWriteCalendar', 'autoWriteEmail', 'autoFinanceRead', 'autoFinanceInsights', 'contextEngine'].includes(flag);
}

/**
 * Check if the kill switch is active
 */
export function isKillSwitchActive(): boolean {
  const storageKey = 'flags.autoWriteKillSwitch';
  const override = localStorage.getItem(storageKey);
  return override === 'true' || flags.autoWriteKillSwitch;
}

/**
 * Toggle a feature flag in localStorage
 */
export function toggleFeatureFlag(flag: FeatureFlag, enabled: boolean): void {
  const storageKey = `flags.${flag}`;
  localStorage.setItem(storageKey, enabled.toString());
  
  // Dispatch event to notify components of flag change
  window.dispatchEvent(new CustomEvent('featureFlagChanged', {
    detail: { flag, enabled }
  }));
}

/**
 * Get all currently active flags (including localStorage overrides)
 */
export function getActiveFlags(): Record<FeatureFlag, boolean> {
  const result = {} as Record<FeatureFlag, boolean>;
  
  for (const flag of Object.keys(flags) as FeatureFlag[]) {
    result[flag] = isFeatureEnabled(flag);
  }
  
  return result;
}

/**
 * Clear all localStorage flag overrides
 */
export function clearFlagOverrides(): void {
  const flagKeys = Object.keys(localStorage).filter(key => key.startsWith('flags.'));
  flagKeys.forEach(key => localStorage.removeItem(key));
  
  window.dispatchEvent(new CustomEvent('featureFlagsCleared'));
}