// Motion control toggle button with status chip
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause } from 'lucide-react';
import { 
  toggleAnimation, 
  isMotionEnabled, 
  isReducedMotionPreferred,
  subscribeToMotionState 
} from '@/lib/motion';

interface MotionControllerProps {
  className?: string;
  showStatusChip?: boolean;
}

export function MotionController({ className, showStatusChip = true }: MotionControllerProps) {
  const [motionActive, setMotionActive] = useState(isMotionEnabled());
  const [reducedMotion, setReducedMotion] = useState(isReducedMotionPreferred());

  useEffect(() => {
    // Subscribe to motion state changes
    const unsubscribe = subscribeToMotionState(setMotionActive);
    
    // Listen for reduced motion preference changes
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };
    
    setReducedMotion(motionQuery.matches);
    motionQuery.addEventListener('change', handleMotionChange);
    
    return () => {
      unsubscribe();
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  const handleToggle = () => {
    if (!reducedMotion) {
      toggleAnimation();
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        variant={motionActive ? "default" : "outline"}
        size="sm"
        onClick={handleToggle}
        disabled={reducedMotion}
        className="bg-card/80 backdrop-blur-sm"
        title={reducedMotion 
          ? "Motion disabled (Reduced Motion preference)" 
          : motionActive 
            ? "Pause motion (Spacebar)" 
            : "Play motion (Spacebar)"
        }
        aria-label={`Motion ${motionActive ? 'playing' : 'paused'}`}
      >
        {motionActive ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {reducedMotion && (
          <span className="ml-1 text-xs opacity-60">RM</span>
        )}
      </Button>
      
      {showStatusChip && (
        <Badge 
          variant={motionActive ? "default" : "secondary"}
          className="text-xs"
          aria-live="polite"
        >
          Motion: {reducedMotion ? 'Off (RM)' : motionActive ? 'On' : 'Off'}
        </Badge>
      )}
    </div>
  );
}