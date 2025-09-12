import { ContextInput, contextEngineService } from './contextEngineService';
import { thresholdLadderService, PolicyContext, ThresholdResult } from './thresholdLadderService';
import { contextPatternService } from './contextPatternService';

export interface PolicyDecisionInput extends ContextInput {
  feature?: string;
  location?: string;
  recipient?: {
    email?: string;
    domain?: string;
    isFirstTime?: boolean;
  };
  userPreferences?: {
    autoWriteEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
}

export interface PolicyDecision extends ThresholdResult {
  contextScore: any;
  timestamp: Date;
}

class PolicyDecisionEngine {
  /**
   * Make a comprehensive policy decision combining context scoring and threshold ladder
   */
  async makeDecision(input: PolicyDecisionInput): Promise<PolicyDecision> {
    // Step 1: Generate context score
    const contextScore = await contextEngineService.generateScore(input);
    
    // Step 2: Build policy context
    const policyContext = await this.buildPolicyContext(input);
    
    // Step 3: Apply threshold ladder with overrides
    const thresholdResult = thresholdLadderService.applyThresholds(contextScore, policyContext);
    
    // Step 4: Return comprehensive decision
    return {
      ...thresholdResult,
      contextScore,
      timestamp: new Date()
    };
  }

  /**
   * Build policy context from input and current state
   */
  private async buildPolicyContext(input: PolicyDecisionInput): Promise<PolicyContext> {
    const now = new Date();
    
    // Check meeting status
    const isInMeeting = await this.checkMeetingStatus(now);
    const meetingDensity = await this.calculateMeetingDensity(now);
    
    // Check quiet hours
    const isQuietHours = this.checkQuietHours(now, input.userPreferences);
    
    // Check location productivity
    const locationProductivity = await this.getLocationProductivity();
    
    // Check recipient status
    const isFirstTimeRecipient = input.recipient?.isFirstTime || false;
    
    // Get user preferences
    const userAutoWriteEnabled = input.userPreferences?.autoWriteEnabled ?? true;
    
    return {
      isInMeeting,
      meetingDensity,
      isFirstTimeRecipient,
      isQuietHours,
      locationProductivity,
      userAutoWriteEnabled,
      recipientDomain: input.recipient?.domain,
      feature: input.feature
    };
  }

  /**
   * Check if user is currently in a meeting
   */
  private async checkMeetingStatus(time: Date): Promise<boolean> {
    try {
      // Check calendar events around current time
      const timeWindow = 15 * 60 * 1000; // 15 minutes
      const start = new Date(time.getTime() - timeWindow);
      const end = new Date(time.getTime() + timeWindow);
      
      // This would integrate with calendar service when available
      // For now, use a simple heuristic based on time patterns
      const hour = time.getHours();
      const dayOfWeek = time.getDay();
      
      // Business hours on weekdays are more likely to have meetings
      return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour <= 17;
    } catch (error) {
      console.warn('Could not check meeting status:', error);
      return false;
    }
  }

  /**
   * Calculate meeting density for the current time period
   */
  private async calculateMeetingDensity(time: Date): Promise<number> {
    try {
      const hour = time.getHours();
      const dayOfWeek = time.getDay();
      
      // Simple heuristic - peak meeting times have higher density
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        if (hour >= 10 && hour <= 11) return 0.8; // Morning meetings
        if (hour >= 14 && hour <= 15) return 0.7; // Afternoon meetings
        if (hour >= 9 && hour <= 17) return 0.4;  // General business hours
      }
      
      return 0.1; // Low density outside business hours
    } catch (error) {
      console.warn('Could not calculate meeting density:', error);
      return 0.3; // Default moderate density
    }
  }

  /**
   * Check if current time is within user's quiet hours
   */
  private checkQuietHours(
    time: Date,
    userPreferences?: PolicyDecisionInput['userPreferences']
  ): boolean {
    if (!userPreferences?.quietHoursStart || !userPreferences?.quietHoursEnd) {
      // Default quiet hours: 10 PM to 8 AM
      const hour = time.getHours();
      return hour >= 22 || hour <= 8;
    }

    try {
      const startHour = parseInt(userPreferences.quietHoursStart.split(':')[0]);
      const endHour = parseInt(userPreferences.quietHoursEnd.split(':')[0]);
      const currentHour = time.getHours();

      if (startHour <= endHour) {
        // Same day quiet hours (e.g., 1 PM to 3 PM)
        return currentHour >= startHour && currentHour <= endHour;
      } else {
        // Overnight quiet hours (e.g., 10 PM to 8 AM)
        return currentHour >= startHour || currentHour <= endHour;
      }
    } catch (error) {
      console.warn('Invalid quiet hours format:', error);
      return false;
    }
  }

  /**
   * Get location-based productivity score
   */
  private async getLocationProductivity(): Promise<number> {
    try {
      // For now, return a default productivity score
      // This would integrate with contextPatternService when available
      return 0.7; // Default neutral productivity
    } catch (error) {
      console.warn('Could not get location productivity:', error);
      return 0.7; // Default neutral productivity
    }
  }

  /**
   * Get decision explanation for UI display
   */
  getDecisionExplanation(decision: PolicyDecision): string {
    const parts = [decision.reason];
    
    if (decision.appliedOverrides.length > 0) {
      const overrideList = decision.appliedOverrides.join(', ');
      parts.push(`Adjusted for: ${overrideList}`);
    }
    
    return parts.join(' • ');
  }

  /**
   * Get decision badge variant for UI styling
   */
  getDecisionBadgeVariant(decision: ThresholdResult['decision']): string {
    switch (decision) {
      case 'auto-write':
        return 'default';
      case 'draft':
        return 'secondary';
      case 'suggest':
        return 'outline';
      default:
        return 'outline';
    }
  }

  /**
   * Get decision icon for UI display
   */
  getDecisionIcon(decision: ThresholdResult['decision']): string {
    switch (decision) {
      case 'auto-write':
        return '⚡';
      case 'draft':
        return '✋';
      case 'suggest':
        return '💡';
      default:
        return '❓';
    }
  }
}

export const policyDecisionEngine = new PolicyDecisionEngine();