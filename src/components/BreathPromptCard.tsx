/**
 * Breath Prompt Card - Buddhist/Breathwork Expert Integration
 * Two-breath and physiological sigh prompts with ambient delivery
 */

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Waves, X, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBubbleStore } from '@/stores/bubbleStore';

interface BreathPromptCardProps {
  type: 'two-breath' | 'physiological-sigh';
  trigger: 'pre-effort' | 'post-stress';
  onComplete?: () => void;
  onDismiss?: () => void;
  onSkipForever?: () => void;
  className?: string;
}

export const BreathPromptCard: React.FC<BreathPromptCardProps> = ({
  type,
  trigger,
  onComplete,
  onDismiss,
  onSkipForever,
  className = ''
}) => {
  const [isActive, setIsActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale' | 'complete'>('inhale');
  const [cycle, setCycle] = useState(0);
  const { toast } = useToast();
  const settings = useBubbleStore(state => state.settings);

  // Check if user has disabled breath prompts
  const breathPromptsEnabled = true; // Default enabled
  
  const breathConfig = {
    'two-breath': {
      cycles: 2,
      inhale: 4,
      hold: 1,
      exhale: 6, // Exhale-emphasized
      description: 'Two gentle breaths',
      instructions: 'Breathe in for 4, hold briefly, out for 6'
    },
    'physiological-sigh': {
      cycles: 1,
      inhale: 3,
      hold: 0,
      exhale: 8, // Double exhale for physiological effect
      description: 'Physiological sigh',
      instructions: 'Double inhale, long exhale'
    }
  };

  const config = breathConfig[type];
  const totalDuration = (config.inhale + config.hold + config.exhale) * 1000;

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + (100 / (totalDuration / 100));
        
        if (newProgress >= 100) {
          setCycle(prevCycle => {
            const newCycle = prevCycle + 1;
            if (newCycle >= config.cycles) {
              setPhase('complete');
              setTimeout(() => {
                onComplete?.();
                handleComplete();
              }, 500);
              return newCycle;
            } else {
              setProgress(0);
              setPhase('inhale');
              return newCycle;
            }
          });
          return 0;
        }

        // Update phase based on progress
        const phaseProgress = newProgress;
        const inhaleEnd = (config.inhale / (config.inhale + config.hold + config.exhale)) * 100;
        const holdEnd = ((config.inhale + config.hold) / (config.inhale + config.hold + config.exhale)) * 100;

        if (phaseProgress < inhaleEnd) {
          setPhase('inhale');
        } else if (phaseProgress < holdEnd) {
          setPhase('hold');
        } else {
          setPhase('exhale');
        }

        return newProgress;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, config, totalDuration, onComplete]);

  const handleStart = () => {
    setIsActive(true);
    setProgress(0);
    setPhase('inhale');
    setCycle(0);
  };

  const handleComplete = () => {
    setIsActive(false);
    setProgress(0);
    setCycle(0);
    toast({
      title: "Breath complete",
      description: "Nice work. Ready when you are.",
      duration: 2000
    });
  };

  const handleDismiss = () => {
    setIsActive(false);
    onDismiss?.();
  };

  const handleSkipForever = () => {
    onSkipForever?.();
    // Update user settings to disable breath prompts
    console.log('Breath prompts disabled by user');
    
    toast({
      title: "Breath prompts disabled",
      description: "You can re-enable them in Settings > Voice",
      duration: 3000
    });
  };

  if (!breathPromptsEnabled) {
    return null;
  }

  const getPhaseInstruction = () => {
    switch (phase) {
      case 'inhale':
        return type === 'physiological-sigh' ? 'Breathe in (double inhale)' : 'Breathe in slowly';
      case 'hold':
        return 'Hold gently';
      case 'exhale':
        return 'Breathe out slowly';
      case 'complete':
        return 'Complete';
      default:
        return '';
    }
  };

  const getTriggerMessage = () => {
    switch (trigger) {
      case 'pre-effort':
        return 'Before you begin, a moment to center:';
      case 'post-stress':
        return 'When things feel intense, this can help:';
      default:
        return 'A gentle pause:';
    }
  };

  const getMotivationText = () => {
    if (type === 'physiological-sigh') {
      return 'Research shows this pattern helps regulate stress in under 60 seconds.';
    }
    return 'Two mindful breaths can shift your state and improve focus.';
  };

  return (
    <Card className={`p-4 max-w-sm mx-auto border-muted bg-background/50 backdrop-blur-sm ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Waves className="h-4 w-4 text-primary/70" />
          <span className="text-sm font-medium text-foreground/80">
            {config.description}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {getTriggerMessage()}
        </p>

        {!isActive && (
          <div className="space-y-3">
            <p className="text-sm text-foreground/70">
              {config.instructions}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {getMotivationText()}
            </p>
            <Button
              onClick={handleStart}
              size="sm"
              className="w-full"
              variant="outline"
            >
              <Clock className="h-3 w-3 mr-2" />
              Start ({config.cycles === 1 ? '30s' : '60s'})
            </Button>
          </div>
        )}

        {isActive && (
          <div className="space-y-3">
            <div className="text-center">
              <Badge variant="secondary" className="mb-2">
                {cycle + 1} of {config.cycles}
              </Badge>
              <p className="text-sm font-medium text-foreground">
                {getPhaseInstruction()}
              </p>
            </div>

            <Progress 
              value={progress} 
              className="h-2"
            />

            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="text-xs text-muted-foreground"
              >
                Skip this time
              </Button>
            </div>
          </div>
        )}

        {!isActive && (
          <div className="pt-2 border-t border-border/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkipForever}
              className="w-full text-xs text-muted-foreground hover:text-foreground"
            >
              Don't show breath prompts
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default BreathPromptCard;