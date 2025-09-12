/**
 * Precision Gate Undo Hook
 * 
 * Provides unified undo functionality with toast notifications
 * for all auto-write decisions across features.
 */

import { useState, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { decisionTraceService } from '@/services/decisionTraceService';
import { supabase } from '@/integrations/supabase/client';

export interface UndoAction {
  traceId: string;
  feature: string;
  action: string;
  undoHandler: () => Promise<void>;
}

export function usePrecisionGateUndo() {
  const [pendingUndos, setPendingUndos] = useState<Map<string, UndoAction>>(new Map());
  
  /**
   * Handle undo action
   */
  const handleUndo = useCallback(async (traceId: string) => {
    const action = pendingUndos.get(traceId);
    if (!action) {
      toast({
        title: "Undo failed",
        description: "Action is no longer available for undo",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Execute the undo handler
      await action.undoHandler();
      
      // Mark trace as undone
      const undoId = crypto.randomUUID();
      decisionTraceService.markAsUndone(traceId, undoId);
      
      // Remove from pending
      setPendingUndos(prev => {
        const newMap = new Map(prev);
        newMap.delete(traceId);
        return newMap;
      });
      
      // Show success toast
      toast({
        title: "Action undone",
        description: `Successfully reversed ${action.action}`,
        variant: "default"
      });
      
      // Log undo action in decision trace
      decisionTraceService.addTrace({
        feature: action.feature as any,
        signals: [{
          type: 'undo',
          value: traceId,
          confidence: 1.0,
          source: 'user-action'
        }],
        confidenceThreshold: 1.0,
        finalConfidence: 1.0,
        decision: 'skip',
        action: `Undid: ${action.action}`,
        becauseText: 'User manually reversed auto-write action',
        metadata: { originalTraceId: traceId, undoId },
        undoable: false
      });
      
    } catch (error) {
      console.error('Undo failed:', error);
      toast({
        title: "Undo failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    }
  }, [pendingUndos]);
  
  /**
   * Show undo toast for a decision
   */
  const showUndoToast = useCallback((action: UndoAction) => {
    setPendingUndos(prev => new Map(prev.set(action.traceId, action)));
    
    const featureLabels = {
      calendar: 'Calendar event',
      email: 'Email',
      finance: 'Transaction',
      reminder: 'Reminder'
    };
    
    const featureLabel = featureLabels[action.feature as keyof typeof featureLabels] || 'Action';
    
    toast({
      title: `${action.action} • Undo`,
      description: "Click to reverse this action",
      duration: 8000, // 8 seconds to undo
    });
    
    // Auto-remove from pending after toast duration
    setTimeout(() => {
      setPendingUndos(prev => {
        const newMap = new Map(prev);
        newMap.delete(action.traceId);
        return newMap;
      });
    }, 8000);
  }, [handleUndo]);
  
  /**
   * Create undo action for calendar events
   */
  const createCalendarUndo = useCallback((eventData: {
    traceId: string;
    eventId?: string;
    calendarAccountId: string;
    title: string;
  }) => {
    return {
      traceId: eventData.traceId,
      feature: 'calendar',
      action: `Added "${eventData.title}" to calendar`,
      undoHandler: async () => {
        if (!eventData.eventId) {
          throw new Error('No event ID available for undo');
        }
        
        // Delete the calendar event
        const { error } = await supabase.functions.invoke('calendar-sync', {
          body: {
            action: 'delete_event',
            calendar_account_id: eventData.calendarAccountId,
            event_id: eventData.eventId
          }
        });
        
        if (error) {
          throw new Error(`Failed to delete calendar event: ${error.message}`);
        }
      }
    };
  }, []);
  
  /**
   * Create undo action for emails
   */
  const createEmailUndo = useCallback((emailData: {
    traceId: string;
    draftId?: string;
    messageId?: string;
    subject: string;
    isDraft: boolean;
  }) => {
    return {
      traceId: emailData.traceId,
      feature: 'email',
      action: emailData.isDraft ? `Created draft "${emailData.subject}"` : `Sent "${emailData.subject}"`,
      undoHandler: async () => {
        if (emailData.isDraft && emailData.draftId) {
          // Delete draft
          const { error } = await supabase.functions.invoke('gmail-compose', {
            body: {
              action: 'delete_draft',
              draft_id: emailData.draftId
            }
          });
          
          if (error) {
            throw new Error(`Failed to delete email draft: ${error.message}`);
          }
        } else {
          throw new Error('Cannot undo sent emails');
        }
      }
    };
  }, []);
  
  /**
   * Create undo action for financial transactions
   */
  const createFinanceUndo = useCallback((transactionData: {
    traceId: string;
    transactionId: string;
    description: string;
    amount: number;
  }) => {
    return {
      traceId: transactionData.traceId,
      feature: 'finance',
      action: `Categorized ${transactionData.description} ($${transactionData.amount})`,
      undoHandler: async () => {
        // Reset transaction categorization
        const { error } = await supabase
          .from('plaid_transactions')
          .update({ 
            category: null,
            metadata: { auto_categorized: false, undo_at: new Date().toISOString() }
          })
          .eq('transaction_id', transactionData.transactionId);
        
        if (error) {
          throw new Error(`Failed to undo transaction categorization: ${error.message}`);
        }
      }
    };
  }, []);
  
  /**
   * Create undo action for reminders
   */
  const createReminderUndo = useCallback((reminderData: {
    traceId: string;
    reminderId: string;
    title: string;
  }) => {
    return {
      traceId: reminderData.traceId,
      feature: 'reminder',
      action: `Created reminder "${reminderData.title}"`,
      undoHandler: async () => {
        // Delete the reminder (would integrate with reminder storage)
        console.log(`Undoing reminder: ${reminderData.reminderId}`);
        
        // For now, just mark as deleted in local storage
        const reminders = JSON.parse(localStorage.getItem('mm-reminders') || '[]');
        const filtered = reminders.filter((r: any) => r.id !== reminderData.reminderId);
        localStorage.setItem('mm-reminders', JSON.stringify(filtered));
      }
    };
  }, []);

  /**
   * Create undo action for task-calendar events
   */
  const createTaskCalendarUndo = useCallback((taskCalendarData: {
    traceId: string;
    taskId: string;
    eventId?: string;
    title: string;
  }) => {
    return {
      traceId: taskCalendarData.traceId,
      feature: 'task-calendar',
      action: `Auto-created calendar event from task "${taskCalendarData.title}"`,
      undoHandler: async () => {
        // Import dynamically to avoid circular dependencies
        const { taskAwareAutoWriteService } = await import('@/services/taskAwareAutoWriteService');
        
        const success = await taskAwareAutoWriteService.undoTaskCalendarWrite(
          taskCalendarData.taskId, 
          taskCalendarData.traceId
        );
        
        if (!success) {
          throw new Error('Failed to undo task calendar auto-write');
        }
      }
    };
  }, []);
  
  /**
   * Get recent undoable actions
   */
  const getRecentUndoableActions = useCallback(() => {
    return decisionTraceService.getRecentUndoable(10);
  }, []);
  
  return {
    showUndoToast,
    handleUndo,
    createCalendarUndo,
    createEmailUndo,
    createFinanceUndo,
    createReminderUndo,
    createTaskCalendarUndo,
    getRecentUndoableActions,
    pendingUndos: Array.from(pendingUndos.values())
  };
}