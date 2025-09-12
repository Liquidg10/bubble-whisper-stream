/**
 * User Context Service - Enhanced personalization and memory
 * Integrates with selfModelV2Service for persistent user understanding
 */

import { selfModelV2Service, SelfModelV2, PatternHint } from './selfModelV2Service';
import { storageService } from './storage';

export interface UserContext {
  preferences: {
    name?: string;
    communicationStyle?: 'friend' | 'coach' | 'scientist' | 'future-you';
    workSchedule?: string;
    timeZone?: string;
    primaryGoals?: string[];
    onboardingCompleted?: boolean;
    // P18 Persona preferences
    privacyLayer?: 'surface' | 'context' | 'deep';
    nudgeFrequency?: 'minimal' | 'occasional' | 'regular';
    interventionStyle?: 'suggest' | 'draft' | 'auto_gentle';
  };
  patterns: PatternHint[];
  recentActivity: {
    lastLogin?: number;
    bubblesCreated?: number;
    voiceCommands?: number;
    glimmersReceived?: number;
  };
  personalContext?: string;
  currentChallenges?: string;
}

export interface GlimmerPersonalizationData {
  userContext: UserContext;
  timeContext: {
    timeOfDay: string;
    dayOfWeek: string;
    mood?: string;
  };
  recentPatterns: PatternHint[];
  contextualTriggers: string[];
}

class UserContextService {
  private cachedContext: UserContext | null = null;
  private lastCacheUpdate = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get enriched user context for personalization
   */
  async getUserContext(): Promise<UserContext> {
    const now = Date.now();
    
    // Return cached version if still fresh
    if (this.cachedContext && (now - this.lastCacheUpdate) < this.CACHE_DURATION) {
      return this.cachedContext;
    }

    try {
      const selfModel = await selfModelV2Service.getSelfModel();
      const patterns = await selfModelV2Service.getPatternHints();
      
      // Get activity data from local storage
      const activityData = await this.getRecentActivity();

      this.cachedContext = {
        preferences: selfModel.preferences as UserContext['preferences'],
        patterns: patterns.filter(p => p.confidence > 0.3), // Only confident patterns
        recentActivity: activityData,
        personalContext: selfModel.preferences.personalContext as string,
        currentChallenges: selfModel.preferences.currentChallenges as string
      };

      this.lastCacheUpdate = now;
      return this.cachedContext;
    } catch (error) {
      console.error('Failed to get user context:', error);
      
      // Return minimal context on error
      return {
        preferences: {},
        patterns: [],
        recentActivity: {}
      };
    }
  }

  /**
   * Check if user has completed initial onboarding
   */
  async hasCompletedOnboarding(): Promise<boolean> {
    const context = await this.getUserContext();
    return !!context.preferences.onboardingCompleted;
  }

  /**
   * Get personalization data for glimmer generation
   */
  async getGlimmerPersonalizationData(trigger: string): Promise<GlimmerPersonalizationData> {
    const userContext = await this.getUserContext();
    const now = new Date();
    
    const timeContext = {
      timeOfDay: this.getTimeOfDay(now),
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      mood: await this.inferCurrentMood()
    };

    // Get relevant patterns based on time and trigger
    const recentPatterns = userContext.patterns
      .filter(p => this.isPatternRelevant(p, trigger, timeContext))
      .slice(0, 3); // Top 3 relevant patterns

    // Generate contextual triggers
    const contextualTriggers = this.generateContextualTriggers(userContext, timeContext);

    return {
      userContext,
      timeContext,
      recentPatterns,
      contextualTriggers
    };
  }

  /**
   * Update user activity metrics
   */
  async trackActivity(activityType: 'bubble_created' | 'voice_command' | 'glimmer_received' | 'login'): Promise<void> {
    try {
      const key = `user_activity_${activityType}`;
      const stored = localStorage.getItem(key);
      const current = stored ? parseInt(stored, 10) : 0;
      
      localStorage.setItem(key, (current + 1).toString());
      
      if (activityType === 'login') {
        localStorage.setItem('last_login', Date.now().toString());
      }

      // Invalidate cache
      this.cachedContext = null;
    } catch (error) {
      console.error('Failed to track activity:', error);
    }
  }

  /**
   * Add pattern hint based on user behavior
   */
  async addPatternHint(key: string, value: string, confidence: number = 0.7, layer: 'surface' | 'context' | 'deep' = 'context'): Promise<void> {
    try {
      await selfModelV2Service.addPatternHint({
        key,
        value,
        confidence,
        layer
      });

      // Invalidate cache
      this.cachedContext = null;
    } catch (error) {
      console.error('Failed to add pattern hint:', error);
    }
  }

  /**
   * Get confidence threshold for personalized vs generic glimmers
   */
  getPersonalizationConfidenceThreshold(userContext: UserContext): number {
    const baseThreshold = 0.6;
    
    // Lower threshold if we have good user data
    let adjustment = 0;
    
    if (userContext.preferences.name) adjustment -= 0.1;
    if (userContext.preferences.communicationStyle) adjustment -= 0.1;
    if (userContext.patterns.length > 3) adjustment -= 0.1;
    if (userContext.personalContext) adjustment -= 0.1;
    
    return Math.max(0.3, baseThreshold + adjustment);
  }

  /**
   * Record a successful plan completion for learning
   */
  async recordPlanCompletion(planId: string, planType: string): Promise<void> {
    await this.addPatternHint(
      `successful_plan_${planType}`,
      `Completed ${planType} plan successfully`,
      0.8,
      'context'
    );
    
    await this.trackActivity('bubble_created'); // Plans often create bubbles
  }

  /**
   * Record a plan modification for learning user preferences
   */
  async recordPlanModification(planType: string, modification: string): Promise<void> {
    await this.addPatternHint(
      `plan_modification_${planType}`,
      modification,
      0.7,
      'context'
    );
  }

  /**
   * Get personalization insights for plan generation
   */
  getPersonalizationInsights(): {
    preferredPlanTypes: string[];
    commonModifications: string[];
    successPatterns: string[];
  } {
    if (!this.cachedContext) {
      return {
        preferredPlanTypes: [],
        commonModifications: [],
        successPatterns: []
      };
    }

    const patterns = this.cachedContext.patterns;
    
    const preferredPlanTypes = patterns
      .filter(p => p.key.startsWith('successful_plan_'))
      .map(p => p.key.replace('successful_plan_', ''));
    
    const commonModifications = patterns
      .filter(p => p.key.startsWith('plan_modification_'))
      .map(p => p.value);
    
    const successPatterns = patterns
      .filter(p => p.confidence > 0.7)
      .map(p => p.value);

    return {
      preferredPlanTypes,
      commonModifications,
      successPatterns
    };
  }

  private async getRecentActivity() {
    try {
      const lastLogin = localStorage.getItem('last_login');
      const bubblesCreated = localStorage.getItem('user_activity_bubble_created');
      const voiceCommands = localStorage.getItem('user_activity_voice_command');
      const glimmersReceived = localStorage.getItem('user_activity_glimmer_received');

      return {
        lastLogin: lastLogin ? parseInt(lastLogin, 10) : undefined,
        bubblesCreated: bubblesCreated ? parseInt(bubblesCreated, 10) : 0,
        voiceCommands: voiceCommands ? parseInt(voiceCommands, 10) : 0,
        glimmersReceived: glimmersReceived ? parseInt(glimmersReceived, 10) : 0
      };
    } catch (error) {
      console.error('Failed to get activity data:', error);
      return {};
    }
  }

  private getTimeOfDay(date: Date): string {
    const hour = date.getHours();
    
    if (hour < 6) return 'late night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  private async inferCurrentMood(): Promise<string> {
    // Simple mood inference based on recent activity
    // Could be enhanced with explicit mood tracking
    
    try {
      const context = await this.getUserContext();
      const recentActivity = context.recentActivity;
      
      if (recentActivity.bubblesCreated && recentActivity.bubblesCreated > 5) {
        return 'productive';
      }
      
      if (recentActivity.voiceCommands && recentActivity.voiceCommands > 3) {
        return 'engaged';
      }
      
      return 'neutral';
    } catch {
      return 'neutral';
    }
  }

  private isPatternRelevant(pattern: PatternHint, trigger: string, timeContext: any): boolean {
    // Check if pattern is relevant to current context
    const patternKey = pattern.key.toLowerCase();
    const triggerLower = trigger.toLowerCase();
    const timeOfDay = timeContext.timeOfDay.toLowerCase();
    
    // Time-based relevance
    if (patternKey.includes(timeOfDay)) return true;
    
    // Content-based relevance
    if (triggerLower.includes(patternKey) || patternKey.includes(triggerLower)) return true;
    
    // Day-based relevance
    if (patternKey.includes(timeContext.dayOfWeek.toLowerCase())) return true;
    
    return false;
  }

  private generateContextualTriggers(userContext: UserContext, timeContext: any): string[] {
    const triggers = [];
    
    // Time-based triggers
    triggers.push(`${timeContext.timeOfDay} on ${timeContext.dayOfWeek}`);
    
    // Goal-based triggers
    if (userContext.preferences.primaryGoals) {
      userContext.preferences.primaryGoals.forEach(goal => {
        triggers.push(`working on ${goal}`);
      });
    }
    
    // Pattern-based triggers
    userContext.patterns.forEach(pattern => {
      if (pattern.confidence > 0.7) {
        triggers.push(pattern.key);
      }
    });
    
    return triggers.slice(0, 5); // Limit to top 5
  }
}

export const userContextService = new UserContextService();