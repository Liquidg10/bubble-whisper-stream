import React, { useEffect, useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { GlimmerCard } from '@/components/GlimmerCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Sparkles } from 'lucide-react';
import { glimmerService } from '@/services/glimmerService';
import type { Glimmer } from '@/types/bubble';

export const GlimmerNotifications: React.FC = () => {
  const { glimmers, dismissGlimmer, addGlimmer, settings, bubbles, reminders } = useBubbleStore();
  const [activeGlimmer, setActiveGlimmer] = useState<Glimmer | null>(null);

  // Check for new glimmer triggers
  useEffect(() => {
    if (!settings.intelligenceEnabled || !settings.glimmersEnabled) return;

    const checkGlimmers = async () => {
      try {
        const shouldTrigger = await glimmerService.shouldTriggerGlimmer();

        if (shouldTrigger) {
          const newGlimmer = await glimmerService.generateGlimmer(
            settings.preferredGlimmerTone || 'Friend'
          );

          if (newGlimmer) {
            await addGlimmer(newGlimmer);
            setActiveGlimmer(newGlimmer);
          }
        }
      } catch (error) {
        console.error('Failed to check glimmers:', error);
      }
    };

    // Check every 15 minutes
    const interval = setInterval(checkGlimmers, 15 * 60 * 1000);
    
    // Initial check
    checkGlimmers();

    return () => clearInterval(interval);
  }, [settings.intelligenceEnabled, settings.glimmersEnabled, bubbles.length, reminders.length]);

  // Show most recent undismissed glimmer
  useEffect(() => {
    const latestGlimmer = glimmers
      .filter(g => !g.dismissed)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    
    setActiveGlimmer(latestGlimmer || null);
  }, [glimmers]);

  const handleDismiss = async (glimmerId: string) => {
    await dismissGlimmer(glimmerId);
    setActiveGlimmer(null);
  };

  if (!activeGlimmer || !settings.intelligenceEnabled) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm">
      <div className="bg-card/95 backdrop-blur-sm border border-primary/20 rounded-lg shadow-lg p-4 animate-in slide-in-from-bottom-5 duration-300">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <Badge variant="secondary" className="text-xs">
              Glimmer
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDismiss(activeGlimmer.id)}
            className="h-6 w-6 p-0 hover:bg-primary/10"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        <GlimmerCard 
          glimmer={activeGlimmer}
          onDismiss={handleDismiss}
          compact
        />
      </div>
    </div>
  );
};