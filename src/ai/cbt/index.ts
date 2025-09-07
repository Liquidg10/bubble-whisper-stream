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
    
    // Record trace
    traceId = await traceService.persist({
      userId,
      timestamp: Date.now(),
      annotation,
      decision,
      action: action || undefined
    });
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
 */
export async function recordCBTEngagement(
  traceId: string,
  engaged: boolean,
  helpfulness?: number,
  userResponse?: string
): Promise<boolean> {
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