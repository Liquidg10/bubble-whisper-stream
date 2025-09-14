/**
 * Tone System & Copy Framework
 * Friend/Coach/Scientist tones with context-aware copy selection
 */

export type ToneType = 'friend' | 'coach' | 'scientist';
export type CopyContext = 'success' | 'undo' | 'reminder' | 'suggestion' | 'celebration' | 'grounding';

interface ToneProfile {
  voice: string;
  characteristics: string[];
  forbiddenPhrases: string[];
  preferredPhrases: string[];
}

interface CopyVariant {
  tone: ToneType;
  context: CopyContext;
  text: string;
  maxWords: number;
}

class ToneSystemService {
  private readonly toneProfiles: Record<ToneType, ToneProfile> = {
    friend: {
      voice: 'Warm, supportive, conversational',
      characteristics: ['empathetic', 'encouraging', 'casual', 'understanding'],
      forbiddenPhrases: ['you should', 'you must', 'you need to', 'failure', 'wrong'],
      preferredPhrases: ['when you\'re ready', 'if it helps', 'might be worth', 'gentle reminder']
    },
    coach: {
      voice: 'Motivating, structured, growth-focused',
      characteristics: ['encouraging', 'goal-oriented', 'practical', 'strengths-based'],
      forbiddenPhrases: ['lazy', 'procrastinating', 'behind schedule', 'should have'],
      preferredPhrases: ['next step', 'building momentum', 'making progress', 'opportunity to']
    },
    scientist: {
      voice: 'Objective, data-informed, curious',
      characteristics: ['neutral', 'evidence-based', 'exploratory', 'non-judgmental'],
      forbiddenPhrases: ['obviously', 'clearly', 'everyone knows', 'simple'],
      preferredPhrases: ['patterns suggest', 'data indicates', 'experiment shows', 'curious about']
    }
  };

  private readonly copyLibrary: CopyVariant[] = [
    // Success messages
    { tone: 'friend', context: 'success', text: 'Nice work! That felt good, didn\'t it?', maxWords: 8 },
    { tone: 'coach', context: 'success', text: 'Great momentum—you\'re building something here.', maxWords: 7 },
    { tone: 'scientist', context: 'success', text: 'Task completed. Progress data updated.', maxWords: 6 },

    // Undo messages  
    { tone: 'friend', context: 'undo', text: 'No worries—undid that for you.', maxWords: 6 },
    { tone: 'coach', context: 'undo', text: 'Reset complete. Fresh start ready.', maxWords: 6 },
    { tone: 'scientist', context: 'undo', text: 'Previous action reversed successfully.', maxWords: 5 },

    // Reminders
    { tone: 'friend', context: 'reminder', text: 'Gentle heads-up about your dentist appointment.', maxWords: 7 },
    { tone: 'coach', context: 'reminder', text: 'Time to tackle that dentist appointment.', maxWords: 7 },
    { tone: 'scientist', context: 'reminder', text: 'Scheduled event approaching: dentist appointment.', maxWords: 6 },

    // Suggestions
    { tone: 'friend', context: 'suggestion', text: 'Might be a good time to batch similar tasks?', maxWords: 10 },
    { tone: 'coach', context: 'suggestion', text: 'Consider grouping these for better flow.', maxWords: 7 },
    { tone: 'scientist', context: 'suggestion', text: 'Task clustering could improve efficiency.', maxWords: 6 },

    // Celebrations
    { tone: 'friend', context: 'celebration', text: 'You did it! That was no small thing.', maxWords: 9 },
    { tone: 'coach', context: 'celebration', text: 'Solid achievement—momentum is building.', maxWords: 5 },
    { tone: 'scientist', context: 'celebration', text: 'Goal achieved. Performance metrics positive.', maxWords: 6 },

    // Grounding (crisis support)
    { tone: 'friend', context: 'grounding', text: 'Take a breath. You\'re safe right now.', maxWords: 8 },
    { tone: 'coach', context: 'grounding', text: 'Ground yourself. Focus on what you can control.', maxWords: 9 },
    { tone: 'scientist', context: 'grounding', text: 'Practice: Name 3 things you can see nearby.', maxWords: 9 }
  ];

  getCurrentTone(): ToneType {
    try {
      const saved = localStorage.getItem('preferredTone');
      if (saved && ['friend', 'coach', 'scientist'].includes(saved)) {
        return saved as ToneType;
      }
    } catch (error) {
      console.warn('Failed to load preferred tone:', error);
    }
    return 'friend'; // Default to friend tone
  }

  setTone(tone: ToneType): void {
    try {
      localStorage.setItem('preferredTone', tone);
    } catch (error) {
      console.warn('Failed to save preferred tone:', error);
    }
  }

  getCopy(context: CopyContext, tone?: ToneType, customText?: string): string {
    const activeTone = tone || this.getCurrentTone();
    
    if (customText) {
      return this.applyToneToText(customText, activeTone);
    }

    const variants = this.copyLibrary.filter(
      v => v.context === context && v.tone === activeTone
    );

    if (variants.length === 0) {
      // Fallback to friend tone if no variants found
      const fallbackVariants = this.copyLibrary.filter(
        v => v.context === context && v.tone === 'friend'
      );
      return fallbackVariants[0]?.text || 'Task updated.';
    }

    // Return random variant for variety
    const randomIndex = Math.floor(Math.random() * variants.length);
    return variants[randomIndex].text;
  }

  private applyToneToText(text: string, tone: ToneType): string {
    const profile = this.toneProfiles[tone];
    let processedText = text;

    // Remove forbidden phrases
    profile.forbiddenPhrases.forEach(phrase => {
      const regex = new RegExp(phrase, 'gi');
      processedText = processedText.replace(regex, '');
    });

    // Apply tone-specific modifications
    switch (tone) {
      case 'friend':
        processedText = this.makeFriendly(processedText);
        break;
      case 'coach':
        processedText = this.makeCoaching(processedText);
        break;
      case 'scientist':
        processedText = this.makeObjective(processedText);
        break;
    }

    return processedText.trim();
  }

  private makeFriendly(text: string): string {
    // Add softening language
    return text
      .replace(/\.$/, '. 🙂')
      .replace(/^(Add|Create|Set)/, 'Want to $1')
      .replace(/(\w+) completed/, '$1 done—nice!');
  }

  private makeCoaching(text: string): string {
    // Add growth-focused language
    return text
      .replace(/completed/, 'achieved')
      .replace(/added/, 'captured')
      .replace(/^(Add|Create)/, 'Let\'s $1');
  }

  private makeObjective(text: string): string {
    // Make more data-focused
    return text
      .replace(/nice/, 'positive')
      .replace(/great/, 'successful')
      .replace(/!$/, '.');
  }

  validateCopy(text: string, tone: ToneType): { isValid: boolean; issues: string[] } {
    const profile = this.toneProfiles[tone];
    const issues: string[] = [];

    // Check for forbidden phrases
    profile.forbiddenPhrases.forEach(phrase => {
      if (text.toLowerCase().includes(phrase.toLowerCase())) {
        issues.push(`Contains forbidden phrase: "${phrase}"`);
      }
    });

    // Check word count
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 12) {
      issues.push('Exceeds 12-word limit for micro-prompts');
    }

    // Check for shame language
    const shameWords = ['failed', 'behind', 'should have', 'late', 'wrong', 'bad'];
    shameWords.forEach(word => {
      if (text.toLowerCase().includes(word)) {
        issues.push(`Contains shame language: "${word}"`);
      }
    });

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  getToneProfile(tone: ToneType): ToneProfile {
    return this.toneProfiles[tone];
  }

  getAllTones(): ToneType[] {
    return Object.keys(this.toneProfiles) as ToneType[];
  }
}

export const toneSystem = new ToneSystemService();