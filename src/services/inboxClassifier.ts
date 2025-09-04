import { InboxItem, ClassificationRule, UserCorrection } from '@/types/inbox';
import { storageService } from './storage';

class InboxClassifierService {
  private defaultRules: ClassificationRule[] = [
    // Task indicators
    { keywords: ['todo', 'task', 'deadline', 'due', 'complete', 'finish'], type: 'Task', horizon: 'thisWeek', tags: ['task'], weight: 0.8 },
    { keywords: ['urgent', 'asap', 'immediately', 'today'], type: 'Task', horizon: 'today', tags: ['task', 'urgent'], weight: 0.9 },
    { keywords: ['meeting', 'appointment', 'schedule', 'calendar'], type: 'ReminderNote', horizon: 'thisWeek', tags: ['meeting'], weight: 0.8 },
    
    // Reminder indicators
    { keywords: ['remind', 'reminder', 'don\'t forget', 'remember'], type: 'ReminderNote', horizon: 'thisWeek', tags: ['reminder'], weight: 0.8 },
    { keywords: ['tomorrow', 'next week', 'next month'], type: 'ReminderNote', horizon: 'thisWeek', tags: ['reminder'], weight: 0.7 },
    
    // Joy indicators
    { keywords: ['congratulations', 'celebrate', 'success', 'achievement', 'good news'], type: 'Joy', tags: ['joy', 'celebration'], weight: 0.7 },
    { keywords: ['vacation', 'holiday', 'fun', 'party', 'wedding'], type: 'Joy', tags: ['joy', 'celebration'], weight: 0.6 },
    
    // Memory indicators
    { keywords: ['photo', 'image', 'memory', 'remember when', 'flashback'], type: 'Memory', tags: ['memory'], weight: 0.6 },
    
    // Shopping/financial
    { keywords: ['buy', 'purchase', 'order', 'shopping', 'receipt'], type: 'Task', horizon: 'thisWeek', tags: ['shopping', 'finance'], weight: 0.7 },
    { keywords: ['bill', 'payment', 'invoice', 'charge'], type: 'Task', horizon: 'today', tags: ['finance', 'urgent'], weight: 0.8 },
    
    // Default thought
    { keywords: ['idea', 'thought', 'note', 'consider', 'think'], type: 'Thought', tags: ['note'], weight: 0.5 }
  ];

  private userCorrections: UserCorrection[] = [];
  private confidenceThreshold = 0.6;

  async initialize() {
    try {
      const stored = await storageService.getSettings();
      if (stored && (stored as any).inboxCorrections) {
        this.userCorrections = (stored as any).inboxCorrections;
      }
    } catch (error) {
      console.error('Failed to load inbox corrections:', error);
    }
  }

  classifyItem(item: InboxItem): {
    type: 'Thought' | 'Task' | 'ReminderNote' | 'Memory' | 'Joy';
    horizon?: 'today' | 'thisWeek' | 'thisMonth' | 'someday';
    tags: string[];
    confidence: number;
  } {
    const text = `${item.subject || ''} ${item.snippet} ${item.fullContent}`.toLowerCase();
    const words = text.split(/\s+/);
    
    let bestMatch: { type: 'Thought' | 'Task' | 'ReminderNote' | 'Memory' | 'Joy', tags: string[], confidence: number } = { type: 'Thought', tags: ['note'], confidence: 0.3 };
    let bestHorizon: string | undefined;

    // Check default rules
    for (const rule of this.defaultRules) {
      const matchCount = rule.keywords.filter(keyword => 
        text.includes(keyword.toLowerCase())
      ).length;
      
      if (matchCount > 0) {
        const confidence = Math.min(0.9, rule.weight * (matchCount / rule.keywords.length));
        if (confidence > bestMatch.confidence) {
          bestMatch = {
            type: rule.type,
            tags: [...rule.tags],
            confidence
          };
          bestHorizon = rule.horizon;
        }
      }
    }

    // Apply user corrections
    for (const correction of this.userCorrections) {
      const matchCount = correction.keywords.filter(keyword => 
        text.includes(keyword.toLowerCase())
      ).length;
      
      if (matchCount > 0) {
        const confidence = Math.min(0.95, 0.8 * (matchCount / correction.keywords.length));
        if (confidence > bestMatch.confidence) {
          bestMatch = {
            type: correction.userChoice.type as any,
            tags: [...correction.userChoice.tags],
            confidence
          };
          bestHorizon = correction.userChoice.horizon;
        }
      }
    }

    // Add source-specific tags
    if (item.source === 'email') {
      bestMatch.tags.push('email');
    } else if (item.source === 'sms') {
      bestMatch.tags.push('sms');
    }

    return {
      ...bestMatch,
      horizon: bestHorizon as any
    };
  }

  async learnFromCorrection(
    originalSuggestion: { type: string; horizon?: string; tags: string[] },
    userChoice: { type: string; horizon?: string; tags: string[] },
    itemText: string
  ) {
    const words = itemText.toLowerCase().split(/\s+/)
      .filter(word => word.length > 3) // Only meaningful words
      .slice(0, 10); // Limit to first 10 words

    const correction: UserCorrection = {
      originalSuggestion,
      userChoice,
      keywords: words,
      timestamp: new Date()
    };

    this.userCorrections.push(correction);

    // Keep only last 50 corrections to prevent memory bloat
    if (this.userCorrections.length > 50) {
      this.userCorrections = this.userCorrections.slice(-50);
    }

    try {
      const settings = await storageService.getSettings() || {
        ttsEnabled: false,
        reducedMotion: false,
        highContrast: false,
        bubbleDensity: 'medium',
        biometricLock: false
      };
      (settings as any).inboxCorrections = this.userCorrections;
      await storageService.updateSettings(settings);
    } catch (error) {
      console.error('Failed to save inbox correction:', error);
    }
  }

  isConfident(confidence: number): boolean {
    return confidence >= this.confidenceThreshold;
  }
}

export const inboxClassifier = new InboxClassifierService();
