/**
 * P16 - Intelligence Feature Toggle Component
 * Individual toggle for each intelligence feature with "Because..." explanation
 */

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { BecauseExplanation } from './privacy/BecauseExplanation';
import { useBubbleStore } from '@/stores/bubbleStore';

interface IntelligenceFeatureToggleProps {
  feature: 'momentumDetection' | 'contextualNudges' | 'loadGovernor' | 'microCelebrations';
  title: string;
  description: string;
  explanation: string;
}

export function IntelligenceFeatureToggle({
  feature,
  title,
  description,
  explanation
}: IntelligenceFeatureToggleProps) {
  const { settings, updateSettings } = useBubbleStore();
  
  const isEnabled = settings.intelligenceEnabled && (settings as any)[feature] !== false;
  
  const handleToggle = (enabled: boolean) => {
    updateSettings({
      [feature]: enabled
    });
  };

  return (
    <Card className="border-muted/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">{title}</h4>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            
            <BecauseExplanation 
              drivers={[explanation]}
              compact={true}
            />
          </div>
          
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={!settings.intelligenceEnabled}
            className="ml-3"
          />
        </div>
      </CardContent>
    </Card>
  );
}