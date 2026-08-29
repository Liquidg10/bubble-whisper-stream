import { supabase } from "@/integrations/supabase/client";
import { autoWritePrecisionGate } from './autoWritePrecisionGate';
import { decisionTraceService } from './decisionTraceService';

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
  traceId?: string;
}

export interface WriteEventOptions {
  draft?: boolean;
  sendUpdates?: 'all' | 'externalOnly' | 'none';
  autoWrite?: boolean;
  confidence?: number;
  /** Record acceptance only when the caller owns an explicit user confirmation. */
  recordUserAcceptance?: boolean;
}

export interface CalendarEventConfirmationResult extends Record<string, unknown> {
  data?: { id?: string };
  error?: { message: string };
  eventId?: string;
  traceId: string;
  calendarAccountId: string;
  title: string;
}

function getProviderEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = (payload as { event?: { id?: unknown }; id?: unknown }).event?.id
    ?? (payload as { id?: unknown }).id;
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate
    : null;
}

class CalendarWriteService {
  private draftConfirmations = new Map<string, Promise<CalendarEventConfirmationResult>>();
  private confirmedDrafts = new Map<string, CalendarEventConfirmationResult>();

  async createEventDraft(
    calendarAccountId: string,
    eventData: Partial<CalendarEventDraft>
  ): Promise<CalendarEventDraft> {
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const confidence = eventData.confidence ?? 0.5;
    const traceId = eventData.traceId || decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [{
        type: 'calendar_draft',
        value: 'created',
        confidence,
        source: 'calendar-write-service',
        privacyLayer: 'surface'
      }],
      confidenceThreshold: 0.6,
      finalConfidence: confidence,
      decision: 'draft',
      action: 'Review calendar event draft',
      becauseText: 'Calendar event was saved as a draft for confirmation',
      privacyWatermark: 'surface',
      metadata: {
        telemetryKind: 'acceptance',
        outcomeFeature: 'calendar',
        surface: 'calendar-draft',
        presentedAt: Date.now(),
        draftId
      },
      undoable: true
    });
    
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
      confidence,
      autoWriteEligible: this.isAutoWriteEligible(eventData, confidence),
      traceId
    };

    // Store draft in local storage for preview
    const drafts = this.getDrafts();
    drafts.push(draft);
    localStorage.setItem('calendar_drafts', JSON.stringify(drafts));

    return draft;
  }

  async confirmDraft(
    draftId: string,
    options: WriteEventOptions = {}
  ): Promise<CalendarEventConfirmationResult> {
    const confirmed = this.getConfirmedDraft(draftId);
    if (confirmed) return confirmed;
    const existingConfirmation = this.draftConfirmations.get(draftId);
    if (existingConfirmation) return existingConfirmation;

    const confirmation = this.confirmDraftOnce(draftId, options);
    this.draftConfirmations.set(draftId, confirmation);

    try {
      return await confirmation;
    } finally {
      if (this.draftConfirmations.get(draftId) === confirmation) {
        this.draftConfirmations.delete(draftId);
      }
    }
  }

  private async confirmDraftOnce(
    draftId: string,
    options: WriteEventOptions
  ): Promise<CalendarEventConfirmationResult> {
    const drafts = this.getDrafts();
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
      throw new Error('Draft not found');
    }

    // Drafts created before trace propagation may still exist in localStorage.
    // Attach them to a canonical trace before any provider side effect.
    const traceId = draft.traceId || decisionTraceService.addTrace({
      feature: 'calendar',
      signals: [{
        type: 'calendar_draft',
        value: 'legacy-confirmation',
        confidence: draft.confidence ?? 0.5,
        source: 'calendar-write-service',
        privacyLayer: 'surface'
      }],
      confidenceThreshold: 0.6,
      finalConfidence: draft.confidence ?? 0.5,
      decision: 'draft',
      action: 'Review calendar event draft',
      becauseText: 'Existing calendar draft was presented for confirmation',
      privacyWatermark: 'surface',
      metadata: {
        telemetryKind: 'acceptance',
        outcomeFeature: 'calendar',
        surface: 'calendar-draft',
        presentedAt: Date.now(),
        draftId
      },
      undoable: true
    });
    if (!draft.traceId) {
      draft.traceId = traceId;
      localStorage.setItem('calendar_drafts', JSON.stringify(drafts));
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
      decisionTraceService.recordExecution(traceId, 'failed', {
        source: 'google-calendar',
        reference: error.message
      });
      throw new Error(`Failed to create event: ${error.message}`);
    }

    const eventId = getProviderEventId(data);
    if (!eventId) {
      const message = 'Calendar provider returned no event ID';
      decisionTraceService.recordExecution(traceId, 'failed', {
        source: 'google-calendar',
        reference: message
      });
      throw new Error(`Failed to create event: ${message}`);
    }
    decisionTraceService.recordExecution(traceId, 'succeeded', {
      source: 'google-calendar',
      reference: eventId
    });
    if (options.recordUserAcceptance) {
      decisionTraceService.recordUserAction(traceId, 'accept', {
        source: 'calendar-draft-widget',
        artifactId: eventId
      });
    }

    const confirmationResult: CalendarEventConfirmationResult = {
      ...data,
      eventId,
      traceId,
      calendarAccountId: draft.calendarAccountId,
      title: draft.title
    };
    // Remember provider success before best-effort local cleanup. If storage is
    // full or unavailable, the confirmed draft stays hidden and repeat calls
    // return this receipt instead of creating a duplicate Calendar event.
    this.rememberConfirmedDraft(draftId, confirmationResult);
    try {
      this.removeDraft(draftId);
    } catch (cleanupError) {
      console.warn('Calendar event was created, but local draft cleanup failed:', cleanupError);
    }

    return confirmationResult;
  }

  async createEvent(
    calendarAccountId: string,
    eventData: any,
    options: WriteEventOptions = {}
  ): Promise<any> {
    // Use unified precision gate for decision making. A gate failure must fail
    // closed; bypassing it with a direct provider write defeats the policy that
    // was supposed to authorize the side effect.
    const entities = {
      title: eventData.title || '',
      startTime: eventData.startTime || '',
      endTime: eventData.endTime || '',
      location: eventData.location || '',
      attendees: eventData.attendees || []
    };

    const decision = await autoWritePrecisionGate.evaluateDecision({
      content: `${eventData.title} ${eventData.description || ''}`.trim(),
      entities,
      feature: 'calendar',
      userTrust: {
        calendarWhitelisted: true,
        contactTrustScore: 0.8
      },
      userPreferences: {
        autoWriteEnabled: options.autoWrite || false,
        featureEnabled: true
      }
    });

    // The precision gate already created the canonical decision trace.
    const traceId = decision.traceId;

    // Execute based on decision
    switch (decision.decision) {
      case 'auto-write': {
        if (!this.passesAutoWriteSafetyChecks(eventData)) {
          const draft = await this.createEventDraft(calendarAccountId, { ...eventData, traceId });
          decisionTraceService.recordExecution(traceId, 'pending', {
            source: 'calendar-draft',
            reference: draft.id
          });
          return {
            ...draft,
            traceId,
            drafted: true,
            autoWritten: false,
            downgradedFrom: 'auto-write'
          };
        }

        try {
          const result = await this.executeAutoWrite(calendarAccountId, eventData, options);
          const eventId = getProviderEventId(result);
          if (!eventId) {
            throw new Error('Calendar provider returned no event ID');
          }
          decisionTraceService.recordExecution(traceId, 'succeeded', {
            source: 'google-calendar',
            reference: eventId
          });
          return { ...result, traceId, autoWritten: true };
        } catch (error) {
          decisionTraceService.recordExecution(traceId, 'failed', {
            source: 'google-calendar',
            reference: error instanceof Error ? error.message : 'Calendar write failed'
          });
          throw error;
        }
      }

      case 'draft': {
        const draft = await this.createEventDraft(calendarAccountId, { ...eventData, traceId });
        return { ...draft, traceId, drafted: true };
      }

      case 'suggest':
      default:
        return {
          suggestion: true,
          eventData,
          traceId,
          message: `Event suggestion: ${decision.reasons.join(', ')}`
        };
    }
  }

  private async executeAutoWrite(
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
      throw new Error(`Auto-write failed: ${error.message}`);
    }

    return {
      ...data,
      autoWritten: true,
      message: 'Event automatically created'
    };
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
    const drafts: CalendarEventDraft[] = stored ? JSON.parse(stored) : [];
    return drafts.filter(draft => !this.getConfirmedDraft(draft.id));
  }

  private getConfirmedDraft(draftId: string): CalendarEventConfirmationResult | undefined {
    const inMemory = this.confirmedDrafts.get(draftId);
    if (inMemory) return inMemory;
    try {
      const stored = sessionStorage.getItem(`calendar_confirmation_${draftId}`);
      if (!stored) return undefined;
      const receipt = JSON.parse(stored) as CalendarEventConfirmationResult;
      this.confirmedDrafts.set(draftId, receipt);
      return receipt;
    } catch {
      return undefined;
    }
  }

  private rememberConfirmedDraft(
    draftId: string,
    receipt: CalendarEventConfirmationResult
  ): void {
    this.confirmedDrafts.set(draftId, receipt);
    try {
      sessionStorage.setItem(`calendar_confirmation_${draftId}`, JSON.stringify(receipt));
    } catch (storageError) {
      console.warn('Calendar confirmation receipt is memory-only:', storageError);
    }
  }

  private removeDraft(draftId: string): void {
    const drafts = this.getDrafts().filter(d => d.id !== draftId);
    localStorage.setItem('calendar_drafts', JSON.stringify(drafts));
  }

  rejectDraft(draftId: string): boolean {
    const draft = this.getDrafts().find(candidate => candidate.id === draftId);
    if (!draft) return false;

    this.removeDraft(draftId);
    if (draft.traceId) {
      decisionTraceService.recordUserAction(draft.traceId, 'reject', {
        source: 'calendar-draft-widget',
        artifactId: draft.id
      });
    }
    return true;
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
