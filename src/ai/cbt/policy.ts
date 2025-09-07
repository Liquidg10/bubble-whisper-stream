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
  
  // Crisis intervention always takes priority
  const crisisDecision = evaluateCrisisIntervention(latestAnnotation);
  if (crisisDecision.shouldIntervene) {
    return crisisDecision;
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
  confidence: number = 1.0
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
      confidence
    }
  };
}

function evaluateCrisisIntervention(annotation: CBTAnnotation): CBTDecision {
  const crisisFlags = annotation.crisisFlags;
  
  if (crisisFlags.length === 0) {
    return createDecision('none', 'No crisis detected', [], 'low');
  }
  
  // Determine highest severity crisis
  const criticalFlags = crisisFlags.filter(f => f.severity === 'critical');
  const highFlags = crisisFlags.filter(f => f.severity === 'high');
  
  if (criticalFlags.length > 0) {
    return createDecision('direct', 'Critical crisis intervention needed', [], 'crisis', 0, 1.0);
  }
  
  if (highFlags.length > 0) {
    return createDecision('direct', 'High-severity crisis support needed', [], 'crisis', 0, 0.9);
  }
  
  // Medium severity - gentle intervention
  return createDecision('gentle', 'Crisis support available', [], 'high', 0, 0.7);
}

function evaluateFatigue(
  fatigueState: CBTPolicyContext['fatigueState'], 
  userSettings: CBTPolicyContext['userSettings']
): { canIntervene: boolean; reason: string; cooldownMinutes?: number } {
  
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  
  // Daily limit check
  const maxDailyInterventions = userSettings.assistLevel === 'subtle' ? 3 : 6;
  if (fatigueState.dailyCount >= maxDailyInterventions) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const minutesUntilTomorrow = Math.ceil((tomorrow.getTime() - now) / (1000 * 60));
    
    return {
      canIntervene: false,
      reason: 'Daily intervention limit reached',
      cooldownMinutes: minutesUntilTomorrow
    };
  }
  
  // Recent intervention cooldown
  const minCooldownMs = userSettings.assistLevel === 'subtle' ? 2 * oneHour : oneHour;
  if (now - fatigueState.lastIntervention < minCooldownMs) {
    const cooldownMinutes = Math.ceil((minCooldownMs - (now - fatigueState.lastIntervention)) / (1000 * 60));
    return {
      canIntervene: false,
      reason: 'Recent intervention cooldown active',
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
  
  // Calculate intervention threshold based on assist level
  const confidenceThreshold = userSettings.assistLevel === 'subtle' ? 0.7 : 0.5;
  
  // Filter distortions by confidence
  const significantDistortions = annotation.distortions.filter(d => 
    d.confidence >= confidenceThreshold
  );
  
  if (significantDistortions.length === 0) {
    return createDecision('none', 'Distortions below confidence threshold', [], 'low');
  }
  
  // Determine intervention type based on severity and user settings
  const highConfidenceDistortions = significantDistortions.filter(d => d.confidence >= 0.8);
  const targetDistortions = significantDistortions.map(d => d.type);
  
  if (highConfidenceDistortions.length > 0 && userSettings.assistLevel === 'standard') {
    return createDecision('direct', 'High-confidence distortions detected', targetDistortions, 'medium', 30);
  }
  
  if (significantDistortions.length >= 2) {
    return createDecision('gentle', 'Multiple distortions detected', targetDistortions, 'medium', 60);
  }
  
  // Single distortion - subtle intervention
  return createDecision('silent', 'Single distortion detected', targetDistortions, 'low', 120);
}