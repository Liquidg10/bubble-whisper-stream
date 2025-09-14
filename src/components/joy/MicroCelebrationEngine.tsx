/**
 * Micro-Celebration Engine - Joy & Compassion Integration
 * Detects completion patterns and triggers gentle celebrations
 */

import React, { useEffect, useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { CelebrationToast } from '@/components/CelebrationToast';
import { polishCopy, getEncouragement } from '@/utils/copyPolish';
import { useToast } from '@/hooks/use-toast';
import type { GlimmerTone } from '@/types/glimmer';

interface CelebrationPattern {
  id: string;
  trigger: 'streak' | 'milestone' | 'difficult_complete' | 'comeback' | 'focus_session';
  threshold: number;
  message: string;
  tone: GlimmerTone;
  cooldown: number; // minutes
}

interface CelebrationSettings {
  enabled: boolean;
  tones: Record<GlimmerTone, boolean>;
  frequency: 'minimal' | 'balanced' | 'enthusiastic';
  quietHours: { start: string; end: string } | null;
  maxPerDay: number;
}

const CELEBRATION_PATTERNS: CelebrationPattern[] = [
  {
    id: 'completion_streak',
    trigger: 'streak',
    threshold: 3,
    message: "Three in a row - you're finding your rhythm! ✨",
    tone: 'supportive',
    cooldown: 60
  },
  {
    id: 'first_today',
    trigger: 'milestone',
    threshold: 1,
    message: "First task of the day done - you're off to a great start",
    tone: 'motivational',
    cooldown: 480 // Once per day
  },
  {
    id: 'difficult_conquered',
    trigger: 'difficult_complete',
    threshold: 1,
    message: "That was a tough one, and you handled it beautifully",
    tone: 'inspiring',
    cooldown: 30
  },
  {
    id: 'comeback_momentum',
    trigger: 'comeback',
    threshold: 1,
    message: "Welcome back - picking up where you left off shows real strength",
    tone: 'supportive',
    cooldown: 180
  },
  {
    id: 'focus_flow',
    trigger: 'focus_session',
    threshold: 5,
    message: "Five tasks in focused flow - you're in the zone",
    tone: 'analytical',
    cooldown: 90
  }
];

const DEFAULT_SETTINGS: CelebrationSettings = {
  enabled: true,
  tones: {
    'supportive': true,
    'motivational': true,
    'analytical': true,
    'inspiring': true
  },
  frequency: 'balanced',
  quietHours: null,
  maxPerDay: 5
};

export const MicroCelebrationEngine: React.FC = () => {
  const { bubbles } = useBubbleStore();
  const { toast } = useToast();
  const [settings, setSettings] = useState<CelebrationSettings>(DEFAULT_SETTINGS);
  const [dailyCelebrations, setDailyCelebrations] = useState<number>(0);
  const [lastCelebrations, setLastCelebrations] = useState<Record<string, number>>({});

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('celebration_settings');
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (error) {
        console.warn('Failed to load celebration settings:', error);
      }
    }

    const dailyCount = localStorage.getItem(`celebrations_${new Date().toDateString()}`);
    if (dailyCount) {
      setDailyCelebrations(parseInt(dailyCount, 10) || 0);
    }
  }, []);

  // Check for celebration triggers when bubbles change
  useEffect(() => {
    if (!settings.enabled || dailyCelebrations >= settings.maxPerDay) return;
    
    const checkCelebrations = setTimeout(() => {
      detectCelebrationTriggers();
    }, 2000); // Delay to avoid celebrating mid-completion

    return () => clearTimeout(checkCelebrations);
  }, [bubbles.length, settings.enabled, dailyCelebrations]);

  const isInQuietHours = (): boolean => {
    if (!settings.quietHours) return false;
    
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return currentTime >= settings.quietHours.start && currentTime <= settings.quietHours.end;
  };

  const canCelebrate = (patternId: string): boolean => {
    if (!settings.enabled || isInQuietHours() || dailyCelebrations >= settings.maxPerDay) {
      return false;
    }

    const lastTime = lastCelebrations[patternId];
    if (!lastTime) return true;

    const pattern = CELEBRATION_PATTERNS.find(p => p.id === patternId);
    if (!pattern) return false;

    const cooldownMs = pattern.cooldown * 60 * 1000;
    return Date.now() - lastTime > cooldownMs;
  };

  const triggerCelebration = (pattern: CelebrationPattern) => {
    if (!canCelebrate(pattern.id) || !settings.tones[pattern.tone]) return;

    const polishedMessage = polishCopy(pattern.message, 'general');
    
    // Show celebration toast
    toast({
      duration: 4000,
      action: (
        <CelebrationToast
          message={polishedMessage}
          tone={pattern.tone}
          onMute={(tone) => muteTone(tone)}
          onDismiss={() => {}}
        />
      )
    });

    // Update celebration tracking
    setLastCelebrations(prev => ({
      ...prev,
      [pattern.id]: Date.now()
    }));

    const newCount = dailyCelebrations + 1;
    setDailyCelebrations(newCount);
    localStorage.setItem(`celebrations_${new Date().toDateString()}`, newCount.toString());
  };

  const detectCelebrationTriggers = () => {
    const completedToday = bubbles.filter(bubble => 
      bubble.completed && 
      new Date(bubble.updatedAt).toDateString() === new Date().toDateString()
    );

    if (completedToday.length === 0) return;

    // Check completion streak (last 3 completions within short time)
    const recentCompletions = completedToday
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3);

    if (recentCompletions.length >= 3) {
      const timeSpan = new Date(recentCompletions[0].updatedAt).getTime() - 
                      new Date(recentCompletions[2].updatedAt).getTime();
      
      if (timeSpan < 30 * 60 * 1000) { // 30 minutes
        triggerCelebration(CELEBRATION_PATTERNS[0]); // streak
        return;
      }
    }

    // Check for first completion of the day
    if (completedToday.length === 1) {
      triggerCelebration(CELEBRATION_PATTERNS[1]); // first_today
      return;
    }

    // Check for difficult task completion (check if marked as important)
    const lastCompleted = completedToday[0];
    if (lastCompleted.content?.includes('!') || lastCompleted.content?.includes('important')) {
      triggerCelebration(CELEBRATION_PATTERNS[2]); // difficult_conquered
      return;
    }

    // Check for comeback (completion after long gap)
    if (completedToday.length === 1) {
      const lastPreviousCompletion = bubbles
        .filter(b => b.completed && new Date(b.updatedAt).toDateString() !== new Date().toDateString())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

      if (lastPreviousCompletion) {
        const daysSince = (Date.now() - new Date(lastPreviousCompletion.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 2) {
          triggerCelebration(CELEBRATION_PATTERNS[3]); // comeback
          return;
        }
      }
    }

    // Check for focus session (multiple completions in short time)
    if (recentCompletions.length >= 5) {
      const timeSpan = new Date(recentCompletions[0].updatedAt).getTime() - 
                      new Date(recentCompletions[4].updatedAt).getTime();
      
      if (timeSpan < 60 * 60 * 1000) { // 1 hour
        triggerCelebration(CELEBRATION_PATTERNS[4]); // focus_flow
      }
    }
  };

  const muteTone = (tone: GlimmerTone) => {
    const newSettings = {
      ...settings,
      tones: { ...settings.tones, [tone]: false }
    };
    setSettings(newSettings);
    localStorage.setItem('celebration_settings', JSON.stringify(newSettings));

    toast({
      title: "Celebration tone muted",
      description: `${tone} celebrations are now disabled`
    });
  };

  // This component runs celebrations in the background
  return null;
};

// Export settings management hook
export const useCelebrationSettings = () => {
  const [settings, setSettings] = useState<CelebrationSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const saved = localStorage.getItem('celebration_settings');
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (error) {
        console.warn('Failed to load celebration settings:', error);
      }
    }
  }, []);

  const updateSettings = (updates: Partial<CelebrationSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('celebration_settings', JSON.stringify(newSettings));
  };

  const getDailyStats = () => {
    const today = new Date().toDateString();
    const count = parseInt(localStorage.getItem(`celebrations_${today}`) || '0', 10);
    return {
      todayCount: count,
      maxPerDay: settings.maxPerDay,
      remaining: Math.max(0, settings.maxPerDay - count)
    };
  };

  return {
    settings,
    updateSettings,
    getDailyStats
  };
};