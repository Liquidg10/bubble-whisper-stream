/**
 * Cast Decision Display Component
 * Shows AI decisions and suggestions with privacy controls and explanations
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, Calendar, Lightbulb, Activity, Heart, Zap, Info } from 'lucide-react';
import { PrivacyWatermark } from '@/components/privacy/PrivacyWatermark';
import type { DecisionTrace } from '@/services/decisionTraceService';

interface CastDecisionDisplayProps {
  decisions: DecisionTrace[];
  onAccept?: (decisionId: string) => void;
  onReject?: (decisionId: string) => void;
  onShowDetails?: (decision: DecisionTrace) => void;
  compact?: boolean;
}

export const CastDecisionDisplay: React.FC<CastDecisionDisplayProps> = ({
  decisions,
  onAccept,
  onReject,
  onShowDetails,
  compact = false
}) => {
  const getFeatureIcon = (feature: string) => {
    switch (feature) {
      case 'calendar': return Calendar;
      case 'behavioral': return Brain;
      case 'mood': return Heart;
      case 'energy': return Zap;
      case 'planning': return Lightbulb;
      default: return Activity;
    }
  };

  const getCastColor = (castMember?: string) => {
    switch (castMember) {
      case 'Behavioral Scientist': return 'from-blue-500/10 to-blue-600/10 border-blue-400/20';
      case 'Energy Coach': return 'from-emerald-500/10 to-emerald-600/10 border-emerald-400/20';
      case 'Planning Assistant': return 'from-purple-500/10 to-purple-600/10 border-purple-400/20';
      case 'Mood Companion': return 'from-pink-500/10 to-pink-600/10 border-pink-400/20';
      default: return 'from-gray-500/10 to-gray-600/10 border-gray-400/20';
    }
  };

  if (decisions.length === 0) return null;

  return (
    <div className="space-y-2">
      {decisions.slice(0, compact ? 2 : 5).map((decision) => {
        const FeatureIcon = getFeatureIcon(decision.feature);
        
        return (
          <Card 
            key={decision.id} 
            className={`p-3 bg-gradient-to-r ${getCastColor(decision.castMember)} border transition-all hover:shadow-sm`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <FeatureIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {decision.castMember && (
                      <Badge variant="outline" className="text-xs">
                        {decision.castMember}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground capitalize">
                      {decision.finalConfidence > 0.8 ? 'High confidence' : 
                       decision.finalConfidence > 0.6 ? 'Medium confidence' : 
                       'Low confidence'}
                    </span>
                  </div>
                  
                  <p className="text-sm mb-2">{decision.action}</p>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Because:</span>
                    <span className="text-xs">{decision.becauseText}</span>
                    <PrivacyWatermark layer={decision.privacyWatermark || 'surface'} />
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1 ml-2">
                {onShowDetails && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onShowDetails(decision)}
                    className="h-6 w-6 p-0"
                  >
                    <Info className="h-3 w-3" />
                  </Button>
                )}
                
                {decision.finalConfidence > 0.6 && onAccept && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onAccept(decision.id)}
                    className="h-6 w-6 p-0 text-emerald-400 hover:text-emerald-300"
                  >
                    ✓
                  </Button>
                )}
                
                {onReject && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onReject(decision.id)}
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                  >
                    ×
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
      
      {decisions.length > (compact ? 2 : 5) && (
        <div className="text-center">
          <span className="text-xs text-muted-foreground">
            +{decisions.length - (compact ? 2 : 5)} more insights
          </span>
        </div>
      )}
    </div>
  );
};