import type { Bubble } from '@/types/bubble';

export interface MomentumBurst {
  id: string;
  type: 'task_completion' | 'focus_session' | 'productivity_milestone' | 'joy_clustering';
  confidence: number;
  context: {
    tasksCompleted?: number;
    focusDuration?: number;
    joyMomentsCount?: number;
    timeframe: number; // minutes
  };
  celebrationEligible: boolean;
  createdAt: number;
}

class MomentumBurstService {
  private lastBurstCheck = 0;
  private detectedBursts = new Map<string, number>();

  detectTaskCompletionBurst(recentBubbles: Bubble[]): MomentumBurst | null {
    const now = Date.now();
    const last30Min = now - (30 * 60 * 1000);
    
    const recentCompletions = recentBubbles.filter(b => 
      b.createdAt > last30Min && 
      (b.completed || b.tags.some(t => t.name.toLowerCase().includes('completed')))
    );

    if (recentCompletions.length >= 3) {
      const id = `task_completion_${now}`;
      const confidence = Math.min(recentCompletions.length / 5, 1);
      
      return {
        id,
        type: 'task_completion',
        confidence,
        context: { 
          tasksCompleted: recentCompletions.length, 
          timeframe: 30 
        },
        celebrationEligible: confidence > 0.6,
        createdAt: now
      };
    }
    return null;
  }

  detectFocusSession(recentBubbles: Bubble[]): MomentumBurst | null {
    const now = Date.now();
    const last2Hours = now - (2 * 60 * 60 * 1000);
    
    // Look for focused work patterns (multiple bubbles with time gaps suggesting sustained work)
    const recentWork = recentBubbles.filter(b => 
      b.createdAt > last2Hours && 
      b.tags.some(t => ['focus', 'work', 'project', 'deep'].some(keyword => 
        t.name.toLowerCase().includes(keyword)
      ))
    );

    if (recentWork.length >= 2) {
      // Check if bubbles span at least 45 minutes (suggesting sustained focus)
      const timeSpan = Math.max(...recentWork.map(b => b.createdAt)) - 
                     Math.min(...recentWork.map(b => b.createdAt));
      const focusDuration = timeSpan / (60 * 1000); // minutes

      if (focusDuration >= 45) {
        const id = `focus_session_${now}`;
        const confidence = Math.min(focusDuration / 120, 1); // 2 hours = max confidence
        
        return {
          id,
          type: 'focus_session',
          confidence,
          context: { 
            focusDuration: Math.round(focusDuration), 
            timeframe: Math.round(focusDuration) 
          },
          celebrationEligible: confidence > 0.5,
          createdAt: now
        };
      }
    }
    return null;
  }

  detectJoyCluster(recentBubbles: Bubble[]): MomentumBurst | null {
    const now = Date.now();
    const last2Hours = now - (2 * 60 * 60 * 1000);
    
    const joyMoments = recentBubbles.filter(b => 
      b.createdAt > last2Hours && 
      (b.mood === 'happy' || 
       b.tags.some(t => ['joy', 'happy', 'success', 'win', 'achievement'].some(keyword =>
         t.name.toLowerCase().includes(keyword)
       )))
    );

    if (joyMoments.length >= 2) {
      const id = `joy_clustering_${now}`;
      const confidence = Math.min(joyMoments.length / 4, 1);
      
      return {
        id,
        type: 'joy_clustering',
        confidence,
        context: { 
          joyMomentsCount: joyMoments.length, 
          timeframe: 120 
        },
        celebrationEligible: confidence > 0.5,
        createdAt: now
      };
    }
    return null;
  }

  async checkForMomentumBurst(recentBubbles: Bubble[]): Promise<MomentumBurst | null> {
    const now = Date.now();
    
    // Rate limit checks to every 10 minutes
    if (now - this.lastBurstCheck < 10 * 60 * 1000) {
      return null;
    }
    
    this.lastBurstCheck = now;

    // Try different burst detection methods
    const detectors = [
      () => this.detectTaskCompletionBurst(recentBubbles),
      () => this.detectFocusSession(recentBubbles),
      () => this.detectJoyCluster(recentBubbles)
    ];

    for (const detector of detectors) {
      const burst = detector();
      if (burst && burst.celebrationEligible) {
        // Check if we've already detected this type recently (prevent duplicates)
        const lastDetected = this.detectedBursts.get(burst.type) || 0;
        if (now - lastDetected > 60 * 60 * 1000) { // 1 hour cooldown per type
          this.detectedBursts.set(burst.type, now);
          return burst;
        }
      }
    }

    return null;
  }

  getRecentBursts(): MomentumBurst[] {
    // This would typically load from storage, simplified for now
    return [];
  }
}

export const momentumBurstService = new MomentumBurstService();