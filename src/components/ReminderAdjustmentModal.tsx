import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Clock, Volume, VolumeX, Pause } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

interface ReminderAdjustmentModalProps {
  reminderId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ReminderAdjustmentModal: React.FC<ReminderAdjustmentModalProps> = ({
  reminderId,
  isOpen,
  onClose
}) => {
  const { reminders, updateReminder, updateSettings, settings } = useBubbleStore();
  const [frequency, setFrequency] = useState([4]); // hours
  const { toast } = useToast();

  const reminder = reminders.find(r => r.id === reminderId);

  const handleFrequencyChange = (newFrequency: number[]) => {
    setFrequency(newFrequency);
    if (reminder) {
      // Update reminder schedule
      const newScheduleTime = Date.now() + (newFrequency[0] * 60 * 60 * 1000);
      // Update reminder schedule
      const updatedReminder = { 
        ...reminder,
        scheduledAt: newScheduleTime,
        level: 1 as const
      };
      updateReminder(updatedReminder);
      
      toast({
        title: "Reminder adjusted",
        description: `Next reminder in ${newFrequency[0]} hour${newFrequency[0] !== 1 ? 's' : ''}`
      });
    }
  };

  const handleMuteFor24h = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    updateSettings({
      quietHours: {
        start: now.toTimeString().slice(0, 5),
        end: tomorrow.toTimeString().slice(0, 5)
      }
    });
    
    toast({
      title: "Reminders muted",
      description: "All non-critical reminders paused for 24 hours"
    });
    
    onClose();
  };

  const handlePauseReminder = () => {
    if (reminder) {
      updateReminder({ ...reminder, status: 'Dismissed' });
      toast({
        title: "Reminder paused",
        description: "This reminder won't appear again today"
      });
      onClose();
    }
  };

  if (!reminder) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Adjust Reminders
          </DialogTitle>
          <DialogDescription>
            Change how often you receive reminders or take a break
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Frequency Adjustment */}
          <div className="space-y-3">
            <Label>Reminder Frequency</Label>
            <div className="px-3">
              <Slider
                value={frequency}
                onValueChange={setFrequency}
                max={24}
                min={1}
                step={1}
                className="w-full"
              />
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Every hour</span>
              <span className="font-medium">
                Every {frequency[0]} hour{frequency[0] !== 1 ? 's' : ''}
              </span>
              <span>Daily</span>
            </div>
            <Button
              onClick={() => handleFrequencyChange(frequency)}
              className="w-full"
              variant="outline"
            >
              Apply New Schedule
            </Button>
          </div>

          {/* Quick Actions */}
          <div className="space-y-3">
            <Label>Quick Actions</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={handleMuteFor24h}
                className="h-auto p-3 flex flex-col items-center gap-2"
              >
                <VolumeX className="h-4 w-4" />
                <span className="text-xs">Mute 24h</span>
              </Button>
              <Button
                variant="outline"
                onClick={handlePauseReminder}
                className="h-auto p-3 flex flex-col items-center gap-2"
              >
                <Pause className="h-4 w-4" />
                <span className="text-xs">Pause This</span>
              </Button>
            </div>
          </div>

          {/* Because Explanation */}
          <div className="p-3 bg-muted rounded-lg">
            <Badge variant="secondary" className="mb-2">
              Because...
            </Badge>
            <p className="text-sm text-muted-foreground">
              You've snoozed similar reminders twice this week, so we're offering gentler options.
            </p>
          </div>

          {/* Done Button */}
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};