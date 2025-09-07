/**
 * PROMPT 4: CBT Chip Component - Humane, non-clinical micro-nudges
 * Renders inline, dismissible chips with accessibility and explainability
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, HelpCircle } from 'lucide-react';
import { useAccessibility } from '@/components/AccessibilityProvider';
import { useToast } from '@/hooks/use-toast';
import type { CBTAction } from '@/ai/cbt/types';

interface CBTChipProps {
  action: CBTAction;
  onEngagement?: (engaged: boolean) => void;
  onDismiss?: () => void;
  className?: string;
}

export function CBTChip({ 
  action, 
  onEngagement, 
  onDismiss,
  className = '' 
}: CBTChipProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [showExplainability, setShowExplainability] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);
  const { settings } = useAccessibility();
  const { toast } = useToast();
  
  // Reduced motion support
  const shouldAnimate = !settings.reducedMotion;
  
  // Focus management
  useEffect(() => {
    if (isVisible && chipRef.current) {
      // Announce to screen readers without stealing focus
      const announcement = `Gentle check-in available: ${action.text}`;
      const ariaLive = document.createElement('div');
      ariaLive.setAttribute('aria-live', 'polite');
      ariaLive.setAttribute('aria-atomic', 'true');
      ariaLive.className = 'sr-only';
      ariaLive.textContent = announcement;
      document.body.appendChild(ariaLive);
      
      setTimeout(() => {
        document.body.removeChild(ariaLive);
      }, 1000);
    }
  }, [isVisible, action.text]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleDismiss();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleEngagement();
    }
  };

  const handleEngagement = () => {
    onEngagement?.(true);
    toast({
      title: "Let's explore this together",
      description: "I'm here to support you through this.",
    });
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onEngagement?.(false); // Record as "Not now" for fatigue system
    onDismiss?.();
    
    // Announce dismissal to screen readers
    toast({
      title: "Check-in dismissed",
      description: "I'll give you some space for now.",
    });
  };

  if (!isVisible) return null;

  const chipContent = (
    <motion.div
      ref={chipRef}
      initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.95 } : false}
      animate={shouldAnimate ? { opacity: 1, y: 0, scale: 1 } : {}}
      exit={shouldAnimate ? { opacity: 0, y: -10, scale: 0.95 } : {}}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`
        inline-flex items-center gap-2 px-3 py-2 rounded-full
        border border-border/50 bg-muted/30 hover:bg-muted/50
        transition-colors duration-200
        focus-within:ring-2 focus-within:ring-primary/20 focus-within:ring-offset-2
        ${className}
      `}
      role="complementary"
      aria-label="Supportive check-in"
    >
      {/* Main chip content */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground font-medium">
          {action.text}
        </span>
        
        {/* Explainability "Because..." pill */}
        {action.data?.explainability && (
          <Popover open={showExplainability} onOpenChange={setShowExplainability}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 rounded-full hover:bg-muted"
                aria-label="Why am I seeing this?"
                onClick={(e) => e.stopPropagation()}
              >
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-2 text-xs" 
              side="top"
              align="center"
            >
              <div className="text-muted-foreground">
                Because I {action.data.explainability}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      
      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs hover:bg-primary/10 hover:text-primary"
          onClick={handleEngagement}
          onKeyDown={handleKeyDown}
          aria-label="Explore this together"
        >
          Yes
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
          onClick={handleDismiss}
          aria-label="Not now - dismiss this check-in"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </motion.div>
  );

  return (
    <AnimatePresence mode="wait">
      {isVisible && chipContent}
    </AnimatePresence>
  );
}

// Helper component for rendering in conversation flow
interface CBTChipWrapperProps {
  action: CBTAction;
  onEngagement?: (engaged: boolean) => void;
  className?: string;
}

export function CBTChipWrapper({ 
  action, 
  onEngagement,
  className = '' 
}: CBTChipWrapperProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible || action.type !== 'chip') {
    return null;
  }

  return (
    <div className={`flex justify-start my-2 ${className}`}>
      <CBTChip
        action={action}
        onEngagement={(engaged) => {
          onEngagement?.(engaged);
          if (!engaged) {
            setIsVisible(false);
          }
        }}
        onDismiss={() => setIsVisible(false)}
      />
    </div>
  );
}