import { supabase } from "@/integrations/supabase/client";

export interface CalendarEventDraft {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  startTz?: string;
  endTz?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  calendarAccountId: string;
  confidence?: number;
  autoWriteEligible?: boolean;
}

export interface WriteEventOptions {
  draft?: boolean;
  sendUpdates?: 'all' | 'externalOnly' | 'none';
  autoWrite?: boolean;
  confidence?: number;
}

class CalendarWriteService {
  async createEventDraft(
    calendarAccountId: string,
    eventData: Partial<CalendarEventDraft>
  ): Promise<CalendarEventDraft> {
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const draft: CalendarEventDraft = {
      id: draftId,
      title: eventData.title || 'Untitled Event',
      description: eventData.description,
      location: eventData.location,
      startTime: eventData.startTime || new Date().toISOString(),
      endTime: eventData.endTime || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      startTz: eventData.startTz,
      endTz: eventData.endTz,
      attendees: eventData.attendees || [],
      calendarAccountId,
      confidence: eventData.confidence || 0.5,
      autoWriteEligible: this.isAutoWriteEligible(eventData, eventData.confidence || 0.5)
    };

    // Store draft in local storage for preview
    const drafts = this.getDrafts();
    drafts.push(draft);
    localStorage.setItem('calendar_drafts', JSON.stringify(drafts));

    return draft;
  }

  async confirmDraft(draftId: string, options: WriteEventOptions = {}): Promise<any> {
    const drafts = this.getDrafts();
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
      throw new Error('Draft not found');
    }

    // Convert draft to Google Calendar event format
    const eventData = {
      summary: draft.title,
      description: draft.description,
      location: draft.location,
      start: {
        dateTime: draft.startTime,
        timeZone: draft.startTz || Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: draft.endTime,
        timeZone: draft.endTz || Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      attendees: draft.attendees?.map(a => ({
        email: a.email,
        displayName: a.displayName
      }))
    };

    // Call calendar-sync function to create the event
    const { data, error } = await supabase.functions.invoke('calendar-sync', {
      body: {
        action: 'create_event',
        calendarAccountId: draft.calendarAccountId,
        eventData,
        sendUpdates: options.sendUpdates || (draft.attendees && draft.attendees.length > 0 ? 'all' : 'none'),
        draft: false
      }
    });

    if (error) {
      throw new Error(`Failed to create event: ${error.message}`);
    }

    // Remove draft from storage
    this.removeDraft(draftId);

    return data;
  }

  async createEvent(
    calendarAccountId: string,
    eventData: any,
    options: WriteEventOptions = {}
  ): Promise<any> {
    const confidence = options.confidence || 0.5;
    
    // Check auto-write threshold
    if (options.autoWrite && confidence >= 0.85 && this.isAutoWriteEligible(eventData, confidence)) {
      // Direct auto-write
      return this.executeAutoWrite(calendarAccountId, eventData, options);
    } else if (options.draft || (confidence >= 0.60 && confidence < 0.85)) {
      // Create draft for review
      return this.createEventDraft(calendarAccountId, eventData);
    } else if (confidence < 0.60) {
      // Suggest only
      return {
        suggestion: true,
        eventData,
        message: 'Event suggestion created. Would you like to create this event?'
      };
    } else {
      // Direct creation
      return this.executeDirectWrite(calendarAccountId, eventData, options);
    }
  }

  private async executeAutoWrite(
    calendarAccountId: string,
    eventData: any,
    options: WriteEventOptions
  ): Promise<any> {
    // Auto-write with safety checks
    if (!this.passesAutoWriteSafetyChecks(eventData)) {
      // Fall back to draft
      return this.createEventDraft(calendarAccountId, eventData);
    }

    const googleEventData = this.convertToGoogleFormat(eventData);

    const { data, error } = await supabase.functions.invoke('calendar-sync', {
      body: {
        action: 'create_event',
        calendarAccountId,
        eventData: googleEventData,
        sendUpdates: options.sendUpdates || (eventData.attendees?.length > 0 ? 'all' : 'none'),
        draft: false
      }
    });

    if (error) {
      throw new Error(`Auto-write failed: ${error.message}`);
    }

    return {
      ...data,
      autoWritten: true,
      message: 'Event automatically created'
    };
  }

  private async executeDirectWrite(
    calendarAccountId: string,
    eventData: any,
    options: WriteEventOptions
  ): Promise<any> {
    const googleEventData = this.convertToGoogleFormat(eventData);

    const { data, error } = await supabase.functions.invoke('calendar-sync', {
      body: {
        action: 'create_event',
        calendarAccountId,
        eventData: googleEventData,
        sendUpdates: options.sendUpdates || (eventData.attendees?.length > 0 ? 'all' : 'none'),
        draft: false
      }
    });

    if (error) {
      throw new Error(`Failed to create event: ${error.message}`);
    }

    return data;
  }

  async deleteEvent(
    calendarAccountId: string,
    eventId: string,
    sendUpdates: 'all' | 'externalOnly' | 'none' = 'none'
  ): Promise<void> {
    const { error } = await supabase.functions.invoke('calendar-sync', {
      body: {
        action: 'delete_event',
        calendarAccountId,
        eventId,
        sendUpdates
      }
    });

    if (error) {
      throw new Error(`Failed to delete event: ${error.message}`);
    }
  }

  private isAutoWriteEligible(eventData: any, confidence: number): boolean {
    // Auto-write eligibility checks
    return (
      confidence >= 0.85 &&
      eventData.title &&
      eventData.startTime &&
      eventData.endTime &&
      this.isWithinTimeWindow(eventData.startTime) &&
      this.hasValidTimeRange(eventData.startTime, eventData.endTime)
    );
  }

  private passesAutoWriteSafetyChecks(eventData: any): boolean {
    // Additional safety checks for auto-write
    const startTime = new Date(eventData.startTime);
    const now = new Date();
    const daysFromNow = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    return (
      daysFromNow >= 0 && // Not in the past
      daysFromNow <= 14 && // Within next 14 days
      !eventData.attendees?.some((a: any) => this.isExternalAttendee(a)) && // No external attendees
      eventData.title.length > 3 && // Reasonable title length
      !this.containsSensitiveKeywords(eventData.title, eventData.description)
    );
  }

  private isWithinTimeWindow(startTime: string): boolean {
    const start = new Date(startTime);
    const now = new Date();
    const daysFromNow = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysFromNow >= 0 && daysFromNow <= 14; // Within next 14 days
  }

  private hasValidTimeRange(startTime: string, endTime: string): boolean {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    
    return durationHours > 0 && durationHours <= 24; // 0-24 hours duration
  }

  private isExternalAttendee(attendee: any): boolean {
    // Check if attendee is external (not in your organization)
    // This is a simplified check - in reality you'd check against your domain
    return attendee.email && !attendee.email.includes('@yourcompany.com');
  }

  private containsSensitiveKeywords(title: string, description?: string): boolean {
    const sensitiveKeywords = ['confidential', 'secret', 'private', 'internal', 'sensitive'];
    const text = `${title} ${description || ''}`.toLowerCase();
    
    return sensitiveKeywords.some(keyword => text.includes(keyword));
  }

  private convertToGoogleFormat(eventData: any): any {
    return {
      summary: eventData.title,
      description: eventData.description,
      location: eventData.location,
      start: {
        dateTime: eventData.startTime,
        timeZone: eventData.startTz || Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: eventData.endTime,
        timeZone: eventData.endTz || Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      attendees: eventData.attendees?.map((a: any) => ({
        email: a.email,
        displayName: a.displayName
      }))
    };
  }

  getDrafts(): CalendarEventDraft[] {
    const stored = localStorage.getItem('calendar_drafts');
    return stored ? JSON.parse(stored) : [];
  }

  private removeDraft(draftId: string): void {
    const drafts = this.getDrafts().filter(d => d.id !== draftId);
    localStorage.setItem('calendar_drafts', JSON.stringify(drafts));
  }

  clearAllDrafts(): void {
    localStorage.removeItem('calendar_drafts');
  }

  async getAutoWriteStats(): Promise<{
    dailyCount: number;
    weeklyCount: number;
    canAutoWrite: boolean;
  }> {
    // Get auto-write statistics for rate limiting
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const { data: logs, error } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('provider', 'google')
      .eq('service_type', 'calendar')
      .eq('operation', 'auto-write')
      .gte('created_at', weekAgo.toISOString());

    if (error) {
      console.error('Error fetching auto-write stats:', error);
      return { dailyCount: 0, weeklyCount: 0, canAutoWrite: true };
    }

    const todayLogs = logs?.filter(log => 
      new Date(log.created_at).toDateString() === today.toDateString()
    ) || [];

    const dailyCount = todayLogs.length;
    const weeklyCount = logs?.length || 0;

    // Rate limits: max 2 auto-writes per day, 10 per week
    const canAutoWrite = dailyCount < 2 && weeklyCount < 10;

    return { dailyCount, weeklyCount, canAutoWrite };
  }
}

export const calendarWriteService = new CalendarWriteService();