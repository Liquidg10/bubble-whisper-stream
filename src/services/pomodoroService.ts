/**
 * Unified Pomodoro Timer Service
 * Centralizes timer logic to prevent state conflicts between header and main components
 */

import { useBubbleStore } from '@/stores/bubbleStore';
import { hapticsService } from '@/services/haptics';

export interface PomodoroState {
  isActive: boolean;
  timeRemaining: number;
  duration: number;
  startTime: number | null;
  currentPhase: 'work' | 'break' | 'longBreak';
  cycleCount: number;
}

class PomodoroService {
  private intervalId: number | null = null;
  private phaseCompleteGuard = false;

  startTimer(phase: 'work' | 'break' | 'longBreak', duration?: number) {
    const store = useBubbleStore.getState();
    const customization = {
      workDuration: 25 * 60,
      shortBreakDuration: 5 * 60,
      longBreakDuration: 15 * 60,
      cyclesBeforeLongBreak: 4,
      hapticEnabled: true,
      autoStartWork: false,
      autoStartBreaks: false,
      ...store.settings.pomodoroCustomization
    };
    
    const timerDuration = duration || this.getDurationForPhase(phase, customization);
    const startTime = Date.now();

    // Stop any existing timer
    this.stopTimer();
    
    // Update state in single call
    store.updateSettings({
      pomodoroTimer: {
        isActive: true,
        timeRemaining: timerDuration,
        duration: timerDuration,
        startTime,
        currentPhase: phase,
        cycleCount: store.settings.pomodoroTimer?.cycleCount || 0
      }
    });

    // Start countdown
    this.startCountdown();
  }

  pauseTimer() {
    const store = useBubbleStore.getState();
    const currentTimer = store.settings.pomodoroTimer;
    
    if (!currentTimer) return;

    this.stopCountdown();
    
    // Calculate remaining time and pause
    const now = Date.now();
    const elapsed = currentTimer.startTime ? Math.floor((now - currentTimer.startTime) / 1000) : 0;
    const timeRemaining = Math.max(0, currentTimer.duration - elapsed);
    
    store.updateSettings({
      pomodoroTimer: {
        ...currentTimer,
        isActive: false,
        startTime: null,
        timeRemaining
      }
    });
  }

  resumeTimer() {
    const store = useBubbleStore.getState();
    const currentTimer = store.settings.pomodoroTimer;
    
    if (!currentTimer || currentTimer.isActive) return;

    const startTime = Date.now();
    
    store.updateSettings({
      pomodoroTimer: {
        ...currentTimer,
        isActive: true,
        startTime,
        duration: currentTimer.timeRemaining // Set duration to remaining time
      }
    });

    this.startCountdown();
  }

  resetTimer() {
    const store = useBubbleStore.getState();
    const customization = {
      workDuration: 25 * 60,
      ...store.settings.pomodoroCustomization
    };
    const defaultDuration = customization.workDuration;

    this.stopCountdown();

    store.updateSettings({
      pomodoroTimer: {
        isActive: false,
        timeRemaining: defaultDuration,
        duration: defaultDuration,
        startTime: null,
        currentPhase: 'work',
        cycleCount: 0
      }
    });
  }

  skipPhase() {
    if (!this.phaseCompleteGuard) {
      this.handlePhaseComplete();
    }
  }

  private startCountdown() {
    this.stopCountdown(); // Ensure no duplicate intervals
    
    this.intervalId = window.setInterval(() => {
      const store = useBubbleStore.getState();
      const currentTimer = store.settings.pomodoroTimer;
      
      if (!currentTimer?.isActive || !currentTimer.startTime) {
        this.stopCountdown();
        return;
      }

      const now = Date.now();
      const elapsed = Math.floor((now - currentTimer.startTime) / 1000);
      const newTimeRemaining = Math.max(0, currentTimer.duration - elapsed);

      if (newTimeRemaining === 0) {
        this.handlePhaseComplete();
        return;
      }

      // Only update timeRemaining to avoid state conflicts
      store.updateSettings({
        pomodoroTimer: {
          ...currentTimer,
          timeRemaining: newTimeRemaining
        }
      });
    }, 1000);
  }

  private stopCountdown() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private stopTimer() {
    this.stopCountdown();
    this.phaseCompleteGuard = false;
  }

  private handlePhaseComplete() {
    if (this.phaseCompleteGuard) return;
    this.phaseCompleteGuard = true;

    const store = useBubbleStore.getState();
    const currentTimer = store.settings.pomodoroTimer;
    const customization = {
      workDuration: 25 * 60,
      shortBreakDuration: 5 * 60,
      longBreakDuration: 15 * 60,
      cyclesBeforeLongBreak: 4,
      hapticEnabled: true,
      autoStartWork: false,
      autoStartBreaks: false,
      celebrationMessage: "Great session!",
      ...store.settings.pomodoroCustomization
    };
    
    if (!currentTimer) return;

    // Stop current timer first
    this.stopCountdown();

    // Trigger haptics
    if (customization.hapticEnabled) {
      hapticsService.success();
    }

    // Calculate next phase
    const { nextPhase, nextCycleCount, celebrationMessage } = this.calculateNextPhase(
      currentTimer.currentPhase,
      currentTimer.cycleCount,
      customization
    );

    const nextDuration = this.getDurationForPhase(nextPhase, customization);

    // Single state update for phase transition
    store.updateSettings({
      pomodoroTimer: {
        isActive: false,
        timeRemaining: nextDuration,
        duration: nextDuration,
        startTime: null,
        currentPhase: nextPhase,
        cycleCount: nextCycleCount
      }
    });

    // Show toast notification
    import('@/hooks/use-toast').then(({ toast }) => {
      toast({
        title: "Phase Complete!",
        description: celebrationMessage,
      });
    });

    // Auto-start next phase if enabled
    const shouldAutoStart = (nextPhase === 'work' && customization.autoStartWork) ||
                           (nextPhase !== 'work' && customization.autoStartBreaks);
    
    if (shouldAutoStart) {
      setTimeout(() => {
        this.phaseCompleteGuard = false;
        this.startTimer(nextPhase, nextDuration);
      }, 3000);
    } else {
      this.phaseCompleteGuard = false;
    }
  }

  private calculateNextPhase(currentPhase: string, currentCycle: number, customization: { cyclesBeforeLongBreak: number; celebrationMessage: string }) {
    let nextPhase: 'work' | 'break' | 'longBreak';
    let nextCycleCount = currentCycle;
    let celebrationMessage = customization.celebrationMessage || "Great session!";

    if (currentPhase === 'work') {
      nextCycleCount = currentCycle + 1;
      
      if (nextCycleCount >= customization.cyclesBeforeLongBreak) {
        nextPhase = 'longBreak';
        nextCycleCount = 0;
        celebrationMessage = "Excellent work cycle complete! Time for a long break 🛌";
      } else {
        nextPhase = 'break';
        celebrationMessage = "Great focus! Time for a short break ☕";
      }
    } else {
      nextPhase = 'work';
      celebrationMessage = "Break's over! Ready to focus again? 🍅";
    }

    return { nextPhase, nextCycleCount, celebrationMessage };
  }

  private getDurationForPhase(phase: string, customization: { workDuration: number; shortBreakDuration: number; longBreakDuration: number }): number {
    switch (phase) {
      case 'work':
        return customization.workDuration;
      case 'break':
        return customization.shortBreakDuration;
      case 'longBreak':
        return customization.longBreakDuration;
      default:
        return 25 * 60;
    }
  }
}

export const pomodoroService = new PomodoroService();