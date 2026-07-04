/**
 * CBT Policy Engine - Makes intervention decisions based on annotations and context
 */

import type { CBTAnnotation, CBTDecision, CBTPolicyContext, DistortionType } from './types';
import { MAX_DAILY_INTERVENTIONS } from './fatigue';

export function decide(
  annotations: CBTAnnotation[],
  userSettings: CBTPolicyContext['userSettings'],
  fatigueState: CBTPolicyContext['fatigueState'],
  conversationContext?: CBTPolicyContext['conversationContext'],
  // Item 1 (2026-07-03): raw message text, so checkTopicExclusions can match against
  // what the user actually wrote instead of the distortion's static keyword list.
  message?: string
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
  
  // Check fatigue constraints (topic-scoped: only this message's distortion types matter)
  const relevantTopics = latestAnnotation.distortions.map(d => d.type);
  const fatigueCheck = evaluateFatigue(fatigueState, userSettings, relevantTopics);
  if (!fatigueCheck.canIntervene) {
    return createDecision('none', fatigueCheck.reason, [], 'low', fatigueCheck.cooldownMinutes);
  }
  
  // Check quiet hours
  if (isQuietHours(userSettings)) {
    return createDecision('none', 'Quiet hours active', [], 'low', getMinutesUntilQuietHoursEnd(userSettings));
  }
  
  // Check topic exclusions
  const hasExcludedTopic = checkTopicExclusions(message, userSettings);
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
  userSettings: CBTPolicyContext['userSettings'],
  relevantTopics: DistortionType[] = []
): { canIntervene: boolean; reason: string; cooldownMinutes?: number } {
  
  const now = Date.now();

  // Item 6 (2026-07-03): the blanket cross-topic "recent intervention" cooldown that used
  // to live here (block ANY intervention for 30min regardless of topic) has been removed.
  // Mark's call: keep the older topic-scoped design (below) — a user can get multiple
  // same-day interventions as long as they're about different topics — and rely solely on
  // the per-topic 30min cooldown (further down) plus the daily cap for throttling.

  // PROMPT 3 / Item 6: Max MAX_DAILY_INTERVENTIONS prompts/day total (regardless of assist level)
  if (fatigueState.dailyCount >= MAX_DAILY_INTERVENTIONS) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const minutesUntilTomorrow = Math.ceil((tomorrow.getTime() - now) / (1000 * 60));

    return {
      canIntervene: false,
      reason: `Daily intervention limit reached (${MAX_DAILY_INTERVENTIONS}/day)`,
      cooldownMinutes: minutesUntilTomorrow
    };
  }
  
  // PROMPT 3: Check 24h topic decline snooze (scoped to this message's topics only)
  const topicDeclines = fatigueState.topicDeclines || {};
  const relevantDeclineTimes = relevantTopics
    .map(topic => topicDeclines[topic])
    .filter((t): t is number => typeof t === 'number' && now < t);
  if (relevantDeclineTimes.length > 0) {
    const nextAvailable = Math.min(...relevantDeclineTimes);
    const cooldownMinutes = Math.ceil((nextAvailable - now) / (1000 * 60));
    return {
      canIntervene: false,
      reason: 'Topic decline auto-snooze active (24h)',
      cooldownMinutes
    };
  }
  
  // PROMPT 3: Check 30min topic cooldown (scoped to this message's topics only)
  const topicCooldowns = fatigueState.topicCooldowns || {};
  const relevantCooldownTimes = relevantTopics
    .map(topic => topicCooldowns[topic])
    .filter((t): t is number => typeof t === 'number' && now < t);
  if (relevantCooldownTimes.length > 0) {
    const nextAvailable = Math.min(...relevantCooldownTimes);
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

/**
 * Item 1 (2026-07-03): matches user-configured topicExclusions/neverInterveneOn against
 * the actual message text (case-insensitive substring match), instead of the distortion's
 * own generic static keyword list — which could never contain a user-chosen exclusion term
 * like 'work' or 'projects' and so could never exclude anything.
 */
function checkTopicExclusions(
  message: string | undefined,
  userSettings: CBTPolicyContext['userSettings']
): boolean {
  const exclusions = userSettings.topicExclusions.concat(userSettings.neverInterveneOn);
  if (exclusions.length === 0 || !message) return false;

  const lowerMessage = message.toLowerCase();
  return exclusions.some(exclusion => lowerMessage.includes(exclusion.toLowerCase()));
}

function evaluateDistortionIntervention(
  annotation: CBTAnnotation,
  userSettings: CBTPolicyContext['userSettings'],
  fatigueState: CBTPolicyContext['fatigueState']
): CBTDecision {
  
  if (annotation.distortions.length === 0) {
    return createDecision('none', 'No distortions detected', [], 'low');
  }
  
  // PROMPT 8: Use user-specific confidence thresholds from learning service
  const confidenceThreshold = getUserConfidenceThreshold(annotation.distortions, userSettings);
  
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

/**
 * PROMPT 8: Get user-specific confidence threshold based on learning preferences
 */
function getUserConfidenceThreshold(
  distortions: CBTAnnotation['distortions'],
  userSettings: CBTPolicyContext['userSettings']
): number {
  // Use the highest user-specific threshold for any detected distortion
  let maxThreshold = 0.85; // Default
  
  try {
    // Import learning service dynamically to avoid circular deps
    const learningPrefs = typeof localStorage !== 'undefined' ? localStorage.getItem('cbt_learning_preferences') : null;
    if (learningPrefs) {
      const prefs = JSON.parse(learningPrefs);
      distortions.forEach(distortion => {
        const userThreshold = prefs.distortionThresholds?.[distortion.type];
        if (userThreshold && userThreshold > maxThreshold) {
          maxThreshold = userThreshold;
        }
      });
    }
  } catch (error) {
    console.warn('[CBT Policy] Failed to get user thresholds:', error);
  }
  
  return maxThreshold;
}