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
    const level = Math.min(reminder.level + fatigue, 3) as ReminderLevel;

    const notification: ReminderNotification = {
      id: crypto.randomUUID(),
      reminderId: reminder.id,
      level,
      title: this.getLevelTitle(level),
      message: this.getNotificationMessage(reminder),
      actions: this.getActionsForLevel(level),
    };

    // Trigger haptic feedback
    switch (level) {
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

    this.callbacks.onNotification?.(notification);
  }

  private calculateFatigue(reminder: Reminder): number {
    const recentSnoozes = reminder.snoozes.filter(
      snooze => snooze.at > Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
    );

    const fastSnoozes = recentSnoozes.filter(snooze => {
      const duration = snooze.at - Date.now();
      return duration < (30 * 60 * 1000); // Less than 30 minutes
    });

    return fastSnoozes.length >= 3 ? 1 : 0;
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