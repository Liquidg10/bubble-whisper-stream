// Explainability Service - Provides human-readable explanations for AI decisions
// Ensures transparency and user understanding of adaptive behaviors

import { ReminderExplanation, PatternHint, Snooze } from '@/types/bubble';

interface ExplanationContext {
  snoozes?: Snooze[];
  patterns?: PatternHint[];
  timeOfDay?: string;
  quietHours?: { start: string; end: string };
  bubbleActivity?: number;
  userPreferences?: Record<string, any>;
}

class ExplainabilityService {
  
  // Generate explanation for reminder timing adjustments
  generateReminderExplanation(
    action: 'defer' | 'escalate' | 'slow' | 'skip',
    context: ExplanationContext
  ): ReminderExplanation {
    const factors: string[] = [];
    let reason = '';
    let confidence = 0.8;

    switch (action) {
      case 'defer':
        if (context.snoozes) {
          const recentOverwhelmed = context.snoozes.filter(s => 
            s.reason === 'Overwhelmed' && 
            Date.now() - s.at < 24 * 60 * 60 * 1000 // Last 24 hours
          );
          
          if (recentOverwhelmed.length >= 2) {
            reason = "We're giving you more space today";
            factors.push("You've felt overwhelmed recently");
            factors.push("Taking pressure off can help");
          }
        }

        if (context.quietHours && this.isQuietHours(context.quietHours)) {
          reason = "It's your quiet time";
          factors.push("Respecting your quiet hours");
          factors.push("We'll try again later");
        }
        break;

      case 'slow':
        if (context.snoozes) {
          const busySnoozes = context.snoozes.filter(s => s.reason === 'Busy');
          if (busySnoozes.length >= 2) {
            reason = "You seem to have a lot going on";
            factors.push("Multiple 'busy' responses");
            factors.push("Adjusting pace to match your rhythm");
          }
        }
        break;

      case 'escalate':
        if (context.patterns) {
          const highImportance = context.patterns.find(p => 
            p.key === 'high_importance_bubble' && p.confidence > 0.7
          );
          if (highImportance) {
            reason = "This seems important to you";
            factors.push("Based on your bubble patterns");
            factors.push("Gentle persistence for meaningful goals");
          }
        }
        break;

      case 'skip':
        if (context.quietHours && this.isQuietHours(context.quietHours)) {
          reason = "Respecting your quiet hours";
          factors.push("No notifications during rest time");
          confidence = 1.0;
        }
        break;

      default:
        reason = "Following your preferences";
        factors.push("Standard reminder schedule");
    }

    return {
      reason,
      factors,
      confidence
    };
  }

  // Generate explanation for glimmer triggers
  generateGlimmerExplanation(trigger: string, context: ExplanationContext): string {
    switch (trigger) {
      case 'overwhelmed_pattern':
        return "Because you've mentioned feeling overwhelmed, here's a gentle reminder";
      
      case 'consistent_bubbles':
        return "Because you've been thoughtfully creating bubbles this week";
      
      case 'need_rest':
        return "Because you've been busy, here's a reminder about self-care";
      
      case 'general_encouragement':
        return "Because everyone deserves encouragement";
      
      default:
        return "Because you matter";
    }
  }

  // Generate explanation for CBT suggestion
  generateCBTExplanation(
    suggestedDistortions: string[],
    thoughtContent: string
  ): string {
    if (suggestedDistortions.length === 0) {
      return "These are common thinking patterns many people experience";
    }

    if (suggestedDistortions.length === 1) {
      return `This suggestion is based on some words in your thought that often relate to ${suggestedDistortions[0]} thinking`;
    }

    return `These suggestions are based on patterns in your thought that might relate to these thinking styles`;
  }

  // Generate explanation for self-model updates
  generateSelfModelExplanation(
    change: string,
    layer: 'surface' | 'context' | 'deep'
  ): string {
    const layerDescriptions = {
      surface: "basic preferences and settings",
      context: "patterns from your recent activities", 
      deep: "insights from longer-term patterns"
    };

    return `We noticed a change in your ${layerDescriptions[layer]}: ${change}. Would you like to update your profile?`;
  }

  // Format explanation for UI display
  formatExplanationForUI(explanation: ReminderExplanation): {
    shortText: string;
    expandedText: string;
    icon: string;
  } {
    const icons = {
      defer: "⏸️",
      slow: "🐌", 
      escalate: "📢",
      skip: "🔇"
    };

    return {
      shortText: `Because: ${explanation.reason}`,
      expandedText: `${explanation.reason}\n\n${explanation.factors.join('\n• ')}`,
      icon: "💡" // Default icon
    };
  }

  // Check data sources used in decision
  getDataSources(context: ExplanationContext): string[] {
    const sources: string[] = [];
    
    if (context.snoozes && context.snoozes.length > 0) {
      sources.push("Your snooze history");
    }
    
    if (context.patterns && context.patterns.length > 0) {
      sources.push("Your activity patterns");
    }
    
    if (context.timeOfDay) {
      sources.push("Time of day");
    }
    
    if (context.quietHours) {
      sources.push("Your quiet hours setting");
    }
    
    if (context.bubbleActivity) {
      sources.push("Your recent bubble activity");
    }

    return sources;
  }

  private isQuietHours(quietHours: { start: string; end: string }): boolean {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const { start, end } = quietHours;
    
    // Handle overnight quiet hours (e.g., 22:00 to 07:00)
    if (start > end) {
      return currentTime >= start || currentTime <= end;
    }
    
    // Handle same-day quiet hours (e.g., 13:00 to 15:00)
    return currentTime >= start && currentTime <= end;
  }
}

export const explainabilityService = new ExplainabilityService();