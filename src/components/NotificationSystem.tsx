import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Clock, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { reminderEngine } from '@/services/reminderEngine';
import { useBubbleStore } from '@/stores/bubbleStore';
import { BecausePill } from '@/components/BecausePill';
import type { ReminderNotification } from '@/services/reminderEngine';
import { SNOOZE_PRESETS } from '@/types/bubble';
import { ttsService } from '@/services/tts';

export const NotificationSystem: React.FC = () => {
  const [notifications, setNotifications] = useState<ReminderNotification[]>([]);
  const [fullScreenNotification, setFullScreenNotification] = useState<ReminderNotification | null>(null);
  const { completeReminder, snoozeReminder, getAdaptiveExplanation, settings } = useBubbleStore();

  useEffect(() => {
    reminderEngine.setCallbacks({
      onNotification: (notification) => {
        if (notification.level === 3) {
          setFullScreenNotification(notification);
          // Speak critical notifications immediately
          ttsService.speak(notification.message, {
            context: 'reminders',
            tone: 'encouraging',
            useAI: true,
            interrupt: true
          }).catch(console.warn);
        } else {
          setNotifications(prev => [...prev, notification]);
          
          // Browser notification for persistent level
          if (notification.level === 2 && 'Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification(notification.title, {
                body: notification.message,
                icon: '/favicon.ico',
                requireInteraction: true,
              });
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission();
            }
          }
        }
      },
      onUpdate: () => {
        // Handle reminder updates
      }
    });
  }, []);

  const handleNotificationAction = async (notification: ReminderNotification, action: string) => {
    const reminder = useBubbleStore.getState().reminders.find(r => r.id === notification.reminderId);
    if (!reminder) return;

    if (action === 'done') {
      await completeReminder(reminder.id);
      reminderEngine.completeReminder(reminder);
    } else if (action === 'dismiss') {
      reminderEngine.dismissReminder(reminder);
    }

    // Remove from notifications
    setNotifications(prev => prev.filter(n => n.id !== notification.id));
    if (fullScreenNotification?.id === notification.id) {
      setFullScreenNotification(null);
    }
  };

  const handleSnooze = async (notification: ReminderNotification, presetKey?: string, customReason?: string, customDuration?: number) => {
    const reminder = useBubbleStore.getState().reminders.find(r => r.id === notification.reminderId);
    if (!reminder) return;

    await reminderEngine.snoozeReminder(reminder, presetKey as any, customReason, customDuration);
    
    // Remove from notifications
    setNotifications(prev => prev.filter(n => n.id !== notification.id));
    if (fullScreenNotification?.id === notification.id) {
      setFullScreenNotification(null);
    }
  };

  return (
    <>
      {/* Ambient notifications */}
      <div className="fixed top-4 right-4 z-40 space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`
              max-w-sm p-4 rounded-lg shadow-lg border backdrop-blur-sm
              ${notification.level === 1 
                ? 'bg-card/90 border-primary/20 animate-pulse' 
                : 'bg-card border-destructive'
              }
            `}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <h4 className="font-medium text-sm">{notification.title}</h4>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{notification.message}</p>
                
                {/* Show adaptive explanation if intelligence is enabled */}
                {settings.intelligenceEnabled && settings.adaptiveReminders && getAdaptiveExplanation(notification.reminderId) && (
                  <BecausePill 
                    explanation={getAdaptiveExplanation(notification.reminderId)!} 
                    compact
                  />
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            
            <div className="flex gap-1 mt-3">
              {notification.actions.map((actionObj) => (
                <Button
                  key={actionObj.action}
                  variant={actionObj.action === 'done' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (actionObj.action === 'snooze') {
                      handleSnooze(notification, 'busy');
                    } else {
                      handleNotificationAction(notification, actionObj.action);
                    }
                  }}
                  className="text-xs"
                >
                  {actionObj.action === 'done' && <CheckCircle className="h-3 w-3 mr-1" />}
                  {actionObj.action === 'snooze' && <Clock className="h-3 w-3 mr-1" />}
                  {actionObj.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Full-screen notification modal */}
      {fullScreenNotification && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg shadow-lg max-w-md w-full">
            <div className="p-6 text-center">
              <AlertCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">{fullScreenNotification.title}</h2>
              <p className="text-muted-foreground mb-6">{fullScreenNotification.message}</p>
              
              <div className="space-y-3">
                <Button
                  onClick={() => handleNotificationAction(fullScreenNotification, 'done')}
                  className="w-full"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark as Done
                </Button>
                
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Or snooze with reason:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SNOOZE_PRESETS.map((preset) => (
                      <Button
                        key={preset.key}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSnooze(fullScreenNotification, preset.key)}
                        className="text-xs"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  onClick={() => handleNotificationAction(fullScreenNotification, 'dismiss')}
                  className="w-full text-muted-foreground"
                >
                  Not Relevant
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};