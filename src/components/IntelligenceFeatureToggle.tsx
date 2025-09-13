/**
 * Enhanced Intelligence Feature Toggle with "Because..." explanations
 * P16 - Privacy & Consent UX Enhancement
 * Provides granular control over individual intelligence features
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { BecauseExplanation } from './privacy/BecauseExplanation';
import { Brain, Shield, Eye } from 'lucide-react';

interface IntelligenceFeature {
  id: string;
  name: string;
  description: string;
  layer: 'surface' | 'context' | 'deep';
  enabled: boolean;
  drivers: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

interface IntelligenceFeatureToggleProps {
  features: IntelligenceFeature[];
  onToggle: (featureId: string, enabled: boolean) => void;
  className?: string;
}

export const IntelligenceFeatureToggle: React.FC<IntelligenceFeatureToggleProps> = ({
  features,
  onToggle,
  className,
}) => {
  const getLayerIcon = (layer: string) => {
    switch (layer) {
      case 'surface': return <Eye className="h-4 w-4" />;
      case 'context': return <Brain className="h-4 w-4" />;
      case 'deep': return <Shield className="h-4 w-4" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  const getLayerColor = (layer: string) => {
    switch (layer) {
      case 'surface': return 'bg-green-100 text-green-800 border-green-200';
      case 'context': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'deep': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-50 text-green-700';
      case 'medium': return 'bg-yellow-50 text-yellow-700';
      case 'high': return 'bg-red-50 text-red-700';
      default: return 'bg-gray-50 text-gray-700';
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Intelligence Features
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {features.map((feature) => (
          <div key={feature.id} className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  {getLayerIcon(feature.layer)}
                  <h4 className="font-medium">{feature.name}</h4>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getLayerColor(feature.layer)}`}
                  >
                    {feature.layer}
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getRiskColor(feature.riskLevel)}`}
                  >
                    {feature.riskLevel} risk
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
              <Switch
                checked={feature.enabled}
                onCheckedChange={(enabled) => onToggle(feature.id, enabled)}
                className="ml-4"
              />
            </div>
            
            {feature.enabled && feature.drivers.length > 0 && (
              <BecauseExplanation 
                drivers={feature.drivers}
                compact={true}
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};