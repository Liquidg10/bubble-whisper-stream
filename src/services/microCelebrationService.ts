import type { GlimmerTone } from '@/types/glimmer';
import type { MomentumBurst } from './momentumBurstService';

// Brief celebrations by tone (<90 chars)
const MICRO_CELEBRATIONS = {
  Friend: {
    task_completion: [
      "Yes! Look at you crushing it! 💪",
      "That momentum is beautiful! ✨", 
      "You're on fire today! 🔥",
      "Love seeing you in flow! 🚀"
    ],
    focus_session: [
      "That focus session was amazing! 🌟",
      "Deep work mode: activated! 🧠",
      "You just did the thing! 💫",
      "Focus like that changes everything! ⚡"
    ],
    joy_clustering: [
      "Joy is radiating from you today! ☀️",
      "This energy is contagious! ✨",
      "You're glowing! 🌟",
      "Love this vibe! 💫"
    ],
    productivity_milestone: [
      "Milestone unlocked! 🏆",
      "You're building something beautiful! 🌱",
      "Progress in action! 📈",
      "This is how it's done! 💪"
    ]
  },
  Coach: {
    task_completion: [
      "Peak performance zone activated! 💯",
      "That's championship mindset! 🏆",
      "Execution excellence right there! 🎯",
      "Building unstoppable momentum! ⚡"
    ],
    focus_session: [
      "Elite focus demonstrated! 🧠",
      "That's how champions train! 💪",
      "Deep work mastery! 🎯",
      "Performance optimization complete! 📊"
    ],
    joy_clustering: [
      "Winning mindset in full effect! 🏆",
      "Energy management: excellent! ⚡",
      "That's the champion spirit! 💪",
      "Peak state achieved! 🚀"
    ],
    productivity_milestone: [
      "Milestone conquered! 🏆",
      "That's systematic excellence! 📊",
      "Strategic execution perfect! 🎯",
      "Performance benchmark: achieved! 💯"
    ]
  },
  Scientist: {
    task_completion: [
      "Productivity spike detected! 📈",
      "Efficiency metrics: optimal! 📊",
      "Task completion rate: excellent! ⚡",
      "Workflow optimization successful! 🧠"
    ],
    focus_session: [
      "Flow state optimization complete! 🧠",
      "Attention span maximized! 📊",
      "Cognitive load balanced perfectly! ⚡",
      "Neural pathway strengthening! 🔬"
    ],
    joy_clustering: [
      "Positive feedback loop activated! 📈",
      "Dopamine regulation: optimal! 🧠",
      "Emotional state: highly positive! 📊",
      "Joy coefficient increasing! ✨"
    ],
    productivity_milestone: [
      "Progress metrics exceeded! 📈",
      "System efficiency: maximized! 🔬",
      "Output quality: superior! 📊",
      "Performance data: impressive! 💯"
    ]
  },
  'Future You': {
    task_completion: [
      "Future you is so proud right now! 💫",
      "This moment matters more than you know! ✨",
      "You're becoming who you want to be! 💪",
      "These actions echo into the future! 🌟"
    ],
    focus_session: [
      "This deep work shapes your destiny! 💫",
      "Future you thanks you for this focus! 🙏",
      "Building the habits that change everything! 🌱",
      "This discipline creates your future! ⚡"
    ],
    joy_clustering: [
      "This joy ripples through time! 💫",
      "Future you remembers this feeling! ✨",
      "You're creating beautiful memories! 🌟",
      "This happiness compounds! 🌱"
    ],
    productivity_milestone: [
      "Every step builds your future! 💫",
      "This progress echoes forward! ⚡",
      "Future you sees this milestone! 🌟",
      "You're writing your success story! ✨"
    ]
  }
} as const;

export interface CelebrationSettings {
  enabled: boolean;
  dailyLimit: number; // 0-3
  mutedTones: GlimmerTone[];
  quietHoursRespected: boolean;
  minimumMomentumThreshold: number; // 0.5-1.0
}

class MicroCelebrationService {
  private dailyCounts = new Map<string, number>();
  private lastCelebration = new Map<string, number>();
  private settings: CelebrationSettings = {
    enabled: true,
    dailyLimit: 2,
    mutedTones: [],
    quietHoursRespected: true,
    minimumMomentumThreshold: 0.6
  };

  private getStorageKey(key: string): string {
    return `microCelebration_${key}`;
  }

  private loadSettings(): CelebrationSettings {
    try {
      const stored = localStorage.getItem(this.getStorageKey('settings'));
      if (stored) {
        return { ...this.settings, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to load celebration settings:', error);
    }
    return this.settings;
  }

  private saveSettings(settings: CelebrationSettings): void {
    try {
      localStorage.setItem(this.getStorageKey('settings'), JSON.stringify(settings));
      this.settings = settings;
    } catch (error) {
      console.warn('Failed to save celebration settings:', error);
    }
  }

  private loadDailyCounts(): void {
    try {
      const today = new Date().toDateString();
      const stored = localStorage.getItem(this.getStorageKey('dailyCounts'));
      if (stored) {
        const data = JSON.parse(stored);
        if (data.date === today) {
          this.dailyCounts = new Map(Object.entries(data.counts));
        } else {
          // New day, reset counts
          this.dailyCounts.clear();
        }
      }
    } catch (error) {
      console.warn('Failed to load daily counts:', error);
    }
  }

  private saveDailyCounts(): void {
    try {
      const today = new Date().toDateString();
      const data = {
        date: today,
        counts: Object.fromEntries(this.dailyCounts)
      };
      localStorage.setItem(this.getStorageKey('dailyCounts'), JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save daily counts:', error);
    }
  }

  canShowCelebration(tone: GlimmerTone): boolean {
    this.loadSettings();
    
    // Feature disabled
    if (!this.settings.enabled) return false;
    
    // User muted this tone
    if (this.settings.mutedTones.includes(tone)) return false;
    
    // Load daily counts
    this.loadDailyCounts();
    
    // Daily limit check
    const today = new Date().toDateString();
    const dailyCount = this.dailyCounts.get(today) || 0;
    if (dailyCount >= this.settings.dailyLimit) return false;
    
    // Cooldown period check (2 hours between celebrations of same tone)
    const lastTime = this.lastCelebration.get(tone) || 0;
    const timeSince = Date.now() - lastTime;
    if (timeSince < 2 * 60 * 60 * 1000) return false;
    
    // Quiet hours check (if enabled in settings)
    if (this.settings.quietHoursRespected && this.isQuietHours()) return false;
    
    return true;
  }

  private isQuietHours(): boolean {
    // Simple quiet hours: 11 PM to 7 AM
    const hour = new Date().getHours();
    return hour >= 23 || hour < 7;
  }

  selectCelebrationMessage(burst: MomentumBurst, tone: GlimmerTone): string {
    const normalizedTone = tone === 'inspiring' ? 'Future You' : tone;
    const messages = MICRO_CELEBRATIONS[normalizedTone]?.[burst.type];
    
    if (!messages || messages.length === 0) {
      return "Great work! ✨"; // Fallback
    }
    
    // Select based on confidence score for variety
    const index = Math.floor(burst.confidence * messages.length);
    return messages[Math.min(index, messages.length - 1)];
  }

  recordCelebrationShown(tone: GlimmerTone, burstType: string): void {
    const now = Date.now();
    const today = new Date().toDateString();
    
    // Update last celebration time
    this.lastCelebration.set(tone, now);
    
    // Update daily count
    this.loadDailyCounts();
    const currentCount = this.dailyCounts.get(today) || 0;
    this.dailyCounts.set(today, currentCount + 1);
    this.saveDailyCounts();
    
    // Analytics (optional)
    console.log(`Micro-celebration shown: ${tone} for ${burstType} at ${new Date(now).toISOString()}`);
  }

  getSettings(): CelebrationSettings {
    return this.loadSettings();
  }

  updateSettings(newSettings: Partial<CelebrationSettings>): void {
    const current = this.loadSettings();
    const updated = { ...current, ...newSettings };
    this.saveSettings(updated);
  }

  muteTone(tone: GlimmerTone): void {
    const settings = this.loadSettings();
    if (!settings.mutedTones.includes(tone)) {
      settings.mutedTones.push(tone);
      this.saveSettings(settings);
    }
  }

  unmuteTone(tone: GlimmerTone): void {
    const settings = this.loadSettings();
    settings.mutedTones = settings.mutedTones.filter(t => t !== tone);
    this.saveSettings(settings);
  }

  getDailyStats(): { shown: number; limit: number; remaining: number } {
    this.loadDailyCounts();
    const today = new Date().toDateString();
    const shown = this.dailyCounts.get(today) || 0;
    const limit = this.settings.dailyLimit;
    
    return {
      shown,
      limit,
      remaining: Math.max(0, limit - shown)
    };
  }
}

export const microCelebrationService = new MicroCelebrationService();