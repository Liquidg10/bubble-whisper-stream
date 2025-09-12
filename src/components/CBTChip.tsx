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
import { cbtMetricsService } from '@/services/cbtMetricsService';
import { cbtABTestingService } from '@/services/cbtABTestingService';
import { getChipCopy, getContextualEncouragement } from '@/services/cbtCopyService';
import { polishCopy } from '@/utils/copyPolish';
import { metricsService } from '@/services/metricsService';

interface CBTChipProps {
  action: CBTAction;
  onEngagement?: (engaged: boolean) => void;
  onDismiss?: () => void;
  className?: string;
  userId?: string; // For A/B testing and metrics
}

export function CBTChip({ 
  action, 
  onEngagement, 
  onDismiss,
  className = '',
  userId
}: CBTChipProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [showExplainability, setShowExplainability] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);
  const { settings } = useAccessibility();
  const { toast } = useToast();
  
  // Get copy variant for this user and action
  const chipCopy = userId ? getChipCopy(userId, action.type) : {
    promptText: polishCopy(action.text, 'cbt'),
    primaryAction: "That helps",
    dismissAction: "Not now", 
    explainability: action.data?.explainability || "I noticed something worth exploring"
  };
  
  // Reduced motion support
  const shouldAnimate = !settings.reducedMotion;
  
  // Focus management and impression tracking
  useEffect(() => {
    if (isVisible && chipRef.current) {
      // Store shown timestamp for tracking
      chipRef.current.dataset.shownAt = Date.now().toString();
      
      // P19: Track suggestion impression
      if (userId) {
        metricsService.emitSuggestionImpression(
          action.type,
          'cbt_chip',
          0.8 // Default confidence for CBT suggestions
        );
      }
      
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
  }, [isVisible, action.text, action.type, userId]);

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
    
    // Track engagement metrics
    if (userId) {
      cbtMetricsService.recordAcceptance([]);
      // P19: Track suggestion accept
      metricsService.emitSuggestionAccept(
        action.type,
        'cbt_chip',
        Date.now() - (chipRef.current?.dataset.shownAt ? parseInt(chipRef.current.dataset.shownAt) : Date.now())
      );
    }
    
    toast({
      title: getContextualEncouragement('helpful'),
      description: "I'll keep this style of support in mind.",
    });
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onEngagement?.(false); // Record as "Not now" for fatigue system
    onDismiss?.();
    
    // Track dismissal metrics  
    if (userId) {
      cbtMetricsService.recordDecline([]);
      // P19: Track suggestion dismiss
      metricsService.emitSuggestionDismiss(
        action.type,
        'cbt_chip',
        Date.now() - (chipRef.current?.dataset.shownAt ? parseInt(chipRef.current.dataset.shownAt) : Date.now())
      );
    }
    
    // Announce dismissal to screen readers
    toast({
      title: getContextualEncouragement('dismissed'),
      description: "I'll adjust how often I offer this type of support.",
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
          {chipCopy.promptText}
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
                {chipCopy.explainability}
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
          aria-label={`${chipCopy.primaryAction} - this is helpful`}
        >
          {chipCopy.primaryAction}
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