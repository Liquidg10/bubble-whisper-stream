/**
 * Progressive Onboarding Service
 * Manages 7-day milestone-based onboarding for detail-averse users
 */

export interface ProgressiveOnboardingState {
  isEnabled: boolean;
  currentDay: number;
  startDate: number;
  completedMilestones: number[];
  hasSkippedProgression: boolean;
  lastShownMilestone?: number;
}

export interface MilestoneConfig {
  day: number;
  title: string;
  description: string;
  features: string[];
  examples: string[];
  canSkip: boolean;
}

export const MILESTONES: MilestoneConfig[] = [
  {
    day: 1,
    title: "Welcome! Start with your voice",
    description: "Speak or type your first thought. Watch bubbles appear.",
    features: ["voice_capture", "text_input", "bubble_view"],
    examples: ["Try saying: 'Buy groceries'", "Or type: 'Meeting with Sarah'"],
    canSkip: false
  },
  {
    day: 3,
    title: "Connect your calendar for smart suggestions",
    description: "Add your calendar to get contextual suggestions.",
    features: ["calendar_read", "contextual_suggestions"],
    examples: ["'Lunch with mom' → suggests preparation time", "Meeting conflicts detected"],
    canSkip: true
  },
  {
    day: 5,
    title: "Try draft suggestions (you always confirm)",
    description: "Let us suggest email drafts and calendar events.",
    features: ["email_drafts", "calendar_drafts", "confirm_workflow"],
    examples: ["'Reply to John' → draft ready for review", "Calendar event suggested, not added"],
    canSkip: true
  },
  {
    day: 7,
    title: "All features unlocked!",
    description: "Auto-write toggles available in settings (off by default).",
    features: ["auto_write_toggles", "full_settings"],
    examples: ["Enable calendar auto-write", "Email auto-drafting controls"],
    canSkip: false
  }
];

class ProgressiveOnboardingService {
  private static readonly STORAGE_KEY = 'progressiveOnboarding';
  
  getDefaultState(): ProgressiveOnboardingState {
    return {
      isEnabled: true,
      currentDay: 1,
      startDate: Date.now(),
      completedMilestones: [],
      hasSkippedProgression: false,
      lastShownMilestone: undefined
    };
  }

  getCurrentDay(state: ProgressiveOnboardingState): number {
    if (!state.isEnabled || state.hasSkippedProgression) return 7; // All features available
    
    const daysSinceStart = Math.floor((Date.now() - state.startDate) / (24 * 60 * 60 * 1000)) + 1;
    return Math.min(daysSinceStart, 7);
  }

  canAdvanceToDay(state: ProgressiveOnboardingState, day: number): boolean {
    if (state.hasSkippedProgression) return true;
    if (!state.isEnabled) return true;
    
    const currentDay = this.getCurrentDay(state);
    return day <= currentDay;
  }

  isFeatureUnlocked(state: ProgressiveOnboardingState, feature: string): boolean {
    if (!state.isEnabled || state.hasSkippedProgression) return true;
    
    const currentDay = this.getCurrentDay(state);
    
    // Check which milestones unlock this feature
    for (const milestone of MILESTONES) {
      if (milestone.features.includes(feature) && milestone.day <= currentDay) {
        return true;
      }
    }
    
    return false;
  }

  getMilestoneForDay(day: number): MilestoneConfig | null {
    return MILESTONES.find(m => m.day === day) || null;
  }

  shouldShowMilestone(state: ProgressiveOnboardingState, day: number): boolean {
    if (!state.isEnabled || state.hasSkippedProgression) return false;
    if (state.completedMilestones.includes(day)) return false;
    if (state.lastShownMilestone === day) return false;
    
    return this.canAdvanceToDay(state, day);
  }

  markMilestoneShown(state: ProgressiveOnboardingState, day: number): ProgressiveOnboardingState {
    return {
      ...state,
      lastShownMilestone: day
    };
  }

  completeMilestone(state: ProgressiveOnboardingState, day: number): ProgressiveOnboardingState {
    if (state.completedMilestones.includes(day)) return state;
    
    return {
      ...state,
      completedMilestones: [...state.completedMilestones, day],
      lastShownMilestone: undefined
    };
  }

  skipProgression(state: ProgressiveOnboardingState): ProgressiveOnboardingState {
    return {
      ...state,
      hasSkippedProgression: true,
      completedMilestones: MILESTONES.map(m => m.day)
    };
  }

  rewindToDay(state: ProgressiveOnboardingState, day: number): ProgressiveOnboardingState {
    return {
      ...state,
      completedMilestones: state.completedMilestones.filter(d => d < day),
      lastShownMilestone: undefined,
      hasSkippedProgression: false
    };
  }

  getProgressPercentage(state: ProgressiveOnboardingState): number {
    if (state.hasSkippedProgression) return 100;
    if (!state.isEnabled) return 100;
    
    const currentDay = this.getCurrentDay(state);
    return Math.min((currentDay / 7) * 100, 100);
  }
}

export const progressiveOnboardingService = new ProgressiveOnboardingService();