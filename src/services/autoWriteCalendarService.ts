/**
 * Auto-Write Calendar Service
 * 
 * Implements Context Engine-gated auto-write functionality for calendar events
 * with decision tracing, undo compensation, and idempotency.
 */

import { contextEngineService, ContextInput, ContextScore } from './contextEngineService';
import { thresholdLadderService, ThresholdResult, THRESHOLD_LEVELS } from './thresholdLadderService';
import { policyDecisionEngine } from './policyDecisionEngine';
import { decisionTraceService } from './decisionTraceService';
import { supabase } from '@/integrations/supabase/client';
import { useBubbleStore } from '@/stores/bubbleStore';

export interface CalendarIntent {
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime?: Date;
  attendees?: string[];
  confidence: number;
  source: 'text' | 'email' | 'voice';
  originalContent: string;
}

export interface CalendarWriteResult {
  decision: 'auto-write' | 'draft' | 'suggest' | 'skip';
  eventId?: string;
  draftId?: string;
  traceId: string;
  becauseText: string;
  confidence: number;
  undoInfo?: {
    eventId?: string;
    originalEvent?: any;
    linkedReminders?: string[];
  };
}

export interface CalendarAutoWriteSettings {
  enabled: boolean;
  autoWriteThreshold: number;
  draftThreshold: number;
  allowFirstTimeRecipients: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

class AutoWriteCalendarService {
  private undoRegistry = new Map<string, any>();

  /**
   * Process calendar intent through Context Engine gates
   */
  async processCalendarIntent(intent: CalendarIntent): Promise<CalendarWriteResult> {
    // Check if auto-write is enabled
    const settings = this.getAutoWriteSettings();
    if (!settings.enabled) {
      return {
        decision: 'skip',
        traceId: '',
        becauseText: 'Auto-write calendar is disabled',
        confidence: 0
      };
    }

    // Generate context score
    const contextInput: ContextInput = {
      content: intent.originalContent,
      eventType: 'calendar',
      deadline: intent.startTime,
      location: intent.location,
      currentTime: new Date()
    };

    const contextScore = await contextEngineService.generateScore(contextInput);

    // Apply policy decision engine
    const policyDecision = await policyDecisionEngine.makeDecision({
      content: intent.originalContent,
      eventType: 'calendar',
      deadline: intent.startTime,
      location: intent.location,
      userPreferences: {
        autoWriteEnabled: settings.enabled,
        quietHoursStart: settings.quietHoursStart,
        quietHoursEnd: settings.quietHoursEnd
      }
    });

    // Create decision trace
    const traceId = decisionTraceService.addTrace({
      feature: 'calendar',
      signals: contextScore.signals.map(s => ({
        type: s.type,
        value: s.value,
        confidence: s.confidence,
        source: 'context_engine'
      })),
      confidenceThreshold: THRESHOLD_LEVELS.HIGH,
      finalConfidence: policyDecision.contextScore.score,
      decision: policyDecision.decision,
      action: this.getActionDescription(policyDecision.decision, intent),
      becauseText: policyDecision.contextScore.because.join('; '),
      metadata: {
        intent,
        policyContext: policyDecision,
        originalThreshold: policyDecision.contextScore.score
      },
      undoable: true
    });

    // Execute decision
    switch (policyDecision.decision) {
      case 'auto-write':
        return await this.executeAutoWrite(intent, traceId, policyDecision);
      
      case 'draft':
        return await this.createDraft(intent, traceId, policyDecision);
      
      case 'suggest':
        return await this.createSuggestion(intent, traceId, policyDecision);
      
      default:
        return {
          decision: 'skip',
          traceId,
          becauseText: 'Intent did not meet confidence threshold',
          confidence: policyDecision.contextScore.score
        };
    }
  }

  /**
   * Execute auto-write to Google Calendar
   */
  private async executeAutoWrite(
    intent: CalendarIntent, 
    traceId: string, 
    policyDecision: any
  ): Promise<CalendarWriteResult> {
    try {
      // Check for existing event at this time to avoid duplicates
      const existingEvent = await this.checkForConflicts(intent);
      
      if (existingEvent && this.isHighSimilarity(existingEvent, intent)) {
        return {
          decision: 'skip',
          traceId,
          becauseText: 'Similar event already exists at this time',
          confidence: policyDecision.contextScore.score
        };
      }

      // Get connected calendar account
      const calendarAccount = await this.getActiveCalendarAccount();
      if (!calendarAccount) {
        throw new Error('No connected calendar account found');
      }

      // Create event via Google Calendar API
      const eventData = this.formatEventForGoogleCalendar(intent);
      const response = await supabase.functions.invoke('calendar-sync', {
        body: {
          action: 'create_event',
          calendarAccountId: calendarAccount.id,
          eventData
        }
      });

      if (response.error) {
        throw new Error(`Calendar API error: ${response.error.message}`);
      }

      const createdEvent = response.data.event;

      // Store undo information
      const undoInfo = {
        eventId: createdEvent.id,
        linkedReminders: await this.findLinkedReminders(intent)
      };
      
      this.undoRegistry.set(traceId, undoInfo);

      // Update decision trace with success
      decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [{
          type: 'auto_write_result',
          value: 'success',
          confidence: 1.0,
          source: 'calendar_api'
        }],
        confidenceThreshold: THRESHOLD_LEVELS.HIGH,
        finalConfidence: policyDecision.contextScore.score,
        decision: 'auto-write',
        action: `Successfully created calendar event: ${intent.title}`,
        becauseText: `Auto-wrote because ${policyDecision.contextScore.because.join('; ')}`,
        metadata: {
          originalTraceId: traceId,
          eventId: createdEvent.id,
          eventUrl: createdEvent.htmlLink
        },
        undoable: true
      });

      return {
        decision: 'auto-write',
        eventId: createdEvent.id,
        traceId,
        becauseText: `Auto-wrote because ${policyDecision.contextScore.because.join('; ')}`,
        confidence: policyDecision.contextScore.score,
        undoInfo
      };

    } catch (error: any) {
      // Log failure trace
      decisionTraceService.addTrace({
        feature: 'calendar',
        signals: [{
          type: 'auto_write_error',
          value: error.message,
          confidence: 1.0,
          source: 'calendar_api'
        }],
        confidenceThreshold: THRESHOLD_LEVELS.HIGH,
        finalConfidence: policyDecision.contextScore.score,
        decision: 'auto-write',
        action: `Failed to create calendar event: ${error.message}`,
        becauseText: 'Auto-write attempted but failed',
        metadata: { originalTraceId: traceId, error: error.message },
        undoable: false
      });

      throw error;
    }
  }

  /**
   * Create draft event for user confirmation
   */
  private async createDraft(
    intent: CalendarIntent, 
    traceId: string, 
    policyDecision: any
  ): Promise<CalendarWriteResult> {
    const draftId = crypto.randomUUID();
    const eventDraft = {
      id: draftId,
      ...intent,
      status: 'draft',
      createdAt: Date.now(),
      traceId
    };

    // Store draft in local storage for user review
    const existingDrafts = JSON.parse(localStorage.getItem('mm-calendar-drafts') || '[]');
    existingDrafts.push(eventDraft);
    localStorage.setItem('mm-calendar-drafts', JSON.stringify(existingDrafts));

    return {
      decision: 'draft',
      draftId,
      traceId,
      becauseText: `Created draft because ${policyDecision.contextScore.because.join('; ')}`,
      confidence: policyDecision.contextScore.score
    };
  }

  /**
   * Create suggestion for user consideration
   */
  private async createSuggestion(
    intent: CalendarIntent, 
    traceId: string, 
    policyDecision: any
  ): Promise<CalendarWriteResult> {
    // Add suggestion to notification system
    const suggestionText = `📅 Suggested event: ${intent.title} at ${intent.startTime.toLocaleString()}`;
    
    // This would integrate with the notification/glimmer system
    // For now, we'll store it as a suggestion in the bubble store
    const bubbleStore = useBubbleStore.getState();
    const suggestionBubble = {
      id: crypto.randomUUID(),
      content: suggestionText,
      type: 'ReminderNote' as const,
      tags: [{ id: 'calendar-suggestion', name: 'Calendar Suggestion', color: '#3b82f6' }],
      x: Math.random() * 400,
      y: Math.random() * 400,
      size: 40,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completed: false,
      metadata: {
        intent,
        traceId,
        suggestedAction: 'create-calendar-event'
      }
    };

    await bubbleStore.addBubble(suggestionBubble);

    return {
      decision: 'suggest',
      traceId,
      becauseText: `Created suggestion because ${policyDecision.contextScore.because.join('; ')}`,
      confidence: policyDecision.contextScore.score
    };
  }

  /**
   * Undo a calendar write operation with compensation
   */
  async undoCalendarWrite(traceId: string): Promise<boolean> {
    const undoInfo = this.undoRegistry.get(traceId);
    if (!undoInfo) {
      console.warn(`No undo information found for trace ${traceId}`);
      return false;
    }

    try {
      // Delete the created event
      if (undoInfo.eventId) {
        const calendarAccount = await this.getActiveCalendarAccount();
        if (calendarAccount) {
          await supabase.functions.invoke('calendar-sync', {
            body: {
              action: 'delete_event',
              calendarAccountId: calendarAccount.id,
              eventId: undoInfo.eventId
            }
          });
        }
      }

      // Compensate linked reminders
      if (undoInfo.linkedReminders?.length > 0) {
        await this.compensateLinkedReminders(undoInfo.linkedReminders);
      }

      // Mark trace as undone
      decisionTraceService.markAsUndone(traceId, crypto.randomUUID());

      // Remove from undo registry
      this.undoRegistry.delete(traceId);

      return true;
    } catch (error) {
      console.error('Failed to undo calendar write:', error);
      return false;
    }
  }

  /**
   * Helper methods
   */
  private getActionDescription(decision: string, intent: CalendarIntent): string {
    switch (decision) {
      case 'auto-write':
        return `Auto-create calendar event: ${intent.title}`;
      case 'draft':
        return `Create draft calendar event: ${intent.title}`;
      case 'suggest':
        return `Suggest calendar event: ${intent.title}`;
      default:
        return `No action for calendar intent: ${intent.title}`;
    }
  }

  private async checkForConflicts(intent: CalendarIntent): Promise<any> {
    // Check for existing events in the same time slot
    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('*')
      .gte('start_time', intent.startTime.toISOString())
      .lte('start_time', (intent.endTime || new Date(intent.startTime.getTime() + 60 * 60 * 1000)).toISOString())
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

    return existingEvents?.[0];
  }

  private isHighSimilarity(existingEvent: any, intent: CalendarIntent): boolean {
    const titleSimilarity = this.calculateStringSimilarity(existingEvent.title, intent.title);
    const timeDifference = Math.abs(new Date(existingEvent.start_time).getTime() - intent.startTime.getTime());
    const timeThreshold = 30 * 60 * 1000; // 30 minutes

    return titleSimilarity > 0.8 && timeDifference < timeThreshold;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  private async getActiveCalendarAccount(): Promise<any> {
    const { data: calendarAccounts } = await supabase
      .from('calendar_accounts')
      .select('*')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .eq('sync_enabled', true)
      .limit(1);

    return calendarAccounts?.[0];
  }

  private formatEventForGoogleCalendar(intent: CalendarIntent): any {
    return {
      summary: intent.title,
      description: intent.description,
      location: intent.location,
      start: {
        dateTime: intent.startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: (intent.endTime || new Date(intent.startTime.getTime() + 60 * 60 * 1000)).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      attendees: intent.attendees?.map(email => ({ email })) || []
    };
  }

  private async findLinkedReminders(intent: CalendarIntent): Promise<string[]> {
    // Find reminders that might be related to this calendar event
    const bubbleStore = useBubbleStore.getState();
    const relatedBubbles = bubbleStore.bubbles.filter(bubble =>
      bubble.content?.toLowerCase().includes(intent.title.toLowerCase()) ||
      (intent.location && bubble.content?.toLowerCase().includes(intent.location.toLowerCase()))
    );
    
    const reminderIds = relatedBubbles
      .filter(bubble => bubble.reminderId)
      .map(bubble => bubble.reminderId!)
      .filter(Boolean);
    
    return reminderIds;
  }

  private async compensateLinkedReminders(reminderIds: string[]): Promise<void> {
    // Mark linked reminders as needing attention since the event was undone
    const bubbleStore = useBubbleStore.getState();
    for (const reminderId of reminderIds) {
      const reminder = bubbleStore.reminders.find(r => r.id === reminderId);
      if (reminder) {
        const updatedReminder = {
          ...reminder,
          status: 'Active' as const
        };
        await bubbleStore.updateReminder(updatedReminder);
        
        // Update associated bubble to indicate event was cancelled
        const linkedBubble = bubbleStore.bubbles.find(b => b.reminderId === reminderId);
        if (linkedBubble) {
          await bubbleStore.updateBubble({
            ...linkedBubble,
            content: `${linkedBubble.content || ''} [Event cancelled - needs review]`
          });
        }
      }
    }
  }

  private getAutoWriteSettings(): CalendarAutoWriteSettings {
    const stored = localStorage.getItem('mm-auto-write-calendar-settings');
    if (stored) {
      return JSON.parse(stored);
    }
    
    return {
      enabled: false,
      autoWriteThreshold: THRESHOLD_LEVELS.HIGH,
      draftThreshold: THRESHOLD_LEVELS.MEDIUM,
      allowFirstTimeRecipients: false,
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00'
    };
  }

  updateAutoWriteSettings(settings: Partial<CalendarAutoWriteSettings>): void {
    const current = this.getAutoWriteSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem('mm-auto-write-calendar-settings', JSON.stringify(updated));
  }

  /**
   * Get recent undo-able calendar writes
   */
  getRecentUndoableWrites(): Array<{ traceId: string; description: string; timestamp: number }> {
    const traces = decisionTraceService.getRecentUndoable(10);
    return traces
      .filter(trace => trace.feature === 'calendar' && trace.decision === 'auto-write')
      .map(trace => ({
        traceId: trace.id,
        description: trace.action,
        timestamp: trace.timestamp
      }));
  }
}

export const autoWriteCalendarService = new AutoWriteCalendarService();