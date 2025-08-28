import React from 'react';
import { Button } from '@/components/ui/button';
import { Waves, Pause } from 'lucide-react';
import { useFloatMotion } from '@/hooks/useFloatMotion';

interface FloatMotionToggleProps {
  className?: string;
}

export function FloatMotionToggle({ className }: FloatMotionToggleProps) {
  const { isFloating, toggleFloat, prefersReducedMotion } = useFloatMotion();

  return (
    <Button
      variant={isFloating ? "default" : "outline"}
      size="sm"
      onClick={toggleFloat}
      className={`bg-card/80 backdrop-blur-sm ${className}`}
      disabled={prefersReducedMotion}
      title={prefersReducedMotion 
        ? "Float motion disabled (Reduced Motion)" 
        : isFloating 
          ? "Disable float motion" 
          : "Enable float motion"
      }
      aria-label={`Float motion ${isFloating ? 'enabled' : 'disabled'}`}
    >
      {isFloating ? (
        <Waves className="h-4 w-4" />
      ) : (
        <Pause className="h-4 w-4" />
      )}
      {prefersReducedMotion && (
        <span className="ml-1 text-xs opacity-60">RM</span>
      )}
    </Button>
  );
}