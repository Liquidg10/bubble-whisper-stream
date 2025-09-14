/**
 * Micro-Prompt Policy Engine
 * Implements global caps, per-view mutes, Silent Day, Work/Family modes
 */

import { isFeatureEnabled } from '@/config/flags';

export type PromptContext = 'view-switch' | 'post-capture' | 'reminder' | 'suggestion';
export type UserMode = 'work' | 'family' | 'personal' | 'silent';

interface PromptState {
  globalCount: number;
  lastReset: number;
  viewCounts: Record<string, number>;
  dismissedViews: Record<string, number>; // timestamp of last dismissal
  silentUntil?: number;
  currentMode: UserMode;
  workHours?: { start: string; end: string };
  familyHours?: { start: string; end: string };
  inMeeting: boolean;
}

interface PromptAttempt {
  context: PromptContext;
  viewId: string;
  content: string;
  timestamp: number;
}

class MicroPromptPolicyEngine {
  private state: PromptState;
  private readonly GLOBAL_DAILY_LIMIT = 3;
  private readonly PER_VIEW_LIMIT = 1;

  constructor() {
    this.state = this.loadState();
    this.resetIfNewDay();
  }

  private loadState(): PromptState {
    try {
      const saved = localStorage.getItem('microPromptState');
      if (saved) {
        return { ...this.getDefaultState(), ...JSON.parse(saved) };
      }
    } catch (error) {
      console.warn('Failed to load micro-prompt state:', error);
    }
    return this.getDefaultState();
  }

  private getDefaultState(): PromptState {
    return {
      globalCount: 0,
      lastReset: Date.now(),
      viewCounts: {},
      dismissedViews: {},
      currentMode: 'personal',
      inMeeting: false
    };
  }

  private saveState(): void {
    try {
      localStorage.setItem('microPromptState', JSON.stringify(this.state));
    } catch (error) {
      console.warn('Failed to save micro-prompt state:', error);
    }
  }

  private resetIfNewDay(): void {
    const now = Date.now();
    const lastReset = new Date(this.state.lastReset);
    const today = new Date(now);
    
    if (lastReset.toDateString() !== today.toDateString()) {
      this.state.globalCount = 0;
      this.state.viewCounts = {};
      this.state.lastReset = now;
      this.saveState();
    }
  }

  canShowPrompt(context: PromptContext, viewId: string): boolean {
    if (!isFeatureEnabled('adaptiveRemindersEnabled')) {
      return false;
    }

    // Silent Day check
    if (this.state.silentUntil && Date.now() < this.state.silentUntil) {
      return false;
    }

    // Meeting guard
    if (this.state.inMeeting) {
      return false;
    }

    // Mode-based suppression
    if (this.shouldSuppressForMode(context)) {
      return false;
    }

    // Global daily limit
    if (this.state.globalCount >= this.GLOBAL_DAILY_LIMIT) {
      return false;
    }

    // Per-view limit
    const viewCount = this.state.viewCounts[viewId] || 0;
    if (viewCount >= this.PER_VIEW_LIMIT) {
      return false;
    }

    // Dismissal cooldown (doubles each time)
    const lastDismissal = this.state.dismissedViews[viewId];
    if (lastDismissal) {
      const timeSinceDismissal = Date.now() - lastDismissal;
      const cooldownHours = Math.pow(2, viewCount) * 2; // 2h, 4h, 8h, etc.
      if (timeSinceDismissal < cooldownHours * 60 * 60 * 1000) {
        return false;
      }
    }

    return true;
  }

  private shouldSuppressForMode(context: PromptContext): boolean {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Work mode suppression
    if (this.state.currentMode === 'work' && this.state.workHours) {
      const inWorkHours = currentTime >= this.state.workHours.start && currentTime <= this.state.workHours.end;
      if (!inWorkHours && context !== 'reminder') {
        return true;
      }
    }

    // Family mode suppression
    if (this.state.currentMode === 'family' && this.state.familyHours) {
      const inFamilyHours = currentTime >= this.state.familyHours.start && currentTime <= this.state.familyHours.end;
      if (inFamilyHours && context === 'view-switch') {
        return true;
      }
    }

    return false;
  }

  recordPromptShown(context: PromptContext, viewId: string): void {
    this.state.globalCount++;
    this.state.viewCounts[viewId] = (this.state.viewCounts[viewId] || 0) + 1;
    this.saveState();
  }

  recordPromptDismissed(viewId: string): void {
    this.state.dismissedViews[viewId] = Date.now();
    this.saveState();
  }

  setSilentDay(hours: number = 24): void {
    this.state.silentUntil = Date.now() + (hours * 60 * 60 * 1000);
    this.saveState();
  }

  clearSilentDay(): void {
    this.state.silentUntil = undefined;
    this.saveState();
  }

  setMode(mode: UserMode): void {
    this.state.currentMode = mode;
    this.saveState();
  }

  setWorkHours(start: string, end: string): void {
    this.state.workHours = { start, end };
    this.saveState();
  }

  setFamilyHours(start: string, end: string): void {
    this.state.familyHours = { start, end };
    this.saveState();
  }

  setInMeeting(inMeeting: boolean): void {
    this.state.inMeeting = inMeeting;
    this.saveState();
  }

  getStatus() {
    return {
      canShowPrompts: !this.state.silentUntil || Date.now() > this.state.silentUntil,
      globalCount: this.state.globalCount,
      globalLimit: this.GLOBAL_DAILY_LIMIT,
      currentMode: this.state.currentMode,
      inMeeting: this.state.inMeeting,
      silentUntil: this.state.silentUntil
    };
  }
}

export const microPromptPolicy = new MicroPromptPolicyEngine();