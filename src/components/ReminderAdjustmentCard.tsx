import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Clock, Pause, Volume, VolumeX } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

interface ReminderAdjustmentCardProps {
  reminderId: string;
  onClose?: () => void;
}

export const ReminderAdjustmentCard: React.FC<ReminderAdjustmentCardProps> = ({
  reminderId,
  onClose
}) => {
  const { reminders, updateReminder, settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  
  const reminder = reminders.find(r => r.id === reminderId);
  
  if (!reminder) return null;

  const handleFrequencyChange = (value: number[]) => {
    const newInterval = value[0] * 60 * 1000; // Convert minutes to ms
    updateReminder({
      ...reminder,
      scheduledAt: Date.now() + newInterval
    });
    
    toast({
      title: "Reminder adjusted",
      description: `Will remind you in ${value[0]} minutes`
    });
  };

  const handleMuteFor24h = () => {
    updateSettings({
      ...settings,
      quietHours: {
        start: new Date().toTimeString().slice(0, 5),
        end: new Date(Date.now() + 24 * 60 * 60 * 1000).toTimeString().slice(0, 5)
      }
    });
    
    toast({
      title: "Muted for 24 hours",
      description: "All non-critical reminders are paused"
    });
    
    onClose?.();
  };

  const handlePauseReminder = () => {
    updateReminder({
      ...reminder,
      status: 'Dismissed'
    });
    
    toast({
      title: "Reminder paused",
      description: "This reminder won't bother you anymore today"
    });
    
    onClose?.();
  };

  const currentInterval = Math.round((reminder.scheduledAt - Date.now()) / (60 * 1000));

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5" />
          Adjust Reminders
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Next reminder in:</span>
            <Badge variant="outline">{Math.max(1, currentInterval)} min</Badge>
          </div>
          
          <Slider
            value={[Math.max(1, currentInterval)]}
            onValueChange={handleFrequencyChange}
            min={1}
            max={120}
            step={5}
            className="w-full"
          />
          
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1 min</span>
            <span>2 hours</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePauseReminder}
            className="flex-1"
          >
            <Pause className="h-4 w-4 mr-1" />
            Pause Today
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleMuteFor24h}
            className="flex-1"
          >
            <VolumeX className="h-4 w-4 mr-1" />
            Mute 24h
          </Button>
        </div>

        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="w-full"
          >
            Done
          </Button>
        )}
      </CardContent>
    </Card>
  );
};