/**
 * Micro Celebration Pulse - Neurologist-Informed Reward Prediction Error
 * Subtle visual and haptic feedback for completion events
 */

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, CheckCircle, TrendingUp } from 'lucide-react';

interface MicroCelebrationPulseProps {
  type: 'progress-pulse' | 'completion-glow' | 'streak-spark';
  message?: string;
  duration?: number;
  onComplete?: () => void;
  className?: string;
  trigger?: boolean;
}

export const MicroCelebrationPulse: React.FC<MicroCelebrationPulseProps> = ({
  type,
  message,
  duration = 2000,
  onComplete,
  className = '',
  trigger = false
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'enter' | 'pulse' | 'exit'>('enter');

  useEffect(() => {
    if (trigger) {
      setIsVisible(true);
      setAnimationPhase('enter');

      // Enter phase
      const enterTimer = setTimeout(() => {
        setAnimationPhase('pulse');
      }, 200);

      // Exit phase
      const exitTimer = setTimeout(() => {
        setAnimationPhase('exit');
      }, duration - 300);

      // Complete
      const completeTimer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, duration);

      return () => {
        clearTimeout(enterTimer);
        clearTimeout(exitTimer);
        clearTimeout(completeTimer);
      };
    }
  }, [trigger, duration, onComplete]);

  // Haptic feedback for mobile devices
  useEffect(() => {
    if (isVisible && 'vibrate' in navigator) {
      // Gentle haptic pulse pattern
      const pattern = type === 'completion-glow' ? [50, 50, 50] : [30];
      navigator.vibrate(pattern);
    }
  }, [isVisible, type]);

  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'progress-pulse':
        return <TrendingUp className="h-4 w-4" />;
      case 'completion-glow':
        return <CheckCircle className="h-4 w-4" />;
      case 'streak-spark':
        return <Sparkles className="h-4 w-4" />;
      default:
        return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getCelebrationClasses = () => {
    const baseClasses = "flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-sm";
    
    switch (type) {
      case 'progress-pulse':
        return cn(
          baseClasses,
          "bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400",
          {
            'animate-pulse scale-105': animationPhase === 'pulse',
            'opacity-0 scale-95': animationPhase === 'exit',
            'opacity-100 scale-100': animationPhase === 'enter'
          }
        );
      case 'completion-glow':
        return cn(
          baseClasses,
          "bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400",
          {
            'animate-pulse shadow-lg shadow-green-500/30': animationPhase === 'pulse',
            'opacity-0 scale-95': animationPhase === 'exit',
            'opacity-100 scale-100': animationPhase === 'enter'
          }
        );
      case 'streak-spark':
        return cn(
          baseClasses,
          "bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400",
          {
            'animate-bounce': animationPhase === 'pulse',
            'opacity-0 scale-95': animationPhase === 'exit',
            'opacity-100 scale-100': animationPhase === 'enter'
          }
        );
      default:
        return baseClasses;
    }
  };

  const getDefaultMessage = () => {
    switch (type) {
      case 'progress-pulse':
        return 'Progress made';
      case 'completion-glow':
        return 'Nice work';
      case 'streak-spark':
        return 'Momentum building';
      default:
        return 'Well done';
    }
  };

  return (
    <div className={cn(
      "fixed top-20 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300",
      className
    )}>
      <div className={getCelebrationClasses()}>
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="text-sm font-medium">
            {message || getDefaultMessage()}
          </span>
        </div>
      </div>
    </div>
  );
};

// Hook for triggering micro-celebrations
export const useMicroCelebration = () => {
  const [celebration, setCelebration] = useState<{
    type: MicroCelebrationPulseProps['type'];
    message?: string;
    trigger: boolean;
  }>({
    type: 'completion-glow',
    trigger: false
  });

  const triggerCelebration = (
    type: MicroCelebrationPulseProps['type'],
    message?: string
  ) => {
    setCelebration({
      type,
      message,
      trigger: true
    });

    // Reset trigger after animation
    setTimeout(() => {
      setCelebration(prev => ({ ...prev, trigger: false }));
    }, 2100);
  };

  const triggerProgressPulse = (message?: string) => {
    triggerCelebration('progress-pulse', message);
  };

  const triggerCompletionGlow = (message?: string) => {
    triggerCelebration('completion-glow', message);
  };

  const triggerStreakSpark = (message?: string) => {
    triggerCelebration('streak-spark', message);
  };

  return {
    celebration,
    triggerProgressPulse,
    triggerCompletionGlow,
    triggerStreakSpark,
    MicroCelebrationComponent: () => (
      <MicroCelebrationPulse
        type={celebration.type}
        message={celebration.message}
        trigger={celebration.trigger}
      />
    )
  };
};

export default MicroCelebrationPulse;