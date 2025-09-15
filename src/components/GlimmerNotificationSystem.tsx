import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2, X, Heart, Brain, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { glimmerService } from '@/services/glimmerService';
import { ttsService } from '@/services/tts';
import { Glimmer, GlimmerTone } from '@/types/bubble';
import { useAccessibility } from './AccessibilityProvider';

const TONE_ICONS = {
  supportive: Heart,
  motivational: Users,
  analytical: Brain,
  inspiring: Zap,
} as const;

const TONE_COLORS = {
  supportive: 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 border-pink-500/30',
  motivational: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/30',
  analytical: 'bg-gradient-to-r from-green-500/20 to-teal-500/20 border-green-500/30',
  inspiring: 'bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border-orange-500/30',
} as const;

export function GlimmerNotificationSystem() {
  const [activeGlimmer, setActiveGlimmer] = useState<Glimmer | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const { announceText, settings } = useAccessibility();

  useEffect(() => {
    const checkForGlimmers = async () => {
      try {
        const glimmer = await glimmerService.generateGlimmer();
        if (glimmer) {
          setActiveGlimmer(glimmer);
          setIsVisible(true);
          
          // Announce to screen readers
          announceText(`New glimmer: ${glimmer.message}`);
          
          // Auto-speak if TTS is enabled and glimmer supports it
          if (glimmer.deliveredVia === 'tts' || glimmer.deliveredVia === 'both') {
            const tone = glimmer.tone.toLowerCase() as 'compassionate' | 'gentle' | 'encouraging' | 'neutral';
            await ttsService.speak(glimmer.message, { tone });
          }
        }
      } catch (error) {
        console.warn('Failed to check for glimmers:', error);
      }
    };

    // Check for glimmers every 30 seconds
    const interval = setInterval(checkForGlimmers, 30000);
    
    // Check immediately on mount
    checkForGlimmers();

    return () => clearInterval(interval);
  }, [announceText]);

  const handleDismiss = async () => {
    if (activeGlimmer) {
      await glimmerService.dismissGlimmer(activeGlimmer.id);
      setIsVisible(false);
      setTimeout(() => setActiveGlimmer(null), 300);
    }
  };

  const handleSpeak = async () => {
    if (activeGlimmer) {
      const tone = activeGlimmer.tone.toLowerCase() as 'compassionate' | 'gentle' | 'encouraging' | 'neutral';
      await ttsService.speak(activeGlimmer.message, { tone, interrupt: true });
    }
  };

  if (!activeGlimmer) return null;

  const ToneIcon = TONE_ICONS[activeGlimmer.tone];
  const toneColor = TONE_COLORS[activeGlimmer.tone];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ 
            duration: settings.reducedMotion ? 0.1 : 0.3,
            ease: "easeOut" 
          }}
          className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto"
        >
          <Card className={`shadow-lg border-2 ${toneColor}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <ToneIcon className="h-5 w-5 text-primary" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs">
                      Assistant
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Glimmer
                    </Badge>
                  </div>
                  
                  <p className="text-sm leading-relaxed text-on-surface mb-3">
                    {activeGlimmer.message}
                  </p>
                  
                  {activeGlimmer.cause && (
                    <p className="text-xs text-on-surface-variant">
                      💫 {activeGlimmer.cause}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-1">
                  {ttsService.isAvailable() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSpeak}
                      className="h-8 w-8 p-0"
                      aria-label="Read glimmer aloud"
                    >
                      <Volume2 className="h-4 w-4" />
                    </Button>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDismiss}
                    className="h-8 w-8 p-0"
                    aria-label="Dismiss glimmer"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}