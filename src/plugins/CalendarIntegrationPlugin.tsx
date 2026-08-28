import React, { useCallback, useEffect, useState } from 'react';
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
  RefreshCw,
  Plus
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { oauthService, SCOPES } from '@/services/oauthService';

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
  statusMessage?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to connect to Google Calendar.';
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
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const loadCalendarAccounts = useCallback(async () => {
    try {
      const canonicalAccounts = await oauthService.getCanonicalCalendarAccounts();
      const calendarAccounts = canonicalAccounts.map(account => ({
        id: account.id,
        name: account.accountName || account.calendarName || account.accountEmail,
        type: account.provider.includes('google') ? 'google' as const : 'caldav' as const,
        connected: account.connected,
        email: account.accountEmail,
        statusMessage: account.connected
          ? 'Connected'
          : account.syncError || 'Setup incomplete',
      }));
      setAccounts(calendarAccounts);
      return calendarAccounts;
    } catch (error) {
      console.error('Failed to load calendar accounts:', error);
      throw error;
    }
  }, []);

  const loadUpcomingEvents = useCallback(async (refreshFromGoogle = false) => {
    setIsLoading(true);
    try {
      const canonicalAccounts = await oauthService.getCanonicalCalendarAccounts();
      const calendarAccount = canonicalAccounts.find(account => account.connected);

      if (!calendarAccount) {
        setEvents([]);
        return;
      }

      if (refreshFromGoogle) {
        await oauthService.syncCalendarAccount(calendarAccount.id);
      }

      setEvents(await oauthService.getCanonicalCalendarEvents(calendarAccount.id));
    } catch (error) {
      console.error('Failed to load calendar events:', error);
      toast({
        title: "Calendar Sync Failed",
        description: `${errorMessage(error)} Try Refresh again; reconnect if the error persists.`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadCalendarAccounts()
      .then((loadedAccounts) => {
        if (isEnabled && loadedAccounts.some(account => account.connected)) {
          void loadUpcomingEvents();
        }
      })
      .catch(() => {
        // Settings is intentionally visible while signed out. Treat that
        // expected state as no accounts; Add Calendar surfaces the sign-in ask.
        setAccounts([]);
        setEvents([]);
      });
  }, [isEnabled, loadCalendarAccounts, loadUpcomingEvents]);

  const connectGoogleCalendar = async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      await oauthService.redirectToGoogleCalendar({
        provider: 'google',
        service: 'calendar',
        requiredScopes: [SCOPES.GOOGLE_CALENDAR.READ],
        reason: 'view your calendar events'
      });
    } catch (error) {
      console.error('Failed to connect calendar:', error);
      const description = `${errorMessage(error)} Try Add Calendar again.`;
      setConnectionError(description);
      toast({
        title: "Connection Failed",
        description,
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
            {connectionError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{connectionError}</AlertDescription>
              </Alert>
            )}

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
                        {account.connected ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                        <div>
                          <div className="text-sm font-medium">{account.name}</div>
                          <div className="text-xs text-muted-foreground">{account.email}</div>
                          {!account.connected && (
                            <div className="text-xs text-muted-foreground">{account.statusMessage}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{account.type}</Badge>
                        {account.connected && <Badge variant="secondary">Connected</Badge>}
                      </div>
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
                  onClick={() => loadUpcomingEvents(true)}
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
