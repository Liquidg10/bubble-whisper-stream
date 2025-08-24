import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  Settings,
  RefreshCw,
  Plus
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface CalendarAccount {
  id: string;
  name: string;
  type: 'google' | 'outlook' | 'caldav';
  connected: boolean;
  email?: string;
}

export function CalendarIntegrationPlugin() {
  const { addBubble, addReminder, settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  
  const [isEnabled, setIsEnabled] = useState(settings.calendarIntegrationEnabled || false);
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncFrequency, setSyncFrequency] = useState(15); // minutes

  useEffect(() => {
    loadCalendarAccounts();
    if (isEnabled) {
      loadUpcomingEvents();
    }
  }, [isEnabled]);

  const loadCalendarAccounts = async () => {
    // Load connected calendar accounts from local storage
    const savedAccounts = localStorage.getItem('calendar-accounts');
    if (savedAccounts) {
      setAccounts(JSON.parse(savedAccounts));
    }
  };

  const loadUpcomingEvents = async () => {
    setIsLoading(true);
    try {
      // In a real implementation, this would sync with actual calendar APIs
      const mockEvents: CalendarEvent[] = [
        {
          id: '1',
          title: 'Team Meeting',
          start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          description: 'Weekly team sync',
          location: 'Conference Room A'
        },
        {
          id: '2', 
          title: 'Doctor Appointment',
          start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
          location: 'Medical Center'
        }
      ];
      setEvents(mockEvents);
    } catch (error) {
      console.error('Failed to load calendar events:', error);
      toast({
        title: "Calendar Sync Failed",
        description: "Unable to sync calendar events. Please check your connection.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const connectGoogleCalendar = async () => {
    setIsConnecting(true);
    try {
      // In a real implementation, this would initiate OAuth flow
      const newAccount: CalendarAccount = {
        id: crypto.randomUUID(),
        name: 'Personal Calendar',
        type: 'google',
        connected: true,
        email: 'user@gmail.com'
      };
      
      const updatedAccounts = [...accounts, newAccount];
      setAccounts(updatedAccounts);
      localStorage.setItem('calendar-accounts', JSON.stringify(updatedAccounts));
      
      toast({
        title: "Calendar Connected",
        description: "Google Calendar has been successfully connected.",
      });
    } catch (error) {
      console.error('Failed to connect calendar:', error);
      toast({
        title: "Connection Failed",
        description: "Unable to connect to Google Calendar. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const createBubbleFromEvent = async (event: CalendarEvent) => {
    const bubbleId = crypto.randomUUID();
    const bubble = {
      id: bubbleId,
      content: `📅 ${event.title}\n\n${event.description || ''}\n📍 ${event.location || 'No location'}`,
      type: 'ReminderNote' as const,
      tags: [{ id: 'calendar', name: 'calendar', color: '#3b82f6' }, { id: 'event', name: 'event', color: '#10b981' }],
      x: Math.random() * 400,
      y: Math.random() * 400,
      size: 50,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completed: false
    };
    
    await addBubble(bubble);
    
    // Create reminder 15 minutes before event
    const eventStart = new Date(event.start).getTime();
    const reminderTime = eventStart - (15 * 60 * 1000);
    
    if (reminderTime > Date.now()) {
      const reminder = {
        id: crypto.randomUUID(),
        bubbleId: bubbleId,
        title: `Upcoming: ${event.title}`,
        description: `Event starts in 15 minutes at ${event.location || 'scheduled location'}`,
        scheduledFor: reminderTime,
        scheduledAt: reminderTime,
        level: 2 as 1 | 2 | 3,
        status: 'Active' as const,
        createdAt: Date.now(),
        snoozes: []
      };
      
      await addReminder(reminder);
    }
    
    toast({
      title: "Event Added",
      description: `Created bubble and reminder for "${event.title}"`,
    });
  };

  const togglePlugin = async (enabled: boolean) => {
    setIsEnabled(enabled);
    await updateSettings({ calendarIntegrationEnabled: enabled });
    
    if (enabled) {
      loadUpcomingEvents();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendar Integration
            <Badge variant="secondary">Core Plugin</Badge>
          </CardTitle>
          <Switch
            checked={isEnabled}
            onCheckedChange={togglePlugin}
          />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!isEnabled && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Enable calendar integration to automatically create bubbles and reminders from your calendar events.
            </AlertDescription>
          </Alert>
        )}
        
        {isEnabled && (
          <>
            {/* Account Management */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Connected Accounts</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={connectGoogleCalendar}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  Add Calendar
                </Button>
              </div>
              
              {accounts.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No calendar accounts connected. Add a calendar to start syncing events.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div key={account.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <div>
                          <div className="text-sm font-medium">{account.name}</div>
                          <div className="text-xs text-muted-foreground">{account.email}</div>
                        </div>
                      </div>
                      <Badge variant="outline">{account.type}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sync Settings */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Sync Frequency</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={syncFrequency}
                  onChange={(e) => setSyncFrequency(Number(e.target.value))}
                  min={5}
                  max={60}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>

            {/* Upcoming Events */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Upcoming Events</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadUpcomingEvents}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
              
              {events.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No upcoming events found in your calendar.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {events.slice(0, 3).map((event) => (
                    <div key={event.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{event.title}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(event.start).toLocaleString()}
                          {event.location && (
                            <>
                              <span>•</span>
                              <span>{event.location}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createBubbleFromEvent(event)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Bubble
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}