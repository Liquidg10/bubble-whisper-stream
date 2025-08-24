// CBT (Cognitive Behavioral Therapy) Support Service
// Provides guided reframing tools with anti-shame, supportive copy

import { CBTEntry, DistortionKey } from '@/types/bubble';
import { storageService } from './storage';

// Cognitive distortion definitions with supportive descriptions
export const DISTORTION_DEFINITIONS: Record<DistortionKey, {
  label: string;
  description: string;
  example: string;
}> = {
  AllOrNothing: {
    label: "All-or-Nothing",
    description: "Seeing things in extremes without middle ground",
    example: "If I'm not perfect, I'm a complete failure"
  },
  Catastrophizing: {
    label: "Catastrophizing", 
    description: "Imagining the worst possible outcome",
    example: "One mistake means everything will fall apart"
  },
  Overgeneralization: {
    label: "Overgeneralization",
    description: "Drawing broad conclusions from single events",
    example: "This always happens to me"
  },
  MindReading: {
    label: "Mind Reading",
    description: "Assuming we know what others are thinking",
    example: "They think I'm incompetent"
  },
  ShouldStatements: {
    label: "Should Statements",
    description: "Setting unrealistic expectations with 'should' or 'must'",
    example: "I should be able to handle everything perfectly"
  },
  Labeling: {
    label: "Labeling",
    description: "Defining ourselves or others with harsh labels",
    example: "I'm such an idiot"
  },
  EmotionalReasoning: {
    label: "Emotional Reasoning",
    description: "Believing feelings reflect reality",
    example: "I feel overwhelmed, so I must be failing"
  },
  FortuneTelling: {
    label: "Fortune Telling",
    description: "Predicting negative outcomes without evidence",
    example: "I know this won't work out"
  },
  DisqualifyingPositive: {
    label: "Disqualifying the Positive",
    description: "Dismissing good things that happen",
    example: "That compliment doesn't count"
  }
};

// Guided prompts for reframing (supportive, non-clinical)
export const REFRAME_PROMPTS = {
  evidenceFor: [
    "What experiences make this thought feel true?",
    "What evidence supports this way of thinking?",
    "When have you felt this way before?"
  ],
  evidenceAgainst: [
    "What experiences challenge this thought?",
    "What would you tell a friend having this thought?",
    "Are there other ways to see this situation?"
  ],
  balancedView: [
    "What's a gentler way to think about this?",
    "How might you see this differently in a year?",
    "What's a more balanced perspective?"
  ]
};

class CBTService {
  private db: IDBDatabase | null = null;

  async initialize() {
    if (!this.db) {
      await storageService.initialize();
      this.db = (storageService as any).db;
    }
  }

  async createEntry(entry: Omit<CBTEntry, 'id' | 'createdAt'>): Promise<CBTEntry> {
    await this.initialize();
    
    const cbtEntry: CBTEntry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      ...entry
    };

    const transaction = this.db!.transaction(['cbt_entries'], 'readwrite');
    const store = transaction.objectStore('cbt_entries');
    await this.promisifyRequest(store.add(cbtEntry));

    return cbtEntry;
  }

  async getEntry(id: string): Promise<CBTEntry | null> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['cbt_entries'], 'readonly');
    const store = transaction.objectStore('cbt_entries');
    const result = await this.promisifyRequest(store.get(id));
    
    return result || null;
  }

  async getAllEntries(): Promise<CBTEntry[]> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['cbt_entries'], 'readonly');
    const store = transaction.objectStore('cbt_entries');
    const result = await this.promisifyRequest(store.getAll());
    
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateEntry(entry: CBTEntry): Promise<void> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['cbt_entries'], 'readwrite');
    const store = transaction.objectStore('cbt_entries');
    await this.promisifyRequest(store.put(entry));
  }

  async deleteEntry(id: string): Promise<void> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['cbt_entries'], 'readwrite');
    const store = transaction.objectStore('cbt_entries');
    await this.promisifyRequest(store.delete(id));
  }

  // Get entries linked to a specific bubble
  async getEntriesForBubble(bubbleId: string): Promise<CBTEntry[]> {
    const allEntries = await this.getAllEntries();
    return allEntries.filter(entry => entry.bubbleId === bubbleId);
  }

  // Suggest potential distortions based on thought content (simple pattern matching)
  suggestDistortions(thought: string): DistortionKey[] {
    const suggestions: DistortionKey[] = [];
    const lowerThought = thought.toLowerCase();

    // Simple pattern matching for common distortion keywords
    const patterns: Record<DistortionKey, string[]> = {
      AllOrNothing: ['always', 'never', 'completely', 'totally', 'perfect', 'failure'],
      Catastrophizing: ['disaster', 'terrible', 'awful', 'worst', 'ruin', 'destroy'],
      Overgeneralization: ['always happens', 'every time', 'nothing ever', 'everyone'],
      MindReading: ['they think', 'they must think', 'they probably think'],
      ShouldStatements: ['should', 'must', 'have to', 'ought to'],
      Labeling: ['i am a', "i'm a", 'such a', 'total'],
      EmotionalReasoning: ['feel like', 'feel so', 'must be because i feel'],
      FortuneTelling: ['will never', 'going to fail', 'bound to', 'destined to'],
      DisqualifyingPositive: ["doesn't count", "doesn't matter", 'just luck', 'not really']
    };

    Object.entries(patterns).forEach(([distortion, keywords]) => {
      if (keywords.some(keyword => lowerThought.includes(keyword))) {
        suggestions.push(distortion as DistortionKey);
      }
    });

    return suggestions;
  }

  // Generate supportive reframe suggestions with AI enhancement
  async generateReframeSuggestions(thought: string, distortions: DistortionKey[]): Promise<string[]> {
    // Try AI first for personalized reframes
    try {
      const { aiService } = await import('./aiService');
      if (aiService.isAIAvailable()) {
        const response = await aiService.getCBTReframe(thought, distortions);
        if (response.success && response.reframes) {
          return response.reframes.map(r => r.text);
        }
      }
    } catch (error) {
      console.warn('AI reframe generation failed, using local templates:', error);
    }

    // Local fallback with updated distortion mapping
    const suggestions: string[] = [];

    if (distortions.includes('AllOrNothing')) {
      suggestions.push("What if there's a middle ground here?");
      suggestions.push("Can you find some gray area in this situation?");
    }

    if (distortions.includes('Catastrophizing')) {
      suggestions.push("What's the most likely outcome, not the worst case?");
      suggestions.push("How might this look less scary from a friend's perspective?");
    }

    if (distortions.includes('Overgeneralization')) {
      suggestions.push("Is this really 'always' or just this time?");
      suggestions.push("What are some times when this wasn't true?");
    }

    if (distortions.includes('MindReading')) {
      suggestions.push("What evidence do you have for what they're thinking?");
      suggestions.push("Could there be other explanations for their behavior?");
    }

    // Add more gentle, default suggestions
    suggestions.push("How would you comfort a friend having this thought?");
    suggestions.push("What would you say to yourself on a good day?");
    suggestions.push("What's one small step that might help?");

    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const cbtService = new CBTService();