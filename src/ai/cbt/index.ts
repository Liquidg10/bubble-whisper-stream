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
}> {
  
  // Step 1: Analyze the message
  const annotation = annotate(message, {
    messageId,
    timestamp: Date.now(),
    recentMood: context.recentMood,
    conversationDepth: context.conversationContext?.messageCount || 0
  });
  
  // Step 2: Get current fatigue state
  const fatigueState = getCurrentFatigueState(userId);
  
  // Step 3: Make intervention decision
  const decision = decide(
    [annotation],
    context.userSettings,
    fatigueState,
    context.conversationContext
  );
  
  // Step 4: Render action if intervention needed
  const action = decision.shouldIntervene ? render(decision) : null;
  
  // Step 5: Record trace and update fatigue
  let traceId: string | undefined;
  if (decision.shouldIntervene) {
    // Update fatigue state
    const updatedFatigueState = fatigueService.recordIntervention(
      fatigueState,
      decision.targetDistortions
    );
    saveFatigueState(userId, updatedFatigueState);
    
    // Determine if consent was given
    const consentGiven = context.userSettings.autoLogMode === 'on' || 
                        (context.userSettings.autoLogMode === 'ask' && false);
    
    const primaryDistortion = annotation.distortions[0]?.type;
    const reframe = action?.data?.reframes?.[0];
    
    // Record trace
    traceId = await traceService.persist({
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
      action: action || undefined
    }, consentGiven);
  }
  
  return {
    annotation,
    decision,
    action,
    traceId
  };
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