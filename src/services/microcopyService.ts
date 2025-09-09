/**
 * Microcopy Service
 * Provides friendly, accessible copy with readability optimization
 */

export interface MicrocopyOptions {
  tone: 'friendly' | 'professional' | 'casual' | 'encouraging';
  readingLevel: 'elementary' | 'middle' | 'high-school' | 'college';
  brevity: 'concise' | 'standard' | 'detailed';
  includeEmoji: boolean;
  includeReadAloud: boolean;
}

export interface ReadAloudOptions {
  voice?: 'auto' | 'male' | 'female';
  rate?: number; // 0.1 to 10
  pitch?: number; // 0 to 2
  volume?: number; // 0 to 1
}

class MicrocopyService {
  private defaultOptions: MicrocopyOptions = {
    tone: 'friendly',
    readingLevel: 'middle',
    brevity: 'standard',
    includeEmoji: false,
    includeReadAloud: false
  };

  private speechSynthesis: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.speechSynthesis = window.speechSynthesis;
    }
  }

  /**
   * Generate action button text with friendly tone
   */
  getActionText(action: string, context?: string, options?: Partial<MicrocopyOptions>): {
    primary: string;
    secondary: string;
    aria: string;
  } {
    const opts = { ...this.defaultOptions, ...options };
    
    const templates = this.getActionTemplates(opts.tone, opts.readingLevel);
    const template = templates[action as keyof typeof templates] || templates.default;
    
    return {
      primary: this.applyReadabilityRules(template.primary, opts),
      secondary: this.applyReadabilityRules(template.secondary, opts),
      aria: template.aria || template.primary
    };
  }

  /**
   * Generate confirmation dialog text
   */
  getConfirmationText(action: string, item?: string, options?: Partial<MicrocopyOptions>): {
    title: string;
    description: string;
    confirm: string;
    cancel: string;
    aria: string;
  } {
    const opts = { ...this.defaultOptions, ...options };
    
    const confirmations = this.getConfirmationTemplates(opts.tone, opts.readingLevel);
    const template = confirmations[action as keyof typeof confirmations] || confirmations.delete;
    
    return {
      title: this.insertItem(template.title, item),
      description: this.insertItem(template.description, item),
      confirm: template.confirm,
      cancel: template.cancel,
      aria: this.insertItem(template.aria || template.title, item)
    };
  }

  /**
   * Generate status messages
   */
  getStatusText(status: 'success' | 'error' | 'warning' | 'info', action?: string, options?: Partial<MicrocopyOptions>): {
    message: string;
    action?: string;
    aria: string;
  } {
    const opts = { ...this.defaultOptions, ...options };
    
    const statusTemplates = this.getStatusTemplates(opts.tone, opts.readingLevel);
    const template = statusTemplates[status];
    
    return {
      message: this.applyReadabilityRules(template.message, opts),
      action: template.action ? this.applyReadabilityRules(template.action, opts) : undefined,
      aria: template.aria || template.message
    };
  }

  /**
   * Generate help text
   */
  getHelpText(feature: string, options?: Partial<MicrocopyOptions>): {
    tooltip: string;
    description: string;
    example?: string;
    aria: string;
  } {
    const opts = { ...this.defaultOptions, ...options };
    
    const helpTemplates = this.getHelpTemplates(opts.tone, opts.readingLevel);
    const template = helpTemplates[feature as keyof typeof helpTemplates] || helpTemplates.default;
    
    return {
      tooltip: this.applyReadabilityRules(template.tooltip, opts),
      description: this.applyReadabilityRules(template.description, opts),
      example: template.example ? this.applyReadabilityRules(template.example, opts) : undefined,
      aria: template.aria || template.tooltip
    };
  }

  /**
   * Read text aloud using speech synthesis
   */
  async readAloud(text: string, options?: ReadAloudOptions): Promise<void> {
    if (!this.speechSynthesis) {
      console.warn('Speech synthesis not supported');
      return;
    }

    // Stop any current speech
    this.stopReading();

    return new Promise((resolve, reject) => {
      try {
        const utterance = new SpeechSynthesisUtterance(this.cleanTextForSpeech(text));
        
        // Set voice options
        if (options?.rate) utterance.rate = Math.max(0.1, Math.min(10, options.rate));
        if (options?.pitch) utterance.pitch = Math.max(0, Math.min(2, options.pitch));
        if (options?.volume) utterance.volume = Math.max(0, Math.min(1, options.volume));
        
        // Select voice
        const voices = this.speechSynthesis!.getVoices();
        if (voices.length > 0 && options?.voice && options.voice !== 'auto') {
          const preferredVoice = voices.find(voice => 
            voice.name.toLowerCase().includes(options.voice === 'female' ? 'female' : 'male')
          );
          if (preferredVoice) utterance.voice = preferredVoice;
        }

        utterance.onend = () => {
          this.currentUtterance = null;
          resolve();
        };
        
        utterance.onerror = (error) => {
          this.currentUtterance = null;
          reject(error);
        };

        this.currentUtterance = utterance;
        this.speechSynthesis!.speak(utterance);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop current speech
   */
  stopReading(): void {
    if (this.speechSynthesis && this.currentUtterance) {
      this.speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }

  /**
   * Check if currently reading
   */
  isReading(): boolean {
    return this.speechSynthesis?.speaking || false;
  }

  /**
   * Calculate text readability score (Flesch Reading Ease approximation)
   */
  calculateReadabilityScore(text: string): {
    score: number;
    level: 'elementary' | 'middle' | 'high-school' | 'college';
    grade: string;
  } {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    const syllables = this.countSyllables(text);
    
    if (sentences === 0 || words === 0) {
      return { score: 0, level: 'college', grade: 'Unknown' };
    }

    // Flesch Reading Ease formula
    const score = 206.835 - (1.015 * (words / sentences)) - (84.6 * (syllables / words));
    
    let level: 'elementary' | 'middle' | 'high-school' | 'college';
    let grade: string;
    
    if (score >= 90) {
      level = 'elementary';
      grade = '5th grade';
    } else if (score >= 80) {
      level = 'middle';
      grade = '6th grade';
    } else if (score >= 70) {
      level = 'middle';
      grade = '7th grade';
    } else if (score >= 60) {
      level = 'middle';
      grade = '8th-9th grade';
    } else if (score >= 50) {
      level = 'high-school';
      grade = '10th-12th grade';
    } else {
      level = 'college';
      grade = 'College level';
    }
    
    return { score, level, grade };
  }

  private getActionTemplates(tone: string, readingLevel: string) {
    const simple = readingLevel === 'elementary' || readingLevel === 'middle';
    
    if (tone === 'friendly') {
      return {
        save: {
          primary: simple ? "Save it" : "Save changes",
          secondary: simple ? "Not now" : "Maybe later",
          aria: "Save your changes"
        },
        delete: {
          primary: simple ? "Yes, delete" : "Delete it",
          secondary: simple ? "Keep it" : "Never mind",
          aria: "Confirm deletion"
        },
        add: {
          primary: simple ? "Yes, add it" : "Add this",
          secondary: simple ? "Not now" : "Skip for now",
          aria: "Add new item"
        },
        cancel: {
          primary: simple ? "Stop" : "Cancel",
          secondary: simple ? "Keep going" : "Continue",
          aria: "Cancel current action"
        },
        default: {
          primary: simple ? "Got it" : "Confirm",
          secondary: simple ? "Not now" : "Cancel",
          aria: "Confirm action"
        }
      };
    }
    
    return {
      save: {
        primary: "Save Changes",
        secondary: "Cancel",
        aria: "Save changes"
      },
      delete: {
        primary: "Delete",
        secondary: "Cancel", 
        aria: "Delete item"
      },
      add: {
        primary: "Add",
        secondary: "Cancel",
        aria: "Add item"
      },
      cancel: {
        primary: "Cancel",
        secondary: "Continue",
        aria: "Cancel action"
      },
      default: {
        primary: "Confirm",
        secondary: "Cancel",
        aria: "Confirm action"
      }
    };
  }

  private getConfirmationTemplates(tone: string, readingLevel: string) {
    const simple = readingLevel === 'elementary' || readingLevel === 'middle';
    
    if (tone === 'friendly') {
      return {
        delete: {
          title: simple ? "Delete this?" : "Are you sure?",
          description: simple ? "This will remove {item}. You can't get it back." : "This will permanently delete {item}. This action cannot be undone.",
          confirm: simple ? "Yes, delete" : "Delete it",
          cancel: simple ? "Keep it" : "Never mind",
          aria: "Confirm deletion of {item}"
        },
        save: {
          title: simple ? "Save changes?" : "Save your changes?",
          description: simple ? "This will save what you've done." : "Your changes will be saved and applied.",
          confirm: simple ? "Save it" : "Save changes",
          cancel: simple ? "Don't save" : "Cancel",
          aria: "Confirm saving changes"
        }
      };
    }
    
    return {
      delete: {
        title: "Confirm Deletion",
        description: "This will permanently delete {item}. This action cannot be undone.",
        confirm: "Delete",
        cancel: "Cancel",
        aria: "Confirm deletion"
      },
      save: {
        title: "Save Changes",
        description: "Your changes will be saved.",
        confirm: "Save",
        cancel: "Cancel", 
        aria: "Confirm save"
      }
    };
  }

  private getStatusTemplates(tone: string, readingLevel: string) {
    const simple = readingLevel === 'elementary' || readingLevel === 'middle';
    
    if (tone === 'friendly') {
      return {
        success: {
          message: simple ? "All done!" : "Success! Everything worked perfectly.",
          action: simple ? "Nice!" : "Great job!",
          aria: "Action completed successfully"
        },
        error: {
          message: simple ? "Oops! Something went wrong." : "Something didn't work right. Let's try again.",
          action: simple ? "Try again" : "Please try again",
          aria: "An error occurred"
        },
        warning: {
          message: simple ? "Heads up!" : "Just so you know...",
          action: simple ? "Got it" : "Understood",
          aria: "Warning message"
        },
        info: {
          message: simple ? "Just a note:" : "Here's what you should know:",
          action: simple ? "Thanks" : "Okay",
          aria: "Information message"
        }
      };
    }
    
    return {
      success: {
        message: "Operation completed successfully.",
        aria: "Success"
      },
      error: {
        message: "An error occurred. Please try again.",
        action: "Retry",
        aria: "Error"
      },
      warning: {
        message: "Please review the following information.",
        aria: "Warning"
      },
      info: {
        message: "Additional information:",
        aria: "Information"
      }
    };
  }

  private getHelpTemplates(tone: string, readingLevel: string) {
    const simple = readingLevel === 'elementary' || readingLevel === 'middle';
    
    return {
      voice_capture: {
        tooltip: simple ? "Talk to add ideas" : "Use your voice to capture thoughts",
        description: simple ? "Press and talk. We'll write it down for you." : "Hold the button and speak. Your words will be converted to text automatically.",
        example: simple ? "Try: 'Buy milk tomorrow'" : "Example: 'Schedule a meeting with John next Tuesday at 2 PM'",
        aria: "Voice capture help"
      },
      calendar_sync: {
        tooltip: simple ? "Connect your calendar" : "Sync with your calendar app",
        description: simple ? "This lets us see your events and help with planning." : "Connect your calendar to automatically sync events and get smart scheduling suggestions.",
        example: simple ? "See your meetings here" : "Automatic event detection and suggestions",
        aria: "Calendar synchronization help"
      },
      default: {
        tooltip: simple ? "Need help?" : "Get help with this feature",
        description: simple ? "Click for more info." : "Additional information is available.",
        example: simple ? "Click to learn more" : "Additional guidance available",
        aria: "Help information"
      }
    };
  }

  private applyReadabilityRules(text: string, options: MicrocopyOptions): string {
    let result = text;
    
    // Simplify for lower reading levels
    if (options.readingLevel === 'elementary' || options.readingLevel === 'middle') {
      result = this.simplifyLanguage(result);
    }
    
    // Apply brevity preferences
    if (options.brevity === 'concise') {
      result = this.makeConcise(result);
    }
    
    // Add emoji if requested
    if (options.includeEmoji) {
      result = this.addContextualEmoji(result);
    }
    
    return result;
  }

  private simplifyLanguage(text: string): string {
    const replacements = {
      'utilize': 'use',
      'facilitate': 'help',
      'implement': 'do',
      'subsequent': 'next',
      'prior to': 'before',
      'in order to': 'to',
      'at this point in time': 'now',
      'due to the fact that': 'because'
    };
    
    let result = text;
    for (const [complex, simple] of Object.entries(replacements)) {
      result = result.replace(new RegExp(complex, 'gi'), simple);
    }
    
    return result;
  }

  private makeConcise(text: string): string {
    return text
      .replace(/please\s+/gi, '')
      .replace(/\s+kindly\s+/gi, ' ')
      .replace(/\s+in order to\s+/gi, ' to ')
      .replace(/\s+at this time\s+/gi, ' now ')
      .trim();
  }

  private addContextualEmoji(text: string): string {
    const emojiMap = {
      'success': '✅',
      'error': '❌',
      'save': '💾',
      'delete': '🗑️',
      'add': '➕',
      'done': '✨',
      'warning': '⚠️'
    };
    
    let result = text;
    for (const [keyword, emoji] of Object.entries(emojiMap)) {
      if (text.toLowerCase().includes(keyword)) {
        result = `${emoji} ${result}`;
        break;
      }
    }
    
    return result;
  }

  private insertItem(template: string, item?: string): string {
    return item ? template.replace('{item}', item) : template.replace(' {item}', '').replace('{item}', '');
  }

  private cleanTextForSpeech(text: string): string {
    return text
      .replace(/[^\w\s.,!?-]/g, '') // Remove special characters except basic punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private countSyllables(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    let totalSyllables = 0;
    
    for (const word of words) {
      if (word.length === 0) continue;
      
      // Count vowel groups
      let syllables = (word.match(/[aeiouy]+/g) || []).length;
      
      // Subtract silent e
      if (word.endsWith('e') && syllables > 1) {
        syllables--;
      }
      
      // Minimum of 1 syllable per word
      totalSyllables += Math.max(1, syllables);
    }
    
    return totalSyllables;
  }
}

export const microcopyService = new MicrocopyService();