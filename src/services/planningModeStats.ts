/**
 * P7 Planning Mode Statistics Service
 * Tracks planning workflow completion and optimization metrics
 */

import { isFeatureEnabled } from '@/config/flags';
import { logger } from '@/utils/logger';
import type { Task } from '@/types/task';

export interface PlanningSession {
  taskId: string;
  startedAt: number;
  completedAt?: number;
  skippedAt?: number;
  stepPath: string[]; // Which steps were completed
  tapCount: number;
  timeToComplete?: number;
  planningData: {
    wish?: string;
    outcome?: string;
    obstacle?: string;
    plan?: string;
  };
  conversionType?: 'calendar' | 'reminder' | 'none';
  conversionSuccess?: boolean;
}

export interface PlanningMetrics {
  totalSessions: number;
  completionRate: number;
  averageTapsToComplete: number;
  averageTimeToComplete: number;
  skipRate: number;
  conversionRates: {
    calendar: number;
    reminder: number;
    none: number;
  };
  stepCompletionRates: {
    wish: number;
    outcome: number;
    obstacle: number;
    plan: number;
  };
  optimalPathSuggestion: string[];
}

export interface WeeklyPlanningReport {
  weekStart: string;
  sessionsStarted: number;
  sessionsCompleted: number;
  tasksWithPlanning: number;
  avgCompletionTime: number;
  topObstacles: string[];
  topPlans: string[];
  userSatisfactionScore?: number;
}

class PlanningModeStatsService {
  private readonly STORAGE_KEY = 'planning_sessions';
  private readonly METRICS_KEY = 'planning_metrics';
  private activeSessions = new Map<string, PlanningSession>();

  /**
   * Start tracking a new planning session
   */
  startPlanningSession(task: Task): string {
    if (!isFeatureEnabled('planningMode')) return '';

    const sessionId = `planning-${task.id}-${Date.now()}`;
    const session: PlanningSession = {
      taskId: task.id,
      startedAt: Date.now(),
      stepPath: [],
      tapCount: 0,
      planningData: {}
    };

    this.activeSessions.set(sessionId, session);
    logger.debug('Planning session started', { sessionId, taskId: task.id });

    return sessionId;
  }

  /**
   * Record a step completion in the planning workflow
   */
  recordStepCompletion(sessionId: string, step: string, value: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.stepPath.push(step);
    session.tapCount += 1;
    session.planningData[step as keyof typeof session.planningData] = value;

    logger.debug('Planning step completed', { 
      sessionId, 
      step, 
      totalSteps: session.stepPath.length,
      tapCount: session.tapCount
    });
  }

  /**
   * Record a tap/interaction in the planning session
   */
  recordTap(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.tapCount += 1;
  }

  /**
   * Complete a planning session successfully
   */
  completePlanningSession(
    sessionId: string, 
    conversionType: 'calendar' | 'reminder' | 'none' = 'none',
    conversionSuccess: boolean = false
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.completedAt = Date.now();
    session.timeToComplete = session.completedAt - session.startedAt;
    session.conversionType = conversionType;
    session.conversionSuccess = conversionSuccess;

    this.savePlanningSession(session);
    this.activeSessions.delete(sessionId);

    logger.info('Planning session completed', {
      sessionId,
      timeToComplete: session.timeToComplete,
      tapCount: session.tapCount,
      stepsCompleted: session.stepPath.length,
      conversionType,
      conversionSuccess
    });

    // Check if ≤4 taps constraint was met
    if (session.tapCount <= 4) {
      logger.info('Planning session efficiency achieved', {
        sessionId,
        tapCount: session.tapCount,
        optimal: true
      });
    } else {
      logger.info('Planning session exceeded tap target', {
        sessionId,
        tapCount: session.tapCount,
        optimal: false,
        suggestion: 'optimize_workflow'
      });
    }
  }

  /**
   * Skip a planning session
   */
  skipPlanningSession(sessionId: string, reason?: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.skippedAt = Date.now();
    session.timeToComplete = session.skippedAt - session.startedAt;

    this.savePlanningSession(session);
    this.activeSessions.delete(sessionId);

    logger.info('Planning session skipped', {
      sessionId,
      reason,
      timeBeforeSkip: session.timeToComplete,
      stepsCompleted: session.stepPath.length
    });
  }

  /**
   * Get current planning metrics
   */
  getPlanningMetrics(): PlanningMetrics {
    const sessions = this.getAllSessions();
    
    if (sessions.length === 0) {
      return this.createEmptyMetrics();
    }

    const completedSessions = sessions.filter(s => s.completedAt);
    const skippedSessions = sessions.filter(s => s.skippedAt);

    const metrics: PlanningMetrics = {
      totalSessions: sessions.length,
      completionRate: completedSessions.length / sessions.length,
      averageTapsToComplete: this.calculateAverageTaps(completedSessions),
      averageTimeToComplete: this.calculateAverageTime(completedSessions),
      skipRate: skippedSessions.length / sessions.length,
      conversionRates: this.calculateConversionRates(completedSessions),
      stepCompletionRates: this.calculateStepCompletionRates(sessions),
      optimalPathSuggestion: this.suggestOptimalPath(completedSessions)
    };

    return metrics;
  }

  /**
   * Generate weekly planning report
   */
  getWeeklyReport(weekStart?: Date): WeeklyPlanningReport {
    const start = weekStart || this.getWeekStart(new Date());
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

    const sessions = this.getAllSessions().filter(session =>
      session.startedAt >= start.getTime() && session.startedAt < end.getTime()
    );

    const completedSessions = sessions.filter(s => s.completedAt);

    return {
      weekStart: start.toISOString(),
      sessionsStarted: sessions.length,
      sessionsCompleted: completedSessions.length,
      tasksWithPlanning: new Set(sessions.map(s => s.taskId)).size,
      avgCompletionTime: this.calculateAverageTime(completedSessions),
      topObstacles: this.getTopValues(completedSessions.map(s => s.planningData.obstacle).filter(Boolean)),
      topPlans: this.getTopValues(completedSessions.map(s => s.planningData.plan).filter(Boolean))
    };
  }

  /**
   * Check if task should show planning prompt
   */
  shouldPromptPlanning(task: Task): boolean {
    if (!isFeatureEnabled('planningMode')) return false;

    // Don't prompt if task already has planning
    if (task.metadata?.planning) return false;

    // Prompt for higher priority tasks
    if (task.priority > 70) return true;

    // Prompt for tasks with certain keywords
    const planningKeywords = ['project', 'important', 'deadline', 'meeting', 'goal'];
    const hasKeyword = planningKeywords.some(keyword =>
      task.title.toLowerCase().includes(keyword)
    );

    return hasKeyword;
  }

  /**
   * Get acceptance rate for planning prompts
   */
  getPlanningAcceptanceRate(): number {
    const sessions = this.getAllSessions();
    if (sessions.length === 0) return 0;

    const completed = sessions.filter(s => s.completedAt).length;
    return completed / sessions.length;
  }

  private savePlanningSession(session: PlanningSession): void {
    try {
      const sessions = this.getAllSessions();
      sessions.push(session);
      
      // Keep only last 100 sessions
      const recent = sessions.slice(-100);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recent));
    } catch (error) {
      logger.error('Failed to save planning session', error);
    }
  }

  private getAllSessions(): PlanningSession[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      logger.error('Failed to load planning sessions', error);
      return [];
    }
  }

  private calculateAverageTaps(sessions: PlanningSession[]): number {
    if (sessions.length === 0) return 0;
    const total = sessions.reduce((sum, s) => sum + s.tapCount, 0);
    return total / sessions.length;
  }

  private calculateAverageTime(sessions: PlanningSession[]): number {
    if (sessions.length === 0) return 0;
    const validSessions = sessions.filter(s => s.timeToComplete);
    if (validSessions.length === 0) return 0;
    
    const total = validSessions.reduce((sum, s) => sum + (s.timeToComplete || 0), 0);
    return total / validSessions.length;
  }

  private calculateConversionRates(sessions: PlanningSession[]): PlanningMetrics['conversionRates'] {
    if (sessions.length === 0) {
      return { calendar: 0, reminder: 0, none: 0 };
    }

    const calendar = sessions.filter(s => s.conversionType === 'calendar').length;
    const reminder = sessions.filter(s => s.conversionType === 'reminder').length;
    const none = sessions.filter(s => s.conversionType === 'none').length;

    return {
      calendar: calendar / sessions.length,
      reminder: reminder / sessions.length,
      none: none / sessions.length
    };
  }

  private calculateStepCompletionRates(sessions: PlanningSession[]): PlanningMetrics['stepCompletionRates'] {
    if (sessions.length === 0) {
      return { wish: 0, outcome: 0, obstacle: 0, plan: 0 };
    }

    const steps = ['wish', 'outcome', 'obstacle', 'plan'];
    const rates: any = {};

    steps.forEach(step => {
      const completed = sessions.filter(s => s.stepPath.includes(step)).length;
      rates[step] = completed / sessions.length;
    });

    return rates;
  }

  private suggestOptimalPath(sessions: PlanningSession[]): string[] {
    // Analyze successful sessions (≤4 taps) to suggest optimal workflow
    const efficientSessions = sessions.filter(s => s.tapCount <= 4 && s.completedAt);
    
    if (efficientSessions.length === 0) {
      return ['wish', 'outcome', 'obstacle', 'plan']; // Default path
    }

    // Find most common efficient path
    const pathCounts = new Map<string, number>();
    efficientSessions.forEach(session => {
      const pathKey = session.stepPath.join(',');
      pathCounts.set(pathKey, (pathCounts.get(pathKey) || 0) + 1);
    });

    const mostCommonPath = Array.from(pathCounts.entries())
      .sort(([,a], [,b]) => b - a)[0];

    return mostCommonPath ? mostCommonPath[0].split(',') : ['wish', 'outcome', 'obstacle', 'plan'];
  }

  private getTopValues(values: string[]): string[] {
    const counts = new Map<string, number>();
    values.forEach(value => {
      counts.set(value, (counts.get(value) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([value]) => value);
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  private createEmptyMetrics(): PlanningMetrics {
    return {
      totalSessions: 0,
      completionRate: 0,
      averageTapsToComplete: 0,
      averageTimeToComplete: 0,
      skipRate: 0,
      conversionRates: { calendar: 0, reminder: 0, none: 0 },
      stepCompletionRates: { wish: 0, outcome: 0, obstacle: 0, plan: 0 },
      optimalPathSuggestion: ['wish', 'outcome', 'obstacle', 'plan']
    };
  }
}

export const planningModeStatsService = new PlanningModeStatsService();
