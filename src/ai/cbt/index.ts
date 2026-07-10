/**
 * CBT Module - Cognitive Behavioral Therapy support system
 * 
 * This module provides automated thought pattern analysis and gentle intervention
 * capabilities for supporting users' mental wellbeing.
 */

// Core types
export type {
  DistortionType,
  CBTAnnotation,
  CBTDecision,
  CBTTrace,
  CBTPolicyContext,
  CrisisFlag,
  CBTAction,
  FatigueRule,
  RetentionPolicy
} from './types';

// Core modules
export { annotate } from './observer';
export { decide } from './policy';
export { render, formatActionForDisplay } from './acts';
export { traceService, CBTTraceService } from './trace';
export { fatigueService, CBTFatigueService } from './fatigue';

// Main orchestration function
import { annotate } from './observer';
import { decide } from './policy';
import { render } from './acts';
import { traceService } from './trace';
import { fatigueService } from './fatigue';
import type { CBTPolicyContext, CBTTrace, CBTAction } from './types';

/**
 * Main CBT pipeline - analyzes message and returns intervention if needed
 */
export async function processCBTMessage(
  message: string,
  messageId: string,
  userId: string,
  context: {
    userSettings: CBTPolicyContext['userSettings'];
    conversationContext?: CBTPolicyContext['conversationContext'];
    recentMood?: string;
    conversationId?: string;
    privacyLayer?: 'surface' | 'context' | 'deep';
  }
): Promise<{
  annotation: CBTTrace['annotation'];
  decision: CBTTrace['decision'];
  action: CBTAction | null;
  traceId?: string;
  // Item 4 (2026-07-03): populated whenever an intervention was recorded, regardless of
  // autoLogMode. In 'ask' mode nothing is persisted yet (traceId stays null/undefined) —
  // the UI is expected to show a consent prompt and call confirmAndPersist() with the
  // user's answer once they respond.
  traceCandidate?: Omit<CBTTrace, 'id' | 'pseudonymousId'>;
}> {
  
  // PROMPT 6: Crisis session check first
  const crisisSessionState = getCrisisSessionState(userId);
  if (crisisSessionState.inCrisisMode) {
    console.log('[CBT] Session silenced due to crisis mode');
    return { annotation: null, decision: null, action: null };
  }

  // Step 1: Early crisis detection before normal annotation
  const earlyAnnotation = annotate(message, {
    messageId,
    timestamp: Date.now(),
    recentMood: context.recentMood,
    conversationDepth: context.conversationContext?.messageCount || 0
  });

  // PROMPT 6: If crisis detected, bypass all CBT processing
  if (earlyAnnotation?.crisisFlags.length > 0) {
    console.log('[CBT] Crisis detected - bypassing CBT processing');
    
    // Set crisis session silencing
    setCrisisSessionState(userId, {
      inCrisisMode: true,
      crisisDetectedAt: Date.now(),
      cooldownMinutes: 60,
      crisisType: earlyAnnotation.crisisFlags[0].type,
      sessionId: `crisis_${Date.now()}`
    });

    const crisisResources = await getCrisisResources();
    const crisisAction: CBTAction = {
      type: 'crisis_support',
      text: 'I\'m here with you. You don\'t have to go through this alone. 💙',
      data: {
        resources: crisisResources.map(r => `${r.name}: ${r.contact}`),
        followUpQuestions: [
          'Would it help to talk about what\'s going on?',
          'Is there someone you trust who could be with you right now?',
          'What has helped you feel safer in the past?'
        ]
      }
    };

    const crisisDecision = {
      shouldIntervene: true,
      interventionType: 'none' as const,
      reason: 'crisis',
      targetDistortions: [],
      priority: 'crisis' as const,
      cooldownMinutes: 0,
      metadata: {
        fatigueScore: 0,
        policyMatch: 'crisis_detected',
        confidence: 1.0,
        isCrisis: true
      }
    };

    // Always persist crisis traces for safety
    const traceId = await traceService.persist({
      conversationId: context.conversationId || 'default',
      messageId,
      userId,
      distortion: 'all_or_nothing', // Placeholder
      reframe: undefined,
      createdAt: Date.now(),
      privacyLayer: context.privacyLayer || 'context',
      consent: true, // Crisis traces always consented for safety
      sensitive: true, // Mark as sensitive
      timestamp: Date.now(),
      annotation: earlyAnnotation,
      decision: crisisDecision,
      action: crisisAction
    }, true);

    return {
      annotation: earlyAnnotation,
      decision: crisisDecision,
      action: crisisAction,
      traceId
    };
  }

  // Continue with normal CBT processing
  const annotation = earlyAnnotation;
  if (!annotation) {
    return { annotation: null, decision: null, action: null };
  }
  
  // Step 2: Get current fatigue state
  const fatigueState = getCurrentFatigueState(userId);
  
  // Step 3: Make intervention decision
  const decision = decide(
    [annotation],
    context.userSettings,
    fatigueState,
    context.conversationContext,
    message
  );
  
  // Step 4: Render action if intervention needed
  const action = decision.shouldIntervene ? await render(decision) : null;
  
  // Step 5: Record trace and update fatigue
  let traceId: string | undefined;
  let traceCandidate: Omit<CBTTrace, 'id' | 'pseudonymousId'> | undefined;
  if (decision.shouldIntervene && action) {
    // Update fatigue state
    const updatedFatigueState = fatigueService.recordIntervention(
      fatigueState,
      decision.targetDistortions
    );
    saveFatigueState(userId, updatedFatigueState);

    // Item 4 (2026-07-03): 'on' persists immediately (unchanged); 'ask' used to be dead
    // code (`autoLogMode === 'ask' && false` — always false, nothing was ever asked or
    // saved). Now 'ask' builds the candidate and defers the actual persist+consent
    // decision to confirmAndPersist(), called once the UI's consent prompt is answered.
    const consentGiven = context.userSettings.autoLogMode === 'on';

    const primaryDistortion = annotation.distortions[0]?.type;
    const reframe = action?.data?.reframes?.[0];

    traceCandidate = {
      conversationId: context.conversationId || 'default',
      messageId,
      userId,
      distortion: primaryDistortion || 'all_or_nothing',
      reframe,
      createdAt: Date.now(),
      privacyLayer: context.privacyLayer || 'context',
      consent: consentGiven,
      // Legacy fields for backward compatibility
      timestamp: Date.now(),
      annotation,
      decision,
      action
    };

    // Record trace (no-ops and returns null when consentGiven is false, i.e. 'ask'/'off')
    traceId = await traceService.persist(traceCandidate, consentGiven);
  }

  return {
    annotation,
    decision,
    action,
    traceId,
    traceCandidate
  };
}

/**
 * Item 4 (2026-07-03): completes the 'ask' consent flow. The UI calls this once the user
 * answers the "ask before saving" prompt (shown when autoLogMode === 'ask' — see
 * cbtGuardService.shouldPromptBeforeLogging()) for the traceCandidate returned by
 * processCBTMessage. Persists (and returns a traceId) only if the user consented;
 * otherwise this is a no-op, matching what 'on' mode already does unconditionally.
 */
export async function confirmAndPersist(
  traceCandidate: Omit<CBTTrace, 'id' | 'pseudonymousId'>,
  consented: boolean
): Promise<string | undefined> {
  const traceId = await traceService.persist(
    { ...traceCandidate, consent: consented },
    consented
  );
  return traceId ?? undefined;
}

/**
 * Record user engagement with CBT action
 * PROMPT 4: Connect "Not now" dismissal to fatigue system
 */
export async function recordCBTEngagement(
  traceId: string,
  engaged: boolean,
  helpfulness?: number,
  userResponse?: string,
  userId?: string
): Promise<boolean> {
  // PROMPT 4: If user dismisses ("Not now"), record topic decline for cooldown
  if (!engaged && userId) {
    try {
      const trace = traceService.getById(traceId);
      if (trace && trace.decision.targetDistortions.length > 0) {
        const currentFatigue = getCurrentFatigueState(userId);
        const updatedFatigue = fatigueService.recordTopicDecline(
          currentFatigue,
          [trace.decision.targetDistortions[0]] // Primary distortion as array
        );
        saveFatigueState(userId, updatedFatigue);
      }
    } catch (error) {
      console.warn('Failed to record topic decline:', error);
    }
  }
  
  return traceService.updateOutcome(traceId, {
    userEngaged: engaged,
    helpfulness,
    userResponse
  });
}

/**
 * Get CBT statistics for user
 */
export function getCBTStats(userId: string) {
  return traceService.getStats(userId);
}

/**
 * Delete all CBT data for user
 */
export async function deleteCBTData(userId: string): Promise<number> {
  return traceService.deleteForUser(userId);
}

// Crisis session state management
interface CrisisSessionState {
  inCrisisMode: boolean;
  crisisDetectedAt: number;
  cooldownMinutes: number;
  crisisType: string;
  sessionId: string;
}

function getCrisisSessionState(userId: string): CrisisSessionState {
  const storageKey = `cbt_crisis_session_${userId}`;
  const stored = localStorage.getItem(storageKey);
  
  if (!stored) {
    return {
      inCrisisMode: false,
      crisisDetectedAt: 0,
      cooldownMinutes: 60,
      crisisType: '',
      sessionId: ''
    };
  }

  const parsed = JSON.parse(stored);
  
  // Check if cooldown has expired
  const now = Date.now();
  const cooldownExpiry = parsed.crisisDetectedAt + (parsed.cooldownMinutes * 60 * 1000);
  
  if (parsed.inCrisisMode && now > cooldownExpiry) {
    // Reset crisis mode
    const resetState = {
      inCrisisMode: false,
      crisisDetectedAt: 0,
      cooldownMinutes: 60,
      crisisType: '',
      sessionId: ''
    };
    localStorage.setItem(storageKey, JSON.stringify(resetState));
    return resetState;
  }

  return parsed;
}

function setCrisisSessionState(userId: string, state: CrisisSessionState): void {
  const storageKey = `cbt_crisis_session_${userId}`;
  localStorage.setItem(storageKey, JSON.stringify(state));
}

// Crisis resources helper
async function getCrisisResources() {
  try {
    const { getCrisisResources: getRegionalResources } = await import('./crisis');
    return getRegionalResources();
  } catch (error) {
    console.warn('Could not load regional crisis resources, using fallback');
    return [
      { name: 'Crisis Text Line', contact: 'Text HOME to 741741' },
      { name: '988 Suicide & Crisis Lifeline', contact: 'Call or text 988' },
      { name: 'Emergency Services', contact: 'Call your local emergency services' }
    ];
  }
}

// Helper functions for fatigue state management
function getCurrentFatigueState(userId: string): CBTPolicyContext['fatigueState'] {
  try {
    const stored = localStorage.getItem(`cbt_fatigue_${userId}`);
    if (stored) {
      const state = JSON.parse(stored);
      
      // Reset daily count if new day
      const today = new Date().toDateString();
      const lastDay = new Date(state.lastIntervention).toDateString();
      if (today !== lastDay) {
        state.dailyCount = 0;
      }
      
      return state;
    }
  } catch (error) {
    console.warn('Failed to load fatigue state:', error);
  }
  
  return fatigueService.resetFatigue();
}

function saveFatigueState(userId: string, state: CBTPolicyContext['fatigueState']): void {
  try {
    localStorage.setItem(`cbt_fatigue_${userId}`, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save fatigue state:', error);
  }
}