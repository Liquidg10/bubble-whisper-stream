import { InboxItem, ClassificationRule } from '@/types/inbox';
import { decisionTraceService } from './decisionTraceService';
import { storageService } from './storage';

interface GmailIntentRule {
  keywords: string[];
  senderPatterns?: string[];
  subjectPatterns?: string[];
  intent: 'meeting_invite' | 'task' | 'bill' | 'confirmation' | 'thought';
  horizon?: 'today' | 'thisWeek' | 'thisMonth' | 'someday';
  tags: string[];
  weight: number;
}

interface EmailMetadata {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  receivedAt: Date;
  threadId?: string;
  snippet?: string;
}

interface IntentClassification {
  intent: 'meeting_invite' | 'task' | 'bill' | 'confirmation' | 'thought';
  confidence: number;
  horizon?: 'today' | 'thisWeek' | 'thisMonth' | 'someday';
  tags: string[];
  reasoning: string;
}

class GmailIntentClassifierService {
  private intentRules: GmailIntentRule[] = [
    // Meeting invites
    {
      keywords: ['meeting', 'call', 'conference', 'zoom', 'teams', 'appointment', 'schedule'],
      subjectPatterns: ['invitation:', 'calendar:', 'meeting:', 'call with'],
      intent: 'meeting_invite',
      horizon: 'thisWeek',
      tags: ['meeting', 'calendar'],
      weight: 0.9
    },
    {
      keywords: ['invite', 'invited', 'join', 'rsvp'],
      senderPatterns: ['calendar-notification@', 'noreply@calendar'],
      intent: 'meeting_invite',
      horizon: 'thisWeek', 
      tags: ['meeting', 'invitation'],
      weight: 0.85
    },

    // Tasks and action items
    {
      keywords: ['action required', 'please review', 'approval needed', 'todo', 'deadline'],
      intent: 'task',
      horizon: 'thisWeek',
      tags: ['task', 'action-required'],
      weight: 0.9
    },
    {
      keywords: ['urgent', 'asap', 'immediate', 'time sensitive'],
      intent: 'task',
      horizon: 'today',
      tags: ['task', 'urgent'],
      weight: 0.95
    },
    {
      keywords: ['follow up', 'follow-up', 'feedback', 'response needed'],
      intent: 'task',
      horizon: 'thisWeek',
      tags: ['task', 'follow-up'],
      weight: 0.8
    },

    // Bills and financial
    {
      keywords: ['invoice', 'bill', 'payment', 'due', 'overdue', 'account statement'],
      senderPatterns: ['billing@', 'accounts@', 'finance@', 'invoices@'],
      intent: 'bill',
      horizon: 'today',
      tags: ['finance', 'bill'],
      weight: 0.9
    },
    {
      keywords: ['subscription', 'renewal', 'auto-pay', 'charge'],
      senderPatterns: ['noreply@', 'billing@'],
      intent: 'bill',
      horizon: 'thisWeek',
      tags: ['finance', 'subscription'],
      weight: 0.85
    },

    // Confirmations
    {
      keywords: ['confirmation', 'confirmed', 'receipt', 'order placed', 'booking confirmed'],
      senderPatterns: ['noreply@', 'no-reply@', 'confirmation@'],
      intent: 'confirmation',
      tags: ['confirmation', 'receipt'],
      weight: 0.8
    },
    {
      keywords: ['shipped', 'delivery', 'tracking', 'package'],
      intent: 'confirmation',
      tags: ['confirmation', 'shipping'],
      weight: 0.75
    },
    {
      keywords: ['welcome', 'account created', 'password reset', 'verification'],
      intent: 'confirmation',
      tags: ['confirmation', 'account'],
      weight: 0.7
    }
  ];

  async classifyEmailMetadata(metadata: EmailMetadata): Promise<IntentClassification> {
    const text = `${metadata.subject} ${metadata.snippet || ''}`.toLowerCase();
    const senderLower = metadata.senderEmail.toLowerCase();
    
    let bestMatch: Omit<IntentClassification, 'reasoning'> = {
      intent: 'thought',
      confidence: 0.3,
      tags: ['email', 'general']
    };

    const matchedRules: { rule: GmailIntentRule; score: number; matches: string[] }[] = [];

    // Evaluate each rule
    for (const rule of this.intentRules) {
      let score = 0;
      const matches: string[] = [];

      // Check keywords in subject and snippet
      const keywordMatches = rule.keywords.filter(keyword => 
        text.includes(keyword.toLowerCase())
      );
      if (keywordMatches.length > 0) {
        score += rule.weight * (keywordMatches.length / rule.keywords.length);
        matches.push(`keywords: ${keywordMatches.join(', ')}`);
      }

      // Check sender patterns
      if (rule.senderPatterns) {
        const senderMatches = rule.senderPatterns.filter(pattern =>
          senderLower.includes(pattern.toLowerCase())
        );
        if (senderMatches.length > 0) {
          score += 0.3;
          matches.push(`sender pattern: ${senderMatches.join(', ')}`);
        }
      }

      // Check subject patterns
      if (rule.subjectPatterns) {
        const subjectMatches = rule.subjectPatterns.filter(pattern =>
          metadata.subject.toLowerCase().includes(pattern.toLowerCase())
        );
        if (subjectMatches.length > 0) {
          score += 0.4;
          matches.push(`subject pattern: ${subjectMatches.join(', ')}`);
        }
      }

      if (score > 0) {
        matchedRules.push({ rule, score, matches });
      }
    }

    // Find best matching rule
    if (matchedRules.length > 0) {
      const best = matchedRules.reduce((prev, current) => 
        current.score > prev.score ? current : prev
      );

      if (best.score > bestMatch.confidence) {
        bestMatch = {
          intent: best.rule.intent,
          confidence: Math.min(0.95, best.score),
          horizon: best.rule.horizon,
          tags: [...best.rule.tags]
        };
      }
    }

    // Add metadata-based tags
    bestMatch.tags.push('email', 'metadata-only');
    
    // Add sender domain as tag if it's a known service
    const domain = metadata.senderEmail.split('@')[1];
    if (domain && this.isKnownServiceDomain(domain)) {
      bestMatch.tags.push(domain.replace('.com', ''));
    }

    // Generate reasoning
    const topMatches = matchedRules
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(m => `${m.rule.intent} (${m.matches.join(', ')})`)
      .join('; ');

    const reasoning = topMatches 
      ? `Classified as ${bestMatch.intent} based on: ${topMatches}`
      : `Default classification as ${bestMatch.intent} - no strong patterns detected`;

    // Create decision trace
    const traceId = decisionTraceService.addTrace({
      feature: 'email',
      signals: [
        {
          type: 'email_metadata',
          value: metadata.subject,
          confidence: bestMatch.confidence,
          source: 'subject_analysis'
        },
        {
          type: 'sender_analysis', 
          value: metadata.senderEmail,
          confidence: 0.7,
          source: 'sender_domain'
        }
      ],
      confidenceThreshold: 0.5,
      finalConfidence: bestMatch.confidence,
      decision: 'suggest',
      action: 'classify_email_intent',
      becauseText: reasoning,
      undoable: false,
      metadata: {
        emailId: metadata.id,
        subject: metadata.subject,
        sender: metadata.senderEmail,
        intent: bestMatch.intent,
        confidence: bestMatch.confidence
      }
    });

    return {
      ...bestMatch,
      reasoning
    };
  }

  private isKnownServiceDomain(domain: string): boolean {
    const knownDomains = [
      'gmail.com', 'outlook.com', 'yahoo.com',
      'stripe.com', 'paypal.com', 'amazon.com',
      'github.com', 'slack.com', 'zoom.us',
      'calendar.google.com', 'teams.microsoft.com'
    ];
    return knownDomains.includes(domain);
  }

  async updateUserCorrection(
    emailId: string,
    originalIntent: string,
    correctedIntent: string,
    metadata: EmailMetadata
  ): Promise<void> {
    // Store user correction for learning
    try {
      const corrections = await this.loadUserCorrections();
      corrections.push({
        emailId,
        originalIntent,
        correctedIntent,
        subject: metadata.subject,
        senderEmail: metadata.senderEmail,
        timestamp: new Date()
      });

      // Keep only last 100 corrections
      if (corrections.length > 100) {
        corrections.splice(0, corrections.length - 100);
      }

      await this.saveUserCorrections(corrections);
    } catch (error) {
      console.error('Failed to save user correction:', error);
    }
  }

  private async loadUserCorrections(): Promise<any[]> {
    try {
      const settings = await storageService.getSettings();
      return (settings as any)?.gmailIntentCorrections || [];
    } catch {
      return [];
    }
  }

  private async saveUserCorrections(corrections: any[]): Promise<void> {
    try {
      const settings = await storageService.getSettings() || {
        ttsEnabled: false,
        reducedMotion: false,
        highContrast: false,
        bubbleDensity: 'medium' as const,
        biometricLock: false
      };
      (settings as any).gmailIntentCorrections = corrections;
      await storageService.updateSettings(settings);
    } catch (error) {
      console.error('Failed to save corrections:', error);
    }
  }

  isHighConfidence(confidence: number): boolean {
    return confidence >= 0.75;
  }

  isMediumConfidence(confidence: number): boolean {
    return confidence >= 0.5 && confidence < 0.75;
  }
}

export const gmailIntentClassifier = new GmailIntentClassifierService();
export type { EmailMetadata, IntentClassification };
