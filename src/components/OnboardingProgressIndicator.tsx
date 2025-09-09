import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Circle, Clock, Settings } from 'lucide-react';
import { ProgressiveOnboardingState, MILESTONES, progressiveOnboardingService } from '@/services/progressiveOnboardingService';

interface OnboardingProgressIndicatorProps {
  onboardingState: ProgressiveOnboardingState;
  onSkipProgression: () => void;
  onRewindToDay: (day: number) => void;
  className?: string;
}

export const OnboardingProgressIndicator: React.FC<OnboardingProgressIndicatorProps> = ({
  onboardingState,
  onSkipProgression,
  onRewindToDay,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!onboardingState.isEnabled || onboardingState.hasSkippedProgression) {
    return null;
  }

  const currentDay = progressiveOnboardingService.getCurrentDay(onboardingState);
  const progress = progressiveOnboardingService.getProgressPercentage(onboardingState);
  
  const getMilestoneStatus = (day: number) => {
    if (onboardingState.completedMilestones.includes(day)) return 'completed';
    if (day <= currentDay) return 'available';
    return 'locked';
  };

  return (
    <div className={className}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {MILESTONES.map(milestone => {
                  const status = getMilestoneStatus(milestone.day);
                  return (
                    <div
                      key={milestone.day}
                      className={`w-2 h-2 rounded-full ${
                        status === 'completed' 
                          ? 'bg-primary' 
                          : status === 'available'
                          ? 'bg-muted-foreground/60'
                          : 'bg-muted-foreground/20'
                      }`}
                    />
                  );
                })}
              </div>
              <span className="text-xs">Day {currentDay}/7</span>
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-80 p-4" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Learning Progress</h3>
              <Badge variant="outline" className="text-xs">
                {Math.round(progress)}% complete
              </Badge>
            </div>

            <Progress value={progress} className="h-2" />

            <div className="space-y-3">
              {MILESTONES.map(milestone => {
                const status = getMilestoneStatus(milestone.day);
                
                return (
                  <div
                    key={milestone.day}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className="mt-0.5">
                      {status === 'completed' && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                      {status === 'available' && (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                      {status === 'locked' && (
                        <Circle className="h-4 w-4 text-muted-foreground/40" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">Day {milestone.day}</span>
                        {status === 'available' && milestone.day === currentDay && (
                          <Badge variant="secondary" className="text-xs">Current</Badge>
                        )}
                      </div>
                      <p className={`text-xs mt-1 ${
                        status === 'locked' ? 'text-muted-foreground/60' : 'text-muted-foreground'
                      }`}>
                        {milestone.title}
                      </p>
                      
                      {status === 'completed' && milestone.day < 7 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRewindToDay(milestone.day)}
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground mt-1"
                        >
                          Revisit
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={onSkipProgression}
                className="w-full text-xs flex items-center gap-2"
              >
                <Settings className="h-3 w-3" />
                Enable all features now
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};