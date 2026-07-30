/**
 * VoiceHotkeyManager - Unified hotkey handling for voice capture
 * Intelligently routes hotkey presses to the appropriate voice UI
 */

import { devLog } from '@/devtools/devLog';

export interface VoiceHotkeyTarget {
  id: string;
  priority: number; // Higher priority takes precedence
  isVisible: () => boolean;
  isActive: () => boolean;
  onHotkeyPress: () => void;
  onHotkeyRelease: () => void;
}

export class VoiceHotkeyManager {
  private static instance: VoiceHotkeyManager;
  private targets: Map<string, VoiceHotkeyTarget> = new Map();
  private currentHotkey = 'Tab';
  private isPressed = false;
  private activeTarget: VoiceHotkeyTarget | null = null;
  private isListening = false;

  private constructor() {
    this.setupEventListeners();
    this.initializeFromSettings();
  }

  private initializeFromSettings(): void {
    // Initialize hotkey from stored settings
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const bubbleStore = localStorage.getItem('bubble-store');
        if (bubbleStore) {
          const parsed = JSON.parse(bubbleStore);
          const storedHotkey = parsed?.state?.settings?.voiceHotkey;
          if (storedHotkey) {
            this.currentHotkey = storedHotkey;
            devLog(`Voice hotkey initialized from settings: ${storedHotkey}`);
          }
        }
      } catch (error) {
        devLog('Failed to load hotkey from settings, using default Tab');
      }
    }
  }

  static getInstance(): VoiceHotkeyManager {
    if (!VoiceHotkeyManager.instance) {
      VoiceHotkeyManager.instance = new VoiceHotkeyManager();
    }
    return VoiceHotkeyManager.instance;
  }

  /**
   * Register a voice capture component as a hotkey target
   */
  registerTarget(target: VoiceHotkeyTarget): () => void {
    this.targets.set(target.id, target);
    devLog(`Voice hotkey target registered: ${target.id} (priority: ${target.priority})`);

    return () => {
      this.targets.delete(target.id);
      if (this.activeTarget?.id === target.id) {
        this.activeTarget = null;
      }
      devLog(`Voice hotkey target unregistered: ${target.id}`);
    };
  }

  /**
   * Update the global hotkey
   */
  setHotkey(hotkey: string): void {
    if (this.currentHotkey !== hotkey) {
      devLog(`Voice hotkey changed: ${this.currentHotkey} -> ${hotkey}`);
      this.currentHotkey = hotkey;
    }
  }

  /**
   * Get current hotkey
   */
  getHotkey(): string {
    return this.currentHotkey;
  }

  /**
   * Check if hotkey is currently active
   */
  isHotkeyPressed(): boolean {
    return this.isPressed;
  }

  /**
   * Get currently active target
   */
  getActiveTarget(): VoiceHotkeyTarget | null {
    return this.activeTarget;
  }

  private setupEventListeners(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
    
    // Handle focus changes that might affect target visibility
    document.addEventListener('visibilitychange', this.updateActiveTarget.bind(this));
    window.addEventListener('focus', this.updateActiveTarget.bind(this));
    window.addEventListener('blur', this.handleWindowBlur.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Ignore if hotkey already pressed (key repeat)
    if (this.isPressed || event.repeat) return;

    // Check if the pressed key matches our hotkey
    if (event.code !== this.currentHotkey) return;

    // Screen readers and operating-system shortcuts commonly combine Space
    // with modifier keys. A global voice shortcut must never interpret those
    // chords as consent to open the microphone.
    if (this.hasModifier(event)) {
      devLog('Voice hotkey ignored - modifier key is active');
      return;
    }

    // Native and ARIA controls own Space while focused. Treating their
    // activation key as microphone consent would break ordinary keyboard and
    // assistive-technology interaction.
    if (this.isInteractiveTarget(event.target)) {
      devLog('Voice hotkey ignored - interactive control owns the key');
      return;
    }

    // Modal interactions own the keyboard while open. This also keeps
    // assistive-technology activation keys inside onboarding and other dialogs
    // from leaking through to the global voice capture surface.
    if (document.querySelector(
      '[role="dialog"][aria-modal="true"], [role="dialog"][data-state="open"]',
    )) {
      devLog('Voice hotkey ignored - modal dialog is open');
      return;
    }

    event.preventDefault();
    this.isPressed = true;
    this.updateActiveTarget();

    if (this.activeTarget) {
      devLog(`Voice hotkey pressed - targeting: ${this.activeTarget.id}`);
      this.activeTarget.onHotkeyPress();
      this.isListening = true;
    } else {
      devLog('Voice hotkey pressed but no active target available');
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.isPressed || event.code !== this.currentHotkey) return;

    event.preventDefault();
    this.isPressed = false;

    if (this.activeTarget && this.isListening) {
      devLog(`Voice hotkey released - releasing: ${this.activeTarget.id}`);
      this.activeTarget.onHotkeyRelease();
      this.isListening = false;
    }
  }

  private handleWindowBlur(): void {
    // Force release if window loses focus while recording
    if (this.isPressed && this.activeTarget && this.isListening) {
      devLog('Voice hotkey force released - window blur');
      this.activeTarget.onHotkeyRelease();
      this.isPressed = false;
      this.isListening = false;
    }
  }

  private updateActiveTarget(): void {
    let bestTarget: VoiceHotkeyTarget | null = null;
    let highestPriority = -1;

    for (const target of this.targets.values()) {
      if (target.isVisible() && target.priority > highestPriority) {
        bestTarget = target;
        highestPriority = target.priority;
      }
    }

    if (this.activeTarget !== bestTarget) {
      const oldTargetId = this.activeTarget?.id || 'none';
      const newTargetId = bestTarget?.id || 'none';
      
      devLog(`Voice hotkey target changed: ${oldTargetId} -> ${newTargetId}`);
      this.activeTarget = bestTarget;
    }
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;

    if (target.closest('[data-ai-assistant]')) {
      devLog(`Voice hotkey blocked - inside AI Assistant container`);
      return true;
    }

    const interactiveSelectors = [
      'button',
      'a[href]',
      'input',
      'textarea',
      'select',
      'summary',
      '[contenteditable="true"]',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="tab"]',
    ];

    for (const selector of interactiveSelectors) {
      if (target.closest(selector)) {
        devLog(`Voice hotkey blocked - matches interactive selector: ${selector}`);
        return true;
      }
    }

    return false;
  }

  private hasModifier(event: KeyboardEvent): boolean {
    return event.ctrlKey
      || event.altKey
      || event.metaKey
      || event.shiftKey
      || event.getModifierState('CapsLock');
  }
}

// Export singleton instance
export const voiceHotkeyManager = VoiceHotkeyManager.getInstance();
