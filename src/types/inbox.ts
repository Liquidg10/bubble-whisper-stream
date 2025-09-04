export interface InboxItem {
  id: string;
  source: 'email' | 'sms';
  subject?: string;
  snippet: string;
  fullContent: string;
  sender: string;
  receivedAt: Date;
  suggestedType: 'Thought' | 'Task' | 'ReminderNote' | 'Memory' | 'Joy';
  suggestedHorizon?: 'today' | 'thisWeek' | 'thisMonth' | 'someday';
  suggestedTags: string[];
  confidence: number;
  processed: boolean;
  committedAt?: Date;
}

export interface ClassificationRule {
  keywords: string[];
  type: 'Thought' | 'Task' | 'ReminderNote' | 'Memory' | 'Joy';
  horizon?: 'today' | 'thisWeek' | 'thisMonth' | 'someday';
  tags: string[];
  weight: number;
}

export interface UserCorrection {
  originalSuggestion: {
    type: string;
    horizon?: string;
    tags: string[];
  };
  userChoice: {
    type: string;
    horizon?: string;
    tags: string[];
  };
  keywords: string[];
  timestamp: Date;
}