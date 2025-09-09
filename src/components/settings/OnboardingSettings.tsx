import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  GraduationCap, 
  RotateCcw, 
  Settings, 
  CheckCircle,
  Clock,
  Info
} from 'lucide-react';
import { useProgressiveOnboarding } from '@/providers/ProgressiveOnboardingProvider';
import { MILESTONES, progressiveOnboardingService } from '@/services/progressiveOnboardingService';

export const OnboardingSettings: React.FC = () => {
  const {
    state,
    skipProgression,
    rewindToDay,
    isFeatureUnlocked
  } = useProgressiveOnboarding();

  const currentDay = progressiveOnboardingService.getCurrentDay(state);
  const progress = progressiveOnboardingService.getProgressPercentage(state);

  const toggleOnboarding = () => {
    if (state.hasSkippedProgression) {
      // Restart onboarding from day 1
      rewindToDay(1);
    } else {
      // Skip progression
      skipProgression();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Progressive Learning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {state.hasSkippedProgression ? 'All features enabled' : '7-day guided journey'}
              </p>
              <p className="text-xs text-muted-foreground">
                {state.hasSkippedProgression 
                  ? 'You can restart the guided experience anytime'
                  : 'Gradually unlocks features to reduce overwhelm'
                }
              </p>
            </div>
            <Switch
              checked={!state.hasSkippedProgression}
              onCheckedChange={toggleOnboarding}
            />
          </div>

          {!state.hasSkippedProgression && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Progress</span>
                <Badge variant="outline">
                  Day {currentDay}/7 • {Math.round(progress)}%
                </Badge>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Milestone Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {MILESTONES.map(milestone => {
              const isCompleted = state.completedMilestones.includes(milestone.day);
              const isAvailable = milestone.day <= currentDay;
              const isUnlocked = state.hasSkippedProgression || isCompleted || isAvailable;

              return (
                <div
                  key={milestone.day}
                  className={`p-3 rounded-lg border transition-colors ${
                    isCompleted 
                      ? 'bg-primary/5 border-primary/20' 
                      : isAvailable
                      ? 'bg-muted/30 border-muted-foreground/20'
                      : 'bg-muted/10 border-muted-foreground/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isCompleted && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                      {!isCompleted && isAvailable && (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                      {!isAvailable && (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">Day {milestone.day}</span>
                        {isCompleted && (
                          <Badge variant="secondary" className="text-xs">Complete</Badge>
                        )}
                        {!isCompleted && isAvailable && (
                          <Badge variant="outline" className="text-xs">Available</Badge>
                        )}
                      </div>
                      
                      <h4 className={`text-sm mb-1 ${
                        isUnlocked ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {milestone.title}
                      </h4>
                      
                      <p className={`text-xs ${
                        isUnlocked ? 'text-muted-foreground' : 'text-muted-foreground/60'
                      }`}>
                        {milestone.description}
                      </p>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {milestone.features.map(feature => (
                          <Badge
                            key={feature}
                            variant="outline"
                            className={`text-xs ${
                              isFeatureUnlocked(feature)
                                ? 'bg-primary/10 border-primary/30'
                                : 'opacity-50'
                            }`}
                          >
                            {feature.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>

                      {isCompleted && milestone.day < 7 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => rewindToDay(milestone.day)}
                          className="h-7 px-2 text-xs mt-2 flex items-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Revisit this milestone
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!state.hasSkippedProgression && (
            <div className="mt-4 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Progressive Learning</p>
                  <p>Features unlock gradually to help you learn without overwhelm. You can skip ahead anytime or restart the journey later.</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};