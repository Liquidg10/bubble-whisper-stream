import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Clock, Bell } from 'lucide-react';
import { Reminder } from '@/types/bubble';
import { useBubbleStore } from '@/stores/bubbleStore';
import { toast } from 'sonner';

interface ReminderCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultLocation?: string;
  defaultTitle?: string;
}

export const ReminderCreationModal: React.FC<ReminderCreationModalProps> = ({
  isOpen,
  onClose,
  defaultLocation,
  defaultTitle
}) => {
  const [title, setTitle] = useState(defaultTitle || '');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'time' | 'location'>('location');
  const [location, setLocation] = useState(defaultLocation || '');
  const [radius, setRadius] = useState('100');
  const [time, setTime] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { addReminder } = useBubbleStore();

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Please enter a reminder title');
      return;
    }

    if (type === 'location' && !location.trim()) {
      toast.error('Please enter a location');
      return;
    }

    if (type === 'time' && !time) {
      toast.error('Please select a time');
      return;
    }

    setIsLoading(true);

    try {
      const reminder: Reminder = {
        id: crypto.randomUUID(),
        bubbleId: crypto.randomUUID(), // Link to a bubble
        scheduledAt: type === 'time' ? new Date(time).getTime() : Date.now(),
        status: 'Active',
        level: 2,
        snoozes: []
      };

      await addReminder(reminder);
      toast.success('Reminder created successfully');
      onClose();
    } catch (error) {
      console.error('Failed to create reminder:', error);
      toast.error('Failed to create reminder');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setTitle(defaultTitle || '');
    setDescription('');
    setLocation(defaultLocation || '');
    setRadius('100');
    setTime('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Create Reminder
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What should I remind you about?"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any additional details..."
              rows={2}
              disabled={isLoading}
            />
          </div>

          <div>
            <Label htmlFor="type">Reminder Type</Label>
            <Select value={type} onValueChange={(value: 'time' | 'location') => setType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="location">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location-based
                  </div>
                </SelectItem>
                <SelectItem value="time">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Time-based
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === 'location' && (
            <>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Enter location or address"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="radius">Alert Radius (meters)</Label>
                <Select value={radius} onValueChange={setRadius}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50m (very close)</SelectItem>
                    <SelectItem value="100">100m (close)</SelectItem>
                    <SelectItem value="200">200m (nearby)</SelectItem>
                    <SelectItem value="500">500m (in area)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {type === 'time' && (
            <div>
              <Label htmlFor="time">Date & Time</Label>
              <Input
                id="time"
                type="datetime-local"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={isLoading}
              />
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={handleClose} disabled={isLoading} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading} className="flex-1">
              Create Reminder
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};