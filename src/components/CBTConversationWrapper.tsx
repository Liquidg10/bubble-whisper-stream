/**
 * CBT Conversation Wrapper Component
 * PROMPT 7: Renders CBT actions within conversation flow
 */

import React, { Suspense, lazy } from 'react';
import type { CBTAction } from '@/ai/cbt/types';

// Lazy load CBT components to avoid bundle bloat
const CBTChipWrapper = lazy(() => import('./CBTChip').then(module => ({ default: module.CBTChip })));
const CBTActionCard = lazy(() => import('./CBTConversationCard').then(module => ({ default: module.CBTActionCard })));

interface CBTConversationWrapperProps {
  children: React.ReactNode;
  cbtGuidance?: {
    shouldShow: boolean;
    action?: CBTAction;
    traceId?: string;
  };
  onCBTEngagement?: (traceId: string, engaged: boolean, response?: string) => void;
  onHelpfulnessRating?: (traceId: string, rating: number) => void;
}

export function CBTConversationWrapper({
  children,
  cbtGuidance,
  onCBTEngagement,
  onHelpfulnessRating
}: CBTConversationWrapperProps) {
  
  // Don't render CBT UI if not needed
  if (!cbtGuidance?.shouldShow || !cbtGuidance.action) {
    return <>{children}</>;
  }

  const handleEngagement = (engaged: boolean, response?: string) => {
    if (cbtGuidance.traceId && onCBTEngagement) {
      onCBTEngagement(cbtGuidance.traceId, engaged, response);
    }
  };

  const handleHelpfulness = (rating: number) => {
    if (cbtGuidance.traceId && onHelpfulnessRating) {
      onHelpfulnessRating(cbtGuidance.traceId, rating);
    }
  };

  return (
    <div className="space-y-4">
      {children}
      
      <Suspense fallback={<div className="animate-pulse h-16 bg-muted rounded-md" />}>
        {cbtGuidance.action.type === 'chip' ? (
          <CBTChipWrapper
            action={cbtGuidance.action}
            onEngagement={handleEngagement}
          />
        ) : (
          <CBTActionCard
            action={cbtGuidance.action}
            onEngagement={handleEngagement}
            onHelpfulnessRating={handleHelpfulness}
            className="border-l-4 border-l-primary/20 bg-primary/5"
          />
        )}
      </Suspense>
    </div>
  );
}