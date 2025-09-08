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
  Plus,
  Trash2,
  Shield
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { oauthService, SCOPES } from '@/services/oauthService';
import { ScopeConsentModal } from '@/components/ScopeConsentModal';
import { supabase } from '@/integrations/supabase/client';

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
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [pendingScopeRequest, setPendingScopeRequest] = useState<any>(null);

  useEffect(() => {
    loadCalendarAccounts();
    if (isEnabled) {
      loadUpcomingEvents();
    }
  }, [isEnabled]);

  const loadCalendarAccounts = async () => {
    try {
      const oauthAccounts = await oauthService.getConnectedAccounts();
      const calendarAccounts = oauthAccounts
        .filter(account => account.scopes.some(scope => scope.includes('calendar')))
        .map(account => ({
          id: account.id,
          name: account.account_email,
          type: 'google' as const,
          connected: true,
          email: account.account_email
        }));
      setAccounts(calendarAccounts);
    } catch (error) {
      console.error('Failed to load calendar accounts:', error);
    }
  };

  const loadUpcomingEvents = async () => {
    setIsLoading(true);
    try {
      const oauthAccounts = await oauthService.getConnectedAccounts();
      const calendarAccount = oauthAccounts.find(account => 
        account.scopes.some(scope => scope.includes('calendar'))
      );

      if (!calendarAccount) {
        setEvents([]);
        return;
      }

      // Check if we have read permission
      const { hasPermission } = await oauthService.checkScopePermissions(
        calendarAccount.id, 
        [SCOPES.GOOGLE_CALENDAR.READ]
      );

      if (!hasPermission) {
        setEvents([]);
        return;
      }

      // Fetch real calendar events from Google Calendar API
      const response = await oauthService.makeAuthenticatedRequest(
        calendarAccount.id,
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?' + new URLSearchParams({
          timeMin: new Date().toISOString(),
          timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '10'
        })
      );

      if (response.ok) {
        const data = await response.json();
        const googleEvents = data.items?.map((item: any) => ({
          id: item.id,
          title: item.summary || 'Untitled Event',
          start: item.start?.dateTime || item.start?.date,
          end: item.end?.dateTime || item.end?.date,
          description: item.description,
          location: item.location,
          attendees: item.attendees?.map((a: any) => a.email) || []
        })) || [];
        
        setEvents(googleEvents);
      } else {
        throw new Error('Failed to fetch calendar events');
      }
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
      // Start with read-only scope for incremental consent
      const authUrl = await oauthService.requestScopeEscalation({
        provider: 'google',
        service: 'calendar',
        requiredScopes: [SCOPES.GOOGLE_CALENDAR.READ],
        reason: 'view your calendar events'
      });

      // Open OAuth flow in popup
      const popup = window.open(authUrl, 'oauth', 'width=500,height=600');
      
      // Listen for OAuth completion
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_OAUTH_SUCCESS') {
          popup?.close();
          
          // Exchange code for tokens via edge function
          const { data, error } = await supabase.functions.invoke('oauth-google', {
            body: {
              code: event.data.code,
              redirect_uri: `${window.location.origin}/oauth-callback.html`
            }
          });

          if (error) throw error;
          
          await loadCalendarAccounts();
          toast({
            title: "Calendar Connected",
            description: "Google Calendar has been successfully connected with read access.",
          });
        } else if (event.data.type === 'GOOGLE_OAUTH_ERROR') {
          popup?.close();
          throw new Error(event.data.error);
        }
        
        window.removeEventListener('message', handleMessage);
      };

      window.addEventListener('message', handleMessage);
      
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

  const revokeCalendarAccess = async (accountId: string) => {
    try {
      await oauthService.revokeAccount(accountId);
      await loadCalendarAccounts();
      setEvents([]);
      toast({
        title: "Access Revoked",
        description: "Calendar access has been revoked. Write actions are now disabled.",
      });
    } catch (error) {
      console.error('Failed to revoke access:', error);
      toast({
        title: "Revoke Failed",
        description: "Unable to revoke calendar access. Please try again.",
        variant: "destructive"
      });
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
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{account.type}</Badge>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeCalendarAccess(account.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Revoke
                        </Button>
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