/**
 * CBT Policy Engine - Makes intervention decisions based on annotations and context
 */

import type { CBTAnnotation, CBTDecision, CBTPolicyContext, DistortionType } from './types';

export function decide(
  annotations: CBTAnnotation[], 
  userSettings: CBTPolicyContext['userSettings'],
  fatigueState: CBTPolicyContext['fatigueState'],
  conversationContext?: CBTPolicyContext['conversationContext']
): CBTDecision {
  
  // Quick exit for disabled assistance
  if (userSettings.assistLevel === 'off') {
    return createDecision('none', 'User has disabled CBT assistance', [], 'low');
  }
  
  // Get the latest annotation (most recent message)
  const latestAnnotation = annotations[annotations.length - 1];
  if (!latestAnnotation) {
    return createDecision('none', 'No annotations to process', [], 'low');
  }
  
  // PROMPT 3: Crisis detection but don't shouldIntervene, route externally
  const crisisDecision = evaluateCrisisIntervention(latestAnnotation);
  if (crisisDecision.metadata.isCrisis) {
    return crisisDecision; // Returns 'none' but with crisis flag for external routing
  }
  
  // Check fatigue constraints
  const fatigueCheck = evaluateFatigue(fatigueState, userSettings);
  if (!fatigueCheck.canIntervene) {
    return createDecision('none', fatigueCheck.reason, [], 'low', fatigueCheck.cooldownMinutes);
  }
  
  // Check quiet hours
  if (isQuietHours(userSettings)) {
    return createDecision('none', 'Quiet hours active', [], 'low', getMinutesUntilQuietHoursEnd(userSettings));
  }
  
  // Check topic exclusions
  const hasExcludedTopic = checkTopicExclusions(latestAnnotation, userSettings);
  if (hasExcludedTopic) {
    return createDecision('none', 'Message contains excluded topic', [], 'low');
  }
  
  // Evaluate distortions for intervention
  return evaluateDistortionIntervention(latestAnnotation, userSettings, fatigueState);
}

function createDecision(
  interventionType: CBTDecision['interventionType'],
  reason: string,
  targetDistortions: DistortionType[],
  priority: CBTDecision['priority'],
  cooldownMinutes: number = 0,
  confidence: number = 1.0,
  isCrisis: boolean = false
): CBTDecision {
  return {
    shouldIntervene: interventionType !== 'none',
    interventionType,
    reason,
    targetDistortions,
    priority,
    cooldownMinutes,
    metadata: {
      fatigueScore: 0, // Will be calculated by fatigue module
      policyMatch: reason,
      confidence,
      isCrisis
    }
  };
}

function evaluateCrisisIntervention(annotation: CBTAnnotation): CBTDecision {
  const crisisFlags = annotation.crisisFlags;
  
  if (crisisFlags.length === 0) {
    return createDecision('none', 'No crisis detected', [], 'low');
  }
  
  // PROMPT 3: Crisis detected -> action=none, reason=crisis (route to external crisis flow)
  const criticalFlags = crisisFlags.filter(f => f.severity === 'critical');
  const highFlags = crisisFlags.filter(f => f.severity === 'high');
  
  if (criticalFlags.length > 0) {
    return createDecision('none', 'crisis', [], 'crisis', 0, 1.0, true);
  }
  
  if (highFlags.length > 0) {
    return createDecision('none', 'crisis', [], 'crisis', 0, 0.9, true);
  }
  
  // Medium severity - still route to crisis system
  return createDecision('none', 'crisis', [], 'high', 0, 0.7, true);
}

function evaluateFatigue(
  fatigueState: CBTPolicyContext['fatigueState'], 
  userSettings: CBTPolicyContext['userSettings']
): { canIntervene: boolean; reason: string; cooldownMinutes?: number } {
  
  const now = Date.now();
  
  // PROMPT 3: Max 2 prompts/day total (regardless of assist level)
  if (fatigueState.dailyCount >= 2) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const minutesUntilTomorrow = Math.ceil((tomorrow.getTime() - now) / (1000 * 60));
    
    return {
      canIntervene: false,
      reason: 'Daily intervention limit reached (2/day)',
      cooldownMinutes: minutesUntilTomorrow
    };
  }
  
  // PROMPT 3: Check 24h topic decline snooze
  const topicDeclines = fatigueState.topicDeclines || {};
  const hasActiveDecline = Object.values(topicDeclines).some(snoozeTime => now < snoozeTime);
  if (hasActiveDecline) {
    const nextAvailable = Math.min(...Object.values(topicDeclines).filter(t => t > now));
    const cooldownMinutes = Math.ceil((nextAvailable - now) / (1000 * 60));
    return {
      canIntervene: false,
      reason: 'Topic decline auto-snooze active (24h)',
      cooldownMinutes
    };
  }
  
  // PROMPT 3: Check 30min topic cooldown
  const topicCooldowns = fatigueState.topicCooldowns || {};
  const hasActiveCooldown = Object.values(topicCooldowns).some(cooldownTime => now < cooldownTime);
  if (hasActiveCooldown) {
    const nextAvailable = Math.min(...Object.values(topicCooldowns).filter(t => t > now));
    const cooldownMinutes = Math.ceil((nextAvailable - now) / (1000 * 60));
    return {
      canIntervene: false,
      reason: 'Topic cooldown active (30min)',
      cooldownMinutes
    };
  }
  
  return { canIntervene: true, reason: 'No fatigue constraints' };
}

function isQuietHours(userSettings: CBTPolicyContext['userSettings']): boolean {
  if (!userSettings.quietHours?.enabled) return false;
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  
  const [startHour, startMin] = userSettings.quietHours.start.split(':').map(Number);
  const [endHour, endMin] = userSettings.quietHours.end.split(':').map(Number);
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;
  
  if (startTime <= endTime) {
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    // Overnight quiet hours
    return currentTime >= startTime || currentTime <= endTime;
  }
}

function getMinutesUntilQuietHoursEnd(userSettings: CBTPolicyContext['userSettings']): number {
  if (!userSettings.quietHours?.enabled) return 0;
  
  const now = new Date();
  const [endHour, endMin] = userSettings.quietHours.end.split(':').map(Number);
  
  const endTime = new Date(now);
  endTime.setHours(endHour, endMin, 0, 0);
  
  // If end time is tomorrow
  if (endTime <= now) {
    endTime.setDate(endTime.getDate() + 1);
  }
  
  return Math.ceil((endTime.getTime() - now.getTime()) / (1000 * 60));
}

function checkTopicExclusions(
  annotation: CBTAnnotation, 
  userSettings: CBTPolicyContext['userSettings']
): boolean {
  const exclusions = userSettings.topicExclusions.concat(userSettings.neverInterveneOn);
  if (exclusions.length === 0) return false;
  
  // Check if any distortion keywords match exclusions
  return annotation.distortions.some(distortion =>
    distortion.keywords.some(keyword =>
      exclusions.some(exclusion =>
        keyword.toLowerCase().includes(exclusion.toLowerCase())
      )
    )
  );
}

function evaluateDistortionIntervention(
  annotation: CBTAnnotation,
  userSettings: CBTPolicyContext['userSettings'],
  fatigueState: CBTPolicyContext['fatigueState']
): CBTDecision {
  
  if (annotation.distortions.length === 0) {
    return createDecision('none', 'No distortions detected', [], 'low');
  }
  
  // PROMPT 3: Confidence threshold ≥ 0.85 for intervention
  const confidenceThreshold = 0.85;
  
  // Filter distortions by confidence
  const significantDistortions = annotation.distortions.filter(d => 
    d.confidence >= confidenceThreshold
  );
  
  if (significantDistortions.length === 0) {
    return createDecision('none', 'Distortions below confidence threshold (0.85)', [], 'low');
  }
  
  // PROMPT 3: Simplified decision - if ≥0.85 confidence and passes fatigue/quiet/topic checks → chip
  const targetDistortions = significantDistortions.map(d => d.type);
  
  // Return chip intervention (subtle nudge, no clinical label)
  return createDecision('chip', 'High-confidence distortion detected', targetDistortions, 'medium', 30);
}