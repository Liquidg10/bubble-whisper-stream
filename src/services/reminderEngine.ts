// Reminder engine with 3-level escalation and fatigue guard

import { Reminder, Snooze, SNOOZE_PRESETS, SnoozePresetKey } from '@/types/bubble';
import { hapticsService } from './haptics';

export type ReminderLevel = 1 | 2 | 3;

export interface ReminderNotification {
  id: string;
  reminderId: string;
  level: ReminderLevel;
  title: string;
  message: string;
  actions: Array<{
    label: string;
    action: 'done' | 'snooze' | 'dismiss';
    snoozePreset?: SnoozePresetKey;
  }>;
}

class ReminderEngine {
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: {
    onNotification?: (notification: ReminderNotification) => void;
    onUpdate?: (reminder: Reminder) => void;
  } = {};

  setCallbacks(callbacks: {
    onNotification?: (notification: ReminderNotification) => void;
    onUpdate?: (reminder: Reminder) => void;
  }) {
    this.callbacks = callbacks;
  }

  scheduleReminder(reminder: Reminder): void {
    // Clear existing timer if any
    this.clearReminder(reminder.id);

    const now = Date.now();
    const delay = reminder.scheduledAt - now;

    if (delay <= 0) {
      // Immediate notification
      this.triggerNotification(reminder);
      return;
    }

    // Schedule notification
    const timer = setTimeout(() => {
      this.triggerNotification(reminder);
    }, delay);

    this.activeTimers.set(reminder.id, timer);
  }

  clearReminder(reminderId: string): void {
    const timer = this.activeTimers.get(reminderId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(reminderId);
    }
  }

  private triggerNotification(reminder: Reminder): void {
    const fatigue = this.calculateFatigue(reminder);
    
    // Fatigue guard: cap level based on fatigue score
    let maxLevel = 3;
    if (fatigue >= 1.0) {
      maxLevel = 2; // Cap at level 2 when fatigued
    }
    
    const adjustedLevel = Math.min(reminder.level + Math.floor(fatigue * 0.5), maxLevel) as ReminderLevel;

    const notification: ReminderNotification = {
      id: crypto.randomUUID(),
      reminderId: reminder.id,
      level: adjustedLevel,
      title: this.getLevelTitle(adjustedLevel),
      message: this.getNotificationMessage(reminder),
      actions: this.getActionsForLevel(adjustedLevel),
    };

    // Trigger haptic feedback
    switch (adjustedLevel) {
      case 1:
        hapticsService.gentle();
        break;
      case 2:
        hapticsService.doubleTap();
        break;
      case 3:
        hapticsService.pulse();
        break;
    }

    // Trigger voice notification for higher levels
    if (adjustedLevel >= 2) {
      this.triggerVoiceNotification(notification);
    }

    this.callbacks.onNotification?.(notification);
  }

  private async triggerVoiceNotification(notification: ReminderNotification): Promise<void> {
    try {
      const { ttsService } = await import('./tts');
      await ttsService.speak(notification.message, {
        context: 'reminders',
        tone: notification.level === 3 ? 'encouraging' : 'gentle',
        interrupt: notification.level === 3
      });
    } catch (error) {
      console.warn('Voice notification failed:', error);
    }
  }

  private calculateFatigue(reminder: Reminder): number {
    const recentSnoozes = reminder.snoozes.filter(
      snooze => snooze.at > Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
    );
    
    // Fatigue guard: if user has snoozed "Overwhelmed" 3+ times in 48h, cap at level 2
    const overwhelmedSnoozes = reminder.snoozes.filter(s => 
      s.reason === 'Overwhelmed' && Date.now() - s.at < 48 * 60 * 60 * 1000
    );
    
    if (overwhelmedSnoozes.length >= 3) {
      return 1.0; // Maximum fatigue
    }

    const fastSnoozes = recentSnoozes.filter(snooze => {
      const duration = snooze.at - Date.now();
      return duration < (30 * 60 * 1000); // Less than 30 minutes
    });

    return Math.min(recentSnoozes.length / 3, 1); // Cap at 1.0
  }

  private getLevelTitle(level: ReminderLevel): string {
    switch (level) {
      case 1:
        return 'Gentle Reminder';
      case 2:
        return 'Persistent Reminder';
      case 3:
        return 'Important Reminder';
      default:
        return 'Reminder';
    }
  }

  private getNotificationMessage(reminder: Reminder): string {
    // This would typically fetch the bubble content
    return `Time for your reminder`;
  }

  private getActionsForLevel(level: ReminderLevel) {
    const baseActions = [
      { label: 'Done', action: 'done' as const },
      { label: 'Not Relevant', action: 'dismiss' as const },
    ];

    const snoozeActions = SNOOZE_PRESETS.map(preset => ({
      label: preset.label,
      action: 'snooze' as const,
      snoozePreset: preset.key,
    }));

    switch (level) {
      case 1:
        return [
          ...baseActions,
          { label: 'Snooze 30min', action: 'snooze' as const, snoozePreset: 'busy' as SnoozePresetKey },
        ];
      case 2:
        return [
          ...baseActions,
          ...snoozeActions.slice(0, 3), // First 3 presets
        ];
      case 3:
        return [
          ...baseActions,
          ...snoozeActions, // All presets
        ];
      default:
        return baseActions;
    }
  }

  snoozeReminder(
    reminder: Reminder,
    presetKey?: SnoozePresetKey,
    customReason?: string,
    customDuration?: number
  ): Reminder {
    let duration = 30 * 60 * 1000; // Default 30 minutes
    let reason = customReason;

    if (presetKey) {
      const preset = SNOOZE_PRESETS.find(p => p.key === presetKey);
      if (preset) {
        duration = preset.duration;
        reason = reason || preset.label;
      }
    } else if (customDuration) {
      duration = customDuration;
    }

    const snooze: Snooze = {
      id: crypto.randomUUID(),
      reminderId: reminder.id,
      at: Date.now() + duration,
      reason,
    };

    const updatedReminder: Reminder = {
      ...reminder,
      status: 'Snoozed',
      scheduledAt: Date.now() + duration,
      snoozes: [...reminder.snoozes, snooze],
    };

    // Reschedule
    this.scheduleReminder(updatedReminder);
    this.callbacks.onUpdate?.(updatedReminder);

    return updatedReminder;
  }

  completeReminder(reminder: Reminder): Reminder {
    this.clearReminder(reminder.id);
    
    const updatedReminder: Reminder = {
      ...reminder,
      status: 'Done',
    };

    this.callbacks.onUpdate?.(updatedReminder);
    return updatedReminder;
  }

  dismissReminder(reminder: Reminder): Reminder {
    this.clearReminder(reminder.id);
    
    const updatedReminder: Reminder = {
      ...reminder,
      status: 'Dismissed',
    };

    this.callbacks.onUpdate?.(updatedReminder);
    return updatedReminder;
  }

  // Check for quiet hours
  isQuietHours(quietHours?: { start: string; end: string }): boolean {
    if (!quietHours) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = quietHours.start.split(':').map(Number);
    const [endHour, endMin] = quietHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  // Initialize with existing reminders
  initializeReminders(reminders: Reminder[]): void {
    const activeReminders = reminders.filter(r => r.status === 'Active');
    
    activeReminders.forEach(reminder => {
      this.scheduleReminder(reminder);
    });
  }
}

export const reminderEngine = new ReminderEngine();