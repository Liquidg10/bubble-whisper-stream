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
  private currentHotkey = 'Space';
  private isPressed = false;
  private activeTarget: VoiceHotkeyTarget | null = null;
  private isListening = false;

  private constructor() {
    this.setupEventListeners();
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

    // Don't capture if user is typing in an input field
    if (this.isUserTyping(event.target)) {
      devLog('Voice hotkey ignored - user typing in input field');
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

  private isUserTyping(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    
    const tagName = target.tagName.toLowerCase();
    const isInput = tagName === 'input' || tagName === 'textarea';
    const isContentEditable = target.contentEditable === 'true';
    const hasRole = target.getAttribute('role') === 'textbox';
    
    // Enhanced detection for AI Assistant chat area
    let element: HTMLElement | null = target;
    while (element) {
      // Check if we're in the AI Assistant container
      if (element.getAttribute('data-ai-assistant') !== null) {
        devLog(`Voice hotkey blocked - inside AI Assistant, tagName: ${tagName}`);
        return true;
      }
      element = element.parentElement;
    }
    
    // Check for specific textarea attributes used by shadcn components
    const isTextArea = tagName === 'textarea';
    const hasAriaDescriptor = target.hasAttribute('aria-describedby');
    const hasAutoComplete = target.hasAttribute('autocomplete');
    
    devLog(`Voice hotkey typing check - tagName: ${tagName}, isInput: ${isInput}, isTextArea: ${isTextArea}, hasAriaDescriptor: ${hasAriaDescriptor}`);
    
    return isInput || isContentEditable || hasRole;
  }
}

// Export singleton instance
export const voiceHotkeyManager = VoiceHotkeyManager.getInstance();