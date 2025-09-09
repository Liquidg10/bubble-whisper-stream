import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, Calendar } from 'lucide-react';
import { ProgressiveOnboardingState, progressiveOnboardingService, MILESTONES } from '@/services/progressiveOnboardingService';

interface FeatureGateProps {
  children: React.ReactNode;
  feature: string;
  onboardingState: ProgressiveOnboardingState;
  fallback?: React.ReactNode;
  className?: string;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  children,
  feature,
  onboardingState,
  fallback,
  className
}) => {
  const isUnlocked = progressiveOnboardingService.isFeatureUnlocked(onboardingState, feature);
  
  if (isUnlocked) {
    return <>{children}</>;
  }

  // Find which milestone unlocks this feature
  const unlockingMilestone = MILESTONES.find(m => m.features.includes(feature));
  
  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <Card className={`border-dashed border-muted-foreground/30 ${className}`}>
      <CardContent className="p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          
          <div className="space-y-1">
            <h3 className="font-medium text-sm">
              {unlockingMilestone ? `Available Day ${unlockingMilestone.day}` : 'Coming soon'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              {unlockingMilestone 
                ? `This feature unlocks on day ${unlockingMilestone.day} of your learning journey`
                : 'This feature will be available as you progress'
              }
            </p>
          </div>

          {unlockingMilestone && (
            <Badge variant="outline" className="text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              Day {unlockingMilestone.day}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};