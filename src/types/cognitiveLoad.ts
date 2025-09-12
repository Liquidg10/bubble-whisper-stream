/**
 * P14 Cognitive Load Governor Types
 * Central type definitions for nudge budget and cooldown management
 */

export interface DomainBudget {
  domain: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  cooldownUntil?: number;
  lastNudge?: number;
  dismissCount: number;
  acceptCount: number;
  weeklyOverNudges: number;
}

export interface BudgetResult {
  allowed: boolean;
  reason: 'budget_available' | 'budget_exceeded' | 'cooldown_active' | 'user_overwhelmed' | 'feature_disabled';
  cooldownUntil?: number;
  suggestRecap?: boolean;
  metadata?: Record<string, any>;
}

export interface BlockedNudge {
  id: string;
  domain: string;
  type: string;
  originalContent: string;
  blockReason: string;
  urgency: 'low' | 'medium' | 'high';
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface NudgeRecap {
  id: string;
  type: 'daily_summary' | 'weekly_digest' | 'insight_collection' | 'priority_rollup';
  blockedNudges: BlockedNudge[];
  summary: string;
  insights: string[];
  actionableItems: string[];
  scheduledFor: number;
  priority: 'low' | 'medium' | 'high';
  deliveryMethod: 'toast' | 'modal' | 'sidebar' | 'email';
  estimatedReadTime: number;
  metadata?: Record<string, any>;
}

export interface CooldownStatus {
  domain: string;
  reason: string;
  until: number;
  duration: number;
  canOverride: boolean;
  extensionCount?: number;
  baseMinutes?: number;
  extensionFactor?: number;
}

export interface AdaptiveCooldownRule {
  trigger: 'dismissal' | 'budget_exceeded' | 'context_stress' | 'overwhelm';
  baseMinutes: number;
  extensionFactor: number;
  maxMinutes: number;
  recoveryFactor: number;
  contextChecks?: string[];
}

export interface WeeklyMetrics {
  weekStart: string;
  totalNudges: number;
  overNudgeIncidents: number;
  domainsOverBudget: string[];
  avgAcceptanceRate: number;
  avgDismissalRate: number;
  fatigueReports: number;
  cooldownExtensions: number;
  recapConversions: number;
  userSatisfactionScore?: number;
}

export interface OverwhelmContext {
  activeMeetings: number;
  emailBacklog: number;
  tasksDue: number;
  calendarDensity: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
  recentStressSignals: string[];
}

export interface RecapDeliveryOptions {
  preferredTime: 'immediate' | 'next_break' | 'end_of_day' | 'morning_digest';
  maxRecapsPerDay: number;
  combineMultipleDomains: boolean;
  includeActionableItems: boolean;
  includeInsights: boolean;
  deliveryMethod: 'toast' | 'modal' | 'sidebar' | 'email';
}

export interface FatigueReport {
  userId: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
  domains: string[];
  triggeredBy?: string;
  userFeedback?: string;
}

export interface BudgetAnalytics {
  domain: string;
  period: 'daily' | 'weekly' | 'monthly';
  budgetUtilization: number;
  acceptanceRate: number;
  dismissalRate: number;
  cooldownFrequency: number;
  recapConversions: number;
  userSatisfaction: number;
  optimalBudgetSuggestion?: number;
}

export interface NudgeConversionMetrics {
  totalNudgesBlocked: number;
  recapsGenerated: number;
  recapsDelivered: number;
  recapEngagementRate: number;
  valuePreservationScore: number;
  userPreferenceAlignment: number;
}