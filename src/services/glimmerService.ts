// Self-Compassion Glimmer Service
// Provides gentle, contextual encouragement with tone personalization

import { Glimmer, GlimmerTone, Bubble, PatternHint } from '@/types/bubble';
import { storageService } from './storage';

// Message templates for each tone
const TONE_TEMPLATES: Record<GlimmerTone, {
  greeting: string[];
  encouragement: string[];
  rest: string[];
  progress: string[];
  overwhelmed: string[];
}> = {
  supportive: {
    greeting: [
      "Hey, just checking in from a year from now...",
      "Future you here with a gentle reminder...",
      "Your future self wants you to know..."
    ],
    encouragement: [
      "The small steps you're taking today really do add up",
      "I'm proud of how you're handling things, even when it's hard",
      "You're building skills that will serve you well"
    ],
    rest: [
      "It's okay to rest - you're not falling behind",
      "Taking breaks is part of the process, not avoiding it",
      "Your worth isn't measured by your productivity"
    ],
    progress: [
      "You've come further than you realize",
      "Look how you handled that challenge - you're growing",
      "The progress isn't always visible, but it's happening"
    ],
    overwhelmed: [
      "This feeling is temporary, even though it doesn't feel like it",
      "You've gotten through difficult times before",
      "One breath, one step - that's all you need right now"
    ]
  },
  motivational: {
    greeting: [
      "Hey friend, thinking of you...",
      "Just wanted to remind you...",
      "Your friend here with a quick note..."
    ],
    encouragement: [
      "You're doing amazing, even if it doesn't feel like it",
      "I believe in you and your ability to figure this out",
      "You don't have to be perfect - you just have to be you"
    ],
    rest: [
      "Take all the time you need - I'll be here",
      "Rest isn't giving up, it's recharging",
      "Even the strongest people need breaks"
    ],
    progress: [
      "I see how hard you're trying, and it matters",
      "Every small step is worth celebrating",
      "You're braver than you know"
    ],
    overwhelmed: [
      "It's okay to feel overwhelmed - that's human",
      "You don't have to carry everything alone",
      "One thing at a time, friend"
    ]
  },
  analytical: {
    greeting: [
      "Quick coaching moment...",
      "Strategy check-in...",
      "Performance insight coming your way..."
    ],
    encouragement: [
      "Your effort is consistent and that's what creates results",
      "Focus on progress, not perfection",
      "You're building mental strength with each challenge"
    ],
    rest: [
      "Recovery is part of high performance",
      "Strategic rest prevents burnout",
      "Champions know when to recharge"
    ],
    progress: [
      "Track your wins, no matter how small",
      "Consistency beats intensity over time",
      "You're developing resilience skills"
    ],
    overwhelmed: [
      "Break it down into smaller, manageable pieces",
      "Focus on what you can control right now",
      "This is training for future challenges"
    ]
  },
  inspiring: {
    greeting: [
      "Observation from your personal data...",
      "Pattern analysis suggests...",
      "Based on your recent activity..."
    ],
    encouragement: [
      "Data shows consistent effort correlates with positive outcomes",
      "Your adaptive responses are improving over time",
      "Behavioral patterns indicate forward momentum"
    ],
    rest: [
      "Research supports the cognitive benefits of rest",
      "Neuroplasticity requires recovery periods",
      "Optimal performance includes scheduled downtime"
    ],
    progress: [
      "Metrics indicate measurable improvement",
      "Your response patterns show increased resilience",
      "Data confirms you're building new neural pathways"
    ],
    overwhelmed: [
      "Stress response is temporary and manageable",
      "Breaking complex problems into components reduces cognitive load",
      "Your nervous system is designed to handle this"
    ]
  }
};

// Trigger conditions for glimmers
interface GlimmerTrigger {
  key: string;
  condition: (patterns: PatternHint[], bubbles: Bubble[]) => boolean;
  messageType: keyof typeof TONE_TEMPLATES[GlimmerTone];
  priority: number;
}

const GLIMMER_TRIGGERS: GlimmerTrigger[] = [
  {
    key: 'overwhelmed_pattern',
    condition: (patterns) => {
      const overwhelmedPattern = patterns.find(p => p.key === 'overwhelmed_snoozes');
      return overwhelmedPattern ? overwhelmedPattern.confidence > 0.7 : false;
    },
    messageType: 'overwhelmed',
    priority: 1
  },
  {
    key: 'consistent_bubbles',
    condition: (patterns, bubbles) => {
      const recentBubbles = bubbles.filter(b => 
        Date.now() - b.createdAt < 7 * 24 * 60 * 60 * 1000 // Last 7 days
      );
      return recentBubbles.length >= 3;
    },
    messageType: 'progress',
    priority: 2
  },
  {
    key: 'need_rest',
    condition: (patterns) => {
      const busyPattern = patterns.find(p => p.key === 'busy_snoozes');
      return busyPattern ? busyPattern.confidence > 0.6 : false;
    },
    messageType: 'rest',
    priority: 2
  },
  {
    key: 'general_encouragement',
    condition: () => Math.random() < 0.3, // 30% chance for general encouragement
    messageType: 'encouragement',
    priority: 3
  }
];

class GlimmerService {
  private db: IDBDatabase | null = null;
  private frequencyCap = 3; // Max glimmers per day
  private quietHours = { start: '22:00', end: '07:00' };

  async initialize() {
    if (!this.db) {
      await storageService.initialize();
      this.db = (storageService as any).db;
    }
  }

  async createGlimmer(glimmer: Omit<Glimmer, 'id' | 'createdAt'>): Promise<Glimmer> {
    await this.initialize();
    
    const newGlimmer: Glimmer = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      ...glimmer
    };

    const transaction = this.db!.transaction(['glimmers'], 'readwrite');
    const store = transaction.objectStore('glimmers');
    await this.promisifyRequest(store.add(newGlimmer));

    return newGlimmer;
  }

  async getAllGlimmers(): Promise<Glimmer[]> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['glimmers'], 'readonly');
    const store = transaction.objectStore('glimmers');
    const result = await this.promisifyRequest(store.getAll());
    
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateGlimmer(glimmer: Glimmer): Promise<void> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['glimmers'], 'readwrite');
    const store = transaction.objectStore('glimmers');
    await this.promisifyRequest(store.put(glimmer));
  }

  async dismissGlimmer(id: string): Promise<void> {
    const glimmers = await this.getAllGlimmers();
    const glimmer = glimmers.find(g => g.id === id);
    if (glimmer) {
      glimmer.dismissed = true;
      await this.updateGlimmer(glimmer);
    }
  }

  // Check if we should trigger a glimmer
  async shouldTriggerGlimmer(): Promise<boolean> {
    // Check frequency cap
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const glimmers = await this.getAllGlimmers();
    const todayGlimmers = glimmers.filter(g => 
      g.createdAt >= todayStart.getTime() && !g.dismissed
    );
    
    if (todayGlimmers.length >= this.frequencyCap) {
      return false;
    }

    // Check quiet hours
    if (this.isQuietHours()) {
      return false;
    }

    return true;
  }

  // Generate a contextual glimmer with AI enhancement
  async generateGlimmer(
    tone: GlimmerTone = 'supportive',
    patterns: PatternHint[] = [],
    bubbles: Bubble[] = []
  ): Promise<Glimmer | null> {
    if (!(await this.shouldTriggerGlimmer())) {
      return null;
    }

    // Find the best trigger
    const validTriggers = GLIMMER_TRIGGERS
      .filter(trigger => trigger.condition(patterns, bubbles))
      .sort((a, b) => a.priority - b.priority);

    if (validTriggers.length === 0) {
      return null;
    }

    const trigger = validTriggers[0];

    // Try AI generation first
    try {
      const { aiService } = await import('./aiService');
      if (aiService.isAIAvailable()) {
        const timeContext = {
          timeOfDay: new Date().getHours() < 12 ? 'morning' : 
                    new Date().getHours() < 17 ? 'afternoon' : 'evening',
          mood: bubbles.slice(-3).map(b => b.mood).filter(Boolean)[0] || 'neutral'
        };

        const response = await aiService.generateGlimmer(
          trigger.key,
          tone.toLowerCase().replace(' ', '-') as any,
          patterns,
          timeContext
        );

        if (response.success && response.glimmer) {
        const aiGlimmer = await this.createGlimmer({
          tone,
          message: response.glimmer.message,
          cause: trigger.key,
          deliveredVia: 'text'
        });
        // Add source after creation
        (aiGlimmer as any).source = 'ai';
        return aiGlimmer;
        }
      }
    } catch (error) {
      console.warn('AI glimmer generation failed, using local templates:', error);
    }

    // Local fallback
    const templates = TONE_TEMPLATES[tone];
    const messageCategory = templates[trigger.messageType];
    
    // Select random message from category
    const message = messageCategory[Math.floor(Math.random() * messageCategory.length)];
    const greeting = templates.greeting[Math.floor(Math.random() * templates.greeting.length)];

    const localGlimmer = await this.createGlimmer({
      tone,
      message: `${greeting} ${message}`,
      cause: trigger.key,
      deliveredVia: 'text'
    });
    // Add source after creation
    (localGlimmer as any).source = 'local';
    return localGlimmer;
  }

  // Update user preferences
  updateFrequencyCap(cap: number) {
    this.frequencyCap = Math.max(0, Math.min(10, cap)); // Limit between 0-10
  }

  updateQuietHours(start: string, end: string) {
    this.quietHours = { start, end };
  }

  private isQuietHours(): boolean {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const { start, end } = this.quietHours;
    
    // Handle overnight quiet hours (e.g., 22:00 to 07:00)
    if (start > end) {
      return currentTime >= start || currentTime <= end;
    }
    
    // Handle same-day quiet hours (e.g., 13:00 to 15:00)
    return currentTime >= start && currentTime <= end;
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const glimmerService = new GlimmerService();