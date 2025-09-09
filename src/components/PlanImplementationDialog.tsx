import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Calendar, Clock, MapPin, Bell } from 'lucide-react';
import { GeneratedPlan } from '@/services/planGenerationService';
import { planImplementationService, PlanImplementationOptions } from '@/services/planImplementationService';

interface PlanImplementationDialogProps {
  plan: GeneratedPlan | null;
  isOpen: boolean;
  onClose: () => void;
  onImplemented: () => void;
}

export const PlanImplementationDialog: React.FC<PlanImplementationDialogProps> = ({
  plan,
  isOpen,
  onClose,
  onImplemented
}) => {
  const [options, setOptions] = useState<PlanImplementationOptions>({
    createBubbles: true,
    createReminders: false,
    createCalendarEvents: false,
    startTime: new Date(),
    reminderOffset: 5
  });
  const [isImplementing, setIsImplementing] = useState(false);

  const handleImplement = async () => {
    if (!plan) return;

    setIsImplementing(true);
    try {
      await planImplementationService.implementPlan(plan, options);
      onImplemented();
      onClose();
    } catch (error) {
      console.error('Failed to implement plan:', error);
    } finally {
      setIsImplementing(false);
    }
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (!plan) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Implement Plan: {plan.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Plan Summary */}
          <div className="bg-muted p-4 rounded-lg">
            <h3 className="font-medium mb-2">Plan Overview</h3>
            <p className="text-sm text-muted-foreground mb-3">{plan.description}</p>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(plan.totalEstimatedMinutes)}
              </span>
              <span>{plan.steps.length} steps</span>
              <span className="text-primary">
                {Math.round(plan.personalizationConfidence * 100)}% personalized
              </span>
            </div>
          </div>

          {/* Implementation Options */}
          <div className="space-y-4">
            <h3 className="font-medium">How would you like to implement this plan?</h3>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="bubbles"
                  checked={options.createBubbles}
                  onCheckedChange={(checked) => 
                    setOptions(prev => ({ ...prev, createBubbles: !!checked }))
                  }
                />
                <Label htmlFor="bubbles" className="flex items-center gap-2">
                  Create visual bubbles for each step
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="reminders"
                  checked={options.createReminders}
                  onCheckedChange={(checked) => 
                    setOptions(prev => ({ ...prev, createReminders: !!checked }))
                  }
                />
                <Label htmlFor="reminders" className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Set up reminders for important steps
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="calendar"
                  checked={options.createCalendarEvents}
                  onCheckedChange={(checked) => 
                    setOptions(prev => ({ ...prev, createCalendarEvents: !!checked }))
                  }
                />
                <Label htmlFor="calendar" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Add to calendar with time blocks
                </Label>
              </div>
            </div>

            {/* Start Time */}
            {(options.createReminders || options.createCalendarEvents) && (
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="datetime-local"
                  value={options.startTime?.toISOString().slice(0, 16)}
                  onChange={(e) => 
                    setOptions(prev => ({ 
                      ...prev, 
                      startTime: new Date(e.target.value) 
                    }))
                  }
                />
              </div>
            )}

            {/* Reminder Offset */}
            {options.createReminders && (
              <div className="space-y-3">
                <Label>Reminder timing: {options.reminderOffset} minutes before each step</Label>
                <Slider
                  value={[options.reminderOffset || 5]}
                  onValueChange={(value) => 
                    setOptions(prev => ({ ...prev, reminderOffset: value[0] }))
                  }
                  max={30}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Step Preview */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Steps to be created:</h4>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {plan.steps.map((step, index) => (
                <div key={step.id} className="text-sm p-2 bg-muted/50 rounded flex justify-between">
                  <span>{index + 1}. {step.title}</span>
                  <span className="text-muted-foreground">{formatTime(step.estimatedMinutes)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleImplement} 
            disabled={isImplementing}
            className="min-w-[120px]"
          >
            {isImplementing ? 'Implementing...' : 'Implement Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};