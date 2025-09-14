/**
 * P15 - Enhanced Joy & Micro-Celebrations 
 * Brief momentum burst celebrations with configurable "Less of this" toggle
 * Integrates with existing services while adding cohesion checks
 */

import React, { useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useBubbleStore } from '@/stores/bubbleStore';
import { momentumBurstService } from '@/services/momentumBurstService';
import { becauseExplanationService } from '@/services/becauseExplanationService';
import { assistantCohesionService } from '@/services/assistantCohesionService';
import { BecauseExplanation } from '@/components/privacy/BecauseExplanation';
import type { GlimmerTone } from '@/types/glimmer';
import type { MomentumBurst } from '@/services/momentumBurstService';

interface CelebrationSettings {
  enabled: boolean;
  maxPerDay: number;
  mutedTones: GlimmerTone[];
  quietHours: { start: string; end: string };
  showExplanations: boolean;
}

const DEFAULT_SETTINGS: CelebrationSettings = {
  enabled: true,
  maxPerDay: 6, // P14 cognitive load limit
  mutedTones: [],
  quietHours: { start: '22:00', end: '08:00' },
  showExplanations: true
};

// Brief celebration messages (<90 chars, never saccharine)
const CELEBRATION_MESSAGES = {
  'Friend': [
    'Nice momentum! ✨',
    'You\'re on a roll 🎯',
    'Steady progress 👏',
    'Great focus today 🌟'
  ],
  'Coach': [
    'Strong execution ⚡',
    'Consistent progress 📈',
    'Focused effort 🎯',
    'Building momentum 💪'
  ],
  'Scientist': [
    'Pattern detected: productivity burst 📊',
    'Completion rate optimized ⚡',
    'Efficiency pattern identified 🔬',
    'Flow state achieved 🧠'
  ],
  'Future You': [
    'Tomorrow thanks you 🌅',
    'Progress compounds daily 📈',
    'Small wins, big impact ✨',
    'Building your future 🚀'
  ]
};

export const EnhancedMicroCelebrations: React.FC = () => {
  const { toast } = useToast();
  const { bubbles, settings } = useBubbleStore();
  const [celebrationSettings, setCelebrationSettings] = React.useState<CelebrationSettings>(DEFAULT_SETTINGS);
  const [dailyCount, setDailyCount] = React.useState(0);
  const [lastCelebration, setLastCelebration] = React.useState<number>(0);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('celebration-settings');
    if (saved) {
      setCelebrationSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
    }
    
    const today = new Date().toDateString();
    const dailyCountKey = `celebration-count-${today}`;
    const savedCount = localStorage.getItem(dailyCountKey);
    if (savedCount) {
      setDailyCount(parseInt(savedCount, 10));
    }
  }, []);

  const saveSettings = useCallback((newSettings: Partial<CelebrationSettings>) => {
    const updated = { ...celebrationSettings, ...newSettings };
    setCelebrationSettings(updated);
    localStorage.setItem('celebration-settings', JSON.stringify(updated));
  }, [celebrationSettings]);

  const isQuietHours = useCallback((): boolean => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = celebrationSettings.quietHours.start.split(':').map(Number);
    const [endHour, endMin] = celebrationSettings.quietHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Overnight quiet hours
      return currentTime >= startTime || currentTime <= endTime;
    }
  }, [celebrationSettings.quietHours]);

  const canCelebrate = useCallback((tone: GlimmerTone): boolean => {
    if (!celebrationSettings.enabled) return false;
    if (!settings.intelligenceEnabled) return false;
    if (celebrationSettings.mutedTones.includes(tone)) return false;
    if (dailyCount >= celebrationSettings.maxPerDay) return false;
    if (isQuietHours()) return false;
    
    // Cooldown: min 5 minutes between celebrations
    const now = Date.now();
    if (now - lastCelebration < 5 * 60 * 1000) return false;
    
    return true;
  }, [celebrationSettings, settings.intelligenceEnabled, dailyCount, lastCelebration, isQuietHours]);

  const showCelebration = useCallback(async (
    burst: MomentumBurst,
    tone: GlimmerTone
  ) => {
    if (!canCelebrate(tone)) return;

    // Get celebration message and validate cohesion
    const messages = CELEBRATION_MESSAGES[tone];
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    // Validate with cohesion service
    const cohesionCheck = assistantCohesionService.validateUIText(message, 'celebration');
    const finalMessage = cohesionCheck.isValid ? message : (cohesionCheck.sanitized || 'Great progress! ✨');

    // Generate explanation
    const explanation = becauseExplanationService.generateCelebrationExplanation(
      burst.type === 'task_completion' ? 'streak' : 
      burst.type === 'focus_session' ? 'focus' :
      burst.type === 'productivity_milestone' ? 'milestone' : 'comeback',
      {
        count: burst.context.tasksCompleted || burst.context.joyMomentsCount || 0,
        timespan: burst.context.focusDuration || burst.context.timeframe || 0,
        difficulty: 0.5 // Default difficulty
      }
    );

    // Show celebration toast
    toast({
      title: finalMessage,
      description: celebrationSettings.showExplanations ? explanation.shortText : undefined,
      duration: 4000,
      className: 'celebration-toast bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20',
      action: celebrationSettings.showExplanations ? (
        <BecauseExplanation 
          drivers={explanation.drivers.map(d => d.signal)} 
          compact 
        />
      ) : undefined
    });

    // Update tracking
    const newCount = dailyCount + 1;
    setDailyCount(newCount);
    setLastCelebration(Date.now());
    
    // Save daily count
    const today = new Date().toDateString();
    localStorage.setItem(`celebration-count-${today}`, newCount.toString());

    console.log(`🎉 Celebration: ${finalMessage} (${tone})`);
  }, [canCelebrate, toast, celebrationSettings.showExplanations, dailyCount]);

  const checkForCelebrations = useCallback(async () => {
    if (!celebrationSettings.enabled || !settings.intelligenceEnabled) return;
    
    try {
      // Get recent bubbles (last 2 hours)
      const recentCutoff = Date.now() - (2 * 60 * 60 * 1000);
      const recentBubbles = bubbles.filter(b => b.createdAt > recentCutoff);
      
      if (recentBubbles.length === 0) return;

      // Check for momentum burst
      const burst = await momentumBurstService.checkForMomentumBurst(recentBubbles);
      
      if (burst && burst.celebrationEligible) {
        const tone = (settings.preferredGlimmerTone || 'Friend') as GlimmerTone;
        await showCelebration(burst, tone);
      }
    } catch (error) {
      console.error('Failed to check for celebrations:', error);
    }
  }, [bubbles, celebrationSettings.enabled, settings, showCelebration]);

  // Check for celebrations when bubbles change
  useEffect(() => {
    const timeoutId = setTimeout(checkForCelebrations, 3000); // 3s delay for completion patterns
    return () => clearTimeout(timeoutId);
  }, [bubbles.length, checkForCelebrations]);

  const muteTone = useCallback((tone: GlimmerTone) => {
    const newMutedTones = [...celebrationSettings.mutedTones, tone];
    saveSettings({ mutedTones: newMutedTones });
    
    toast({
      title: 'Celebration tone muted',
      description: `You won't see ${tone} celebrations anymore`,
      duration: 3000
    });
  }, [celebrationSettings.mutedTones, saveSettings, toast]);

  const toggleCelebrations = useCallback((enabled: boolean) => {
    saveSettings({ enabled });
    
    toast({
      title: enabled ? 'Celebrations enabled' : 'Celebrations disabled',
      description: enabled ? 'You\'ll see brief momentum celebrations' : 'Celebrations are now off',
      duration: 3000
    });
  }, [saveSettings, toast]);

  // Expose controls for settings UI
  React.useEffect(() => {
    (window as any).__celebration_controls = {
      muteTone,
      toggleCelebrations,
      settings: celebrationSettings,
      stats: { dailyCount, remaining: celebrationSettings.maxPerDay - dailyCount }
    };
  }, [muteTone, toggleCelebrations, celebrationSettings, dailyCount]);

  // This component runs invisibly
  return null;
};