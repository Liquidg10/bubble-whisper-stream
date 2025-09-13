import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Brain,
  Clock,
  Target,
  Lightbulb,
  X,
  Info,
  Calendar,
  BarChart3
} from 'lucide-react';
import { useCognitiveLoadGovernor } from '@/hooks/useCognitiveLoadGovernor';
import { motion, AnimatePresence } from 'framer-motion';

interface CBTNudgeThrottledProps {
  children?: React.ReactNode;
  domain: 'cbt' | 'planning' | 'autowrite' | 'general';
  nudgeType: 'suggestion' | 'insight' | 'prompt' | 'reminder';
  urgency: 'low' | 'medium' | 'high';
  content: {
    title: string;
    description: string;
    action?: string;
    reason?: string;
  };
  onAccept?: () => void;
  onDismiss?: () => void;
  onOptOut?: () => void;
  className?: string;
}

/**
 * CBT Nudge component with cognitive load throttling
 * Integrates with useCognitiveLoadGovernor to prevent over-nudging
 */
export function CBTNudgeThrottled({
  children,
  domain,
  nudgeType,
  urgency,
  content,
  onAccept,
  onDismiss,
  onOptOut,
  className
}: CBTNudgeThrottledProps) {
  const governor = useCognitiveLoadGovernor();
  const [canShow, setCanShow] = useState(false);
  const [budgetResult, setBudgetResult] = useState<any>(null);
  
  const [isVisible, setIsVisible] = useState(false);
  const [showRecap, setShowRecap] = useState(false);

  useEffect(() => {
    // Check if nudge can be shown and record the attempt
    const checkNudge = async () => {
      const context = { 
        domain, 
        nudgeType, 
        urgency, 
        userId: 'current-user', 
        content: content.title 
      };
      const result = await governor.checkNudgeAllowed(context);
      
      setBudgetResult(result);
      setCanShow(result.allowed);
      setIsVisible(result.allowed);
      
      if (result.allowed) {
        await governor.recordNudge(context, 'shown');
      }
      
      // If blocked, show recap for high urgency nudges
      if (!result.allowed && urgency === 'high' && result.reason) {
        setShowRecap(true);
      }
    };

    checkNudge();
  }, [domain, nudgeType, urgency, governor]);

  const handleAccept = async () => {
    const context = { domain, nudgeType, urgency, userId: 'current-user', content: content.title };
    await governor.recordNudge(context, 'accepted');
    onAccept?.();
    setIsVisible(false);
  };

  const handleDismiss = async () => {
    const context = { domain, nudgeType, urgency, userId: 'current-user', content: content.title };
    await governor.recordNudge(context, 'dismissed');
    onDismiss?.();
    setIsVisible(false);
  };

  const handleOptOut = async () => {
    const context = { domain, nudgeType, urgency, userId: 'current-user', content: content.title };
    await governor.recordNudge(context, 'blocked');
    onOptOut?.();
    setIsVisible(false);
  };

  const getUrgencyColor = () => {
    switch (urgency) {
      case 'high': return 'border-red-200 bg-red-50';
      case 'medium': return 'border-orange-200 bg-orange-50';
      case 'low': return 'border-blue-200 bg-blue-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getDomainIcon = () => {
    switch (domain) {
      case 'cbt': return Brain;
      case 'planning': return Target;
      case 'autowrite': return Calendar;
      default: return Lightbulb;
    }
  };

  // If nudge is blocked, show recap for high urgency
  if (!isVisible && showRecap && urgency === 'high') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="w-full"
        >
          <Alert className="border-orange-200 bg-orange-50">
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-orange-800">
                    Suggestion Available (Delayed)
                  </p>
                  <p className="text-sm text-orange-700">
                    {content.title}
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    {budgetResult?.reason || 'Too many suggestions recently. Will show later.'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowRecap(false)}
                  className="h-6 w-6 p-0 text-orange-600 hover:text-orange-800"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              
              <div className="flex items-center gap-2 text-xs text-orange-600">
                <Clock className="h-3 w-3" />
                <span>
                  Next available: {budgetResult?.nextAvailable ? 
                    new Date(budgetResult.nextAvailable).toLocaleTimeString() : 
                    'Soon'
                  }
                </span>
              </div>
            </AlertDescription>
          </Alert>
        </motion.div>
      </AnimatePresence>
    );
  }

  // If nudge is blocked and not high urgency, don't show anything
  if (!isVisible) {
    return children || null;
  }

  const DomainIcon = getDomainIcon();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className={className}
      >
        <Card className={`border ${getUrgencyColor()}`}>
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-white/50">
                    <DomainIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{content.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs h-5">
                        {nudgeType}
                      </Badge>
                      <Badge 
                        variant={urgency === 'high' ? 'destructive' : 'secondary'} 
                        className="text-xs h-5"
                      >
                        {urgency}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  className="h-6 w-6 p-0 opacity-60 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {/* Content */}
              <div className="text-sm text-gray-700">
                <p>{content.description}</p>
                {content.reason && (
                  <p className="text-xs text-gray-600 mt-2">
                    <strong>Because:</strong> {content.reason}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {content.action && onAccept && (
                    <Button 
                      size="sm" 
                      onClick={handleAccept}
                      className="h-8"
                    >
                      {content.action}
                    </Button>
                  )}
                  
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleDismiss}
                    className="h-8"
                  >
                    Maybe Later
                  </Button>
                </div>

                {/* Budget indicator */}
                {budgetResult && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <BarChart3 className="h-3 w-3" />
                    <span>
                      {budgetResult.remaining}/{budgetResult.budget} left
                    </span>
                  </div>
                )}
              </div>

              {/* Opt-out */}
              <div className="pt-2 border-t border-white/50">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleOptOut}
                  className="h-6 text-xs text-gray-500 hover:text-gray-700"
                >
                  Less of this type
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Hook to integrate any component with cognitive load throttling
 */
export function useThrottledNudge({
  domain,
  nudgeType,
  urgency
}: {
  domain: 'cbt' | 'planning' | 'autowrite' | 'general';
  nudgeType: 'suggestion' | 'insight' | 'prompt' | 'reminder';
  urgency: 'low' | 'medium' | 'high';
}) {
  const governor = useCognitiveLoadGovernor();
  const [canShow, setCanShow] = useState(false);
  const [budgetResult, setBudgetResult] = useState<any>(null);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (!hasChecked) {
      const checkNudge = async () => {
        const context = { domain, nudgeType, urgency, userId: 'current-user', content: 'nudge' };
        const result = await governor.checkNudgeAllowed(context);
        setBudgetResult(result);
        setCanShow(result.allowed);
        setHasChecked(true);
      };
      checkNudge();
    }
  }, [hasChecked, domain, nudgeType, urgency, governor]);

  const recordOutcome = async (outcome: 'accepted' | 'dismissed' | 'blocked') => {
    const context = { domain, nudgeType, urgency, userId: 'current-user', content: 'nudge' };
    await governor.recordNudge(context, outcome);
  };

  return {
    canShow,
    budgetResult,
    recordOutcome,
    shouldShow: hasChecked && canShow
  };
}