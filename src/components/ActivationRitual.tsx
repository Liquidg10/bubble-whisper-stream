/**
 * Activation Ritual Component
 * One-line Start Cue to help shift DMN→TPN (Default Mode Network to Task Positive Network)
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivationRitualProps {
  onComplete?: () => void;
  className?: string;
}

export function ActivationRitual({ onComplete, className }: ActivationRitualProps) {
  const [isActive, setIsActive] = useState(false);
  const [showBreathCount, setShowBreathCount] = useState(false);
  const [breathCount, setBreathCount] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'breathing' | 'complete'>('ready');

  const startCues = [
    "Ready to focus. Take one breath to begin.",
    "Time to shift into task mode. One breath first.",
    "Let's do this. Breath in, focus on.",
    "Starting fresh. One mindful breath to center.",
    "Focus time begins now. Breathe once, then begin."
  ];

  const [currentCue] = useState(() => 
    startCues[Math.floor(Math.random() * startCues.length)]
  );

  useEffect(() => {
    if (breathCount >= 3 && phase === 'breathing') {
      setPhase('complete');
      setTimeout(() => {
        onComplete?.();
      }, 1000);
    }
  }, [breathCount, phase, onComplete]);

  const handleStart = () => {
    setIsActive(true);
    if (showBreathCount) {
      setPhase('breathing');
      setBreathCount(0);
    } else {
      setPhase('complete');
      setTimeout(() => {
        onComplete?.();
      }, 500);
    }
  };

  const handleBreath = () => {
    setBreathCount(prev => prev + 1);
  };

  const handleReset = () => {
    setIsActive(false);
    setPhase('ready');
    setBreathCount(0);
  };

  const getPhaseContent = () => {
    switch (phase) {
      case 'ready':
        return (
          <>
            <p className="text-sm text-foreground/80 mb-4 leading-relaxed">
              {currentCue}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleStart}
                className="flex-1"
                size="sm"
              >
                <Play className="h-4 w-4 mr-1" />
                Start Focus
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBreathCount(!showBreathCount)}
                size="sm"
                className="px-3"
              >
                {showBreathCount ? '3×' : '1×'}
              </Button>
            </div>
          </>
        );

      case 'breathing':
        return (
          <>
            <p className="text-sm text-foreground/80 mb-2">
              Breath {breathCount}/3
            </p>
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-full border-2 border-primary/20 flex items-center justify-center">
                <div className={cn(
                  "w-8 h-8 rounded-full bg-primary/30 transition-all duration-1000",
                  breathCount > 0 && "bg-primary/60 scale-110"
                )}>
                </div>
              </div>
            </div>
            <Button
              onClick={handleBreath}
              className="w-full"
              size="sm"
            >
              Breathe ({breathCount}/3)
            </Button>
          </>
        );

      case 'complete':
        return (
          <>
            <p className="text-sm text-foreground/80 mb-4 text-center">
              ✓ Focused and ready to begin
            </p>
            <Button
              variant="outline"
              onClick={handleReset}
              size="sm"
              className="w-full"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </>
        );
    }
  };

  return (
    <Card className={cn(
      "w-80 bg-card/95 backdrop-blur-sm border border-border/50",
      className
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">Start Ritual</h3>
          <div className="text-xs text-muted-foreground">
            {phase === 'ready' && 'DMN → TPN'}
            {phase === 'breathing' && 'Centering...'}
            {phase === 'complete' && 'Ready'}
          </div>
        </div>
        
        {getPhaseContent()}
        
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Optional ritual to help transition into focused work
          </p>
        </div>
      </CardContent>
    </Card>
  );
}