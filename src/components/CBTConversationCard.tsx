/**
 * CBT UI Components - Renders CBT actions in conversation flow
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Heart, MessageCircle, Phone } from 'lucide-react';
import type { CBTAction } from '@/ai/cbt/types';
import { formatActionForDisplay } from '@/ai/cbt/acts';

interface CBTActionCardProps {
  action: CBTAction;
  onEngagement?: (engaged: boolean, response?: string) => void;
  onHelpfulnessRating?: (rating: number) => void;
  className?: string;
}

export function CBTActionCard({ 
  action, 
  onEngagement, 
  onHelpfulnessRating,
  className = '' 
}: CBTActionCardProps) {
  const [showExpanded, setShowExpanded] = React.useState(false);
  const [userResponse, setUserResponse] = React.useState('');
  const [hasEngaged, setHasEngaged] = React.useState(false);

  const formatted = formatActionForDisplay(action);

  const handleEngagement = (engaged: boolean) => {
    setHasEngaged(true);
    onEngagement?.(engaged, userResponse);
    
    if (engaged && action.type !== 'crisis_support') {
      setShowExpanded(true);
    }
  };

  const getActionIcon = () => {
    switch (action.type) {
      case 'crisis_support':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'question':
        return <MessageCircle className="h-4 w-4 text-primary" />;
      case 'ack':
        return <Heart className="h-4 w-4 text-secondary" />;
      default:
        return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionVariant = () => {
    switch (action.type) {
      case 'crisis_support':
        return 'destructive';
      case 'question':
        return 'default';
      case 'ack':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Card className={`p-4 border border-border/50 bg-muted/30 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          {getActionIcon()}
        </div>
        
        <div className="flex-1 space-y-3">
          {/* Main action text */}
          <div>
            <p className="text-sm font-medium text-foreground">
              {formatted.primary}
            </p>
            
            {formatted.secondary && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatted.secondary}
              </p>
            )}
          </div>

          {/* Crisis support resources */}
          {action.type === 'crisis_support' && action.data?.resources && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Immediate Support:</p>
              <div className="space-y-1">
                {action.data.resources.map((resource, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <Phone className="h-3 w-3" />
                    <span>{resource}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {formatted.interactive && !hasEngaged && (
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant={getActionVariant()}
                onClick={() => handleEngagement(true)}
              >
                {action.type === 'crisis_support' ? 'Get Support' : 'Explore This'}
              </Button>
              
              {action.type !== 'crisis_support' && (
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => handleEngagement(false)}
                >
                  Not Now
                </Button>
              )}
            </div>
          )}

          {/* Expanded content */}
          {showExpanded && action.data && (
            <div className="space-y-3 pt-3 border-t border-border/30">
              {/* Reframes */}
              {action.data.reframes && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">
                    Another way to think about this:
                  </p>
                  <div className="space-y-1">
                    {action.data.reframes.map((reframe, index) => (
                      <p key={index} className="text-xs text-muted-foreground italic">
                        "{reframe}"
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow-up questions */}
              {action.data.followUpQuestions && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">
                    Questions to consider:
                  </p>
                  <div className="space-y-1">
                    {action.data.followUpQuestions.map((question, index) => (
                      <p key={index} className="text-xs text-muted-foreground">
                        • {question}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Distortion type badge */}
              {action.data.distortionType && (
                <div>
                  <Badge variant="outline" className="text-xs">
                    {action.data.distortionType.replace(/_/g, ' ')}
                  </Badge>
                </div>
              )}

              {/* Helpfulness rating */}
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Was this helpful?
                </p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Button
                      key={rating}
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-xs"
                      onClick={() => onHelpfulnessRating?.(rating)}
                    >
                      {rating}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

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
  
  if (!cbtGuidance?.shouldShow || !cbtGuidance.action) {
    return <>{children}</>;
  }

  // PROMPT 4: Use CBTChip for chip actions, CBTActionCard for others
  if (cbtGuidance.action.type === 'chip') {
    const { CBTChipWrapper } = require('./CBTChip');
    
    return (
      <div className="space-y-4">
        {children}
        
        <CBTChipWrapper
          action={cbtGuidance.action}
          onEngagement={(engaged) => {
            if (cbtGuidance.traceId) {
              onCBTEngagement?.(cbtGuidance.traceId, engaged);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {children}
      
      <CBTActionCard
        action={cbtGuidance.action}
        onEngagement={(engaged, response) => {
          if (cbtGuidance.traceId) {
            onCBTEngagement?.(cbtGuidance.traceId, engaged, response);
          }
        }}
        onHelpfulnessRating={(rating) => {
          if (cbtGuidance.traceId) {
            onHelpfulnessRating?.(cbtGuidance.traceId, rating);
          }
        }}
      />
    </div>
  );
}