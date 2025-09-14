/**
 * Intelligent Mood Ribbon for Timeline Integration
 * Displays mood data with "Because..." explanations and Cast insights
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { moodBehaviorEngine } from '@/services/moodBehaviorEngine';
import { PrivacyWatermark } from '@/components/privacy/PrivacyWatermark';
import type { MoodRibbon } from '@/services/moodBehaviorEngine';

interface IntelligentMoodRibbonProps {
  date: string;
  onShowDetails?: (ribbon: MoodRibbon) => void;
}

export const IntelligentMoodRibbon: React.FC<IntelligentMoodRibbonProps> = ({
  date,
  onShowDetails
}) => {
  const ribbons = moodBehaviorEngine.generateTimelineRibbons(
    new Date(date),
    new Date(date)
  );
  
  const ribbon = ribbons[0];
  if (!ribbon) return null;

  const getMoodColor = (mood: number) => {
    if (mood >= 0.7) return 'from-emerald-500/20 to-emerald-600/20 border-emerald-400/30';
    if (mood >= 0.5) return 'from-blue-500/20 to-blue-600/20 border-blue-400/30';
    if (mood >= 0.3) return 'from-amber-500/20 to-amber-600/20 border-amber-400/30';
    return 'from-red-500/20 to-red-600/20 border-red-400/30';
  };

  const getMoodTrend = (mood: number) => {
    if (mood >= 0.6) return { icon: TrendingUp, label: 'Positive', color: 'text-emerald-400' };
    if (mood >= 0.4) return { icon: TrendingUp, label: 'Stable', color: 'text-blue-400' };
    return { icon: TrendingDown, label: 'Needs Support', color: 'text-amber-400' };
  };

  const trend = getMoodTrend(ribbon.mood);
  const TrendIcon = trend.icon;

  const topDriver = ribbon.drivers?.[0];

  return (
    <Card className={`p-3 bg-gradient-to-r ${getMoodColor(ribbon.mood)} border transition-all hover:shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Daily Mood</span>
              <Badge variant="outline" className={`text-xs ${trend.color}`}>
                <TrendIcon className="h-3 w-3 mr-1" />
                {trend.label}
              </Badge>
            </div>
            
            {topDriver && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">Because:</span>
                <span className="text-xs">{topDriver.factor}</span>
                <PrivacyWatermark layer="context" />
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm font-medium">
              {Math.round(ribbon.mood * 100)}%
            </div>
            <div className="text-xs text-muted-foreground">
              Energy: {Math.round(ribbon.energy * 100)}%
            </div>
          </div>
          
          {onShowDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onShowDetails(ribbon)}
              className="h-6 w-6 p-0"
            >
              <Info className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};