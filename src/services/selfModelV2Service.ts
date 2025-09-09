import { storageService } from './storage';

export interface SelfModelV2 {
  id: 'self';
  layers: {
    surface: boolean;   // Basic preferences, accessible
    context: boolean;   // Patterns, routines, opt-in
    deep: boolean;      // Sensitive triggers, biometric-gated
  };
  preferences: Record<string, unknown>;
  routines: { name: string; timeOfDay?: string }[];
  medicationTimes: { name: string; at: string }[];
  triggers: string[];
  lastReviewAt?: number;
  version: number;
}

export interface SelfModelAudit {
  id: string;
  at: number;
  change: string;           // JSON diff summary
  layer: 'surface' | 'context' | 'deep';
  userConfirmed: boolean;
  previousVersion?: number;
}

export interface PatternHint {
  id: string;
  key: string;              // e.g., 'overwhelmed_afternoon'
  value: string;            // e.g., 'true'
  confidence: number;       // 0..1
  lastUpdated: number;
  layer: 'surface' | 'context' | 'deep';
}

export interface MonthlyReview {
  id: string;
  month: string;           // YYYY-MM format
  createdAt: number;
  changes: SelfModelAudit[];
  archivedPatterns: PatternHint[];
  userNotes?: string;
  insights?: string[];
  stats?: {
    totalAudits?: number;
    confirmedAudits?: number;
    newPatterns?: number;
    strengthenedPatterns?: number;
    cbtEntries?: number;
    glimmersReceived?: number;
  };
}

class SelfModelV2Service {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;
    this.db = await storageService.getDatabase();
  }

  async getSelfModel(): Promise<SelfModelV2> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['self_model_v2'], 'readonly');
    const store = transaction.objectStore('self_model_v2');
    const request = store.get('self');
    
    const result = await this.promisifyRequest(request);
    
    if (result) {
      return result;
    }
    
    // Create default self model
    const defaultModel: SelfModelV2 = {
      id: 'self',
      layers: {
        surface: true,
        context: false,
        deep: false
      },
      preferences: {},
      routines: [],
      medicationTimes: [],
      triggers: [],
      version: 1
    };
    
    await this.updateSelfModel(defaultModel);
    return defaultModel;
  }

  async updateSelfModel(model: Partial<SelfModelV2>, layer: 'surface' | 'context' | 'deep' = 'surface'): Promise<void> {
    await this.initialize();
    
    const currentModel = await this.getSelfModel();
    const updatedModel = { 
      ...currentModel, 
      ...model,
      version: currentModel.version + 1
    };
    
    // Create audit entry
    const audit: SelfModelAudit = {
      id: `audit-${Date.now()}`,
      at: Date.now(),
      change: JSON.stringify({
        layer,
        changes: Object.keys(model),
        previousVersion: currentModel.version
      }),
      layer,
      userConfirmed: false,
      previousVersion: currentModel.version
    };
    
    const transaction = this.db!.transaction(['self_model_v2', 'self_model_audits'], 'readwrite');
    
    // Update model
    const modelStore = transaction.objectStore('self_model_v2');
    modelStore.put(updatedModel);
    
    // Save audit
    const auditStore = transaction.objectStore('self_model_audits');
    auditStore.add(audit);
    
    await this.promisifyRequest(transaction);
  }

  async confirmAudit(auditId: string): Promise<void> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['self_model_audits'], 'readwrite');
    const store = transaction.objectStore('self_model_audits');
    
    const getRequest = store.get(auditId);
    const audit = await this.promisifyRequest(getRequest);
    
    if (audit) {
      audit.userConfirmed = true;
      store.put(audit);
    }
    
    await this.promisifyRequest(transaction);
  }

  async getAudits(limit: number = 50): Promise<SelfModelAudit[]> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['self_model_audits'], 'readonly');
    const store = transaction.objectStore('self_model_audits');
    const index = store.index('at');
    
    const request = index.openCursor(null, 'prev');
    const audits: SelfModelAudit[] = [];
    
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor && audits.length < limit) {
          audits.push(cursor.value);
          cursor.continue();
        } else {
          resolve(audits);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async addPatternHint(hint: Omit<PatternHint, 'id' | 'lastUpdated'>): Promise<PatternHint> {
    await this.initialize();
    
    const fullHint: PatternHint = {
      ...hint,
      id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      lastUpdated: Date.now()
    };
    
    const transaction = this.db!.transaction(['pattern_hints'], 'readwrite');
    const store = transaction.objectStore('pattern_hints');
    store.add(fullHint);
    
    await this.promisifyRequest(transaction);
    return fullHint;
  }

  async getPatternHints(): Promise<PatternHint[]> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['pattern_hints'], 'readonly');
    const store = transaction.objectStore('pattern_hints');
    const request = store.getAll();
    
    return this.promisifyRequest(request);
  }

  async decayPatterns(): Promise<void> {
    await this.initialize();
    
    const patterns = await this.getPatternHints();
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    
    const transaction = this.db!.transaction(['pattern_hints'], 'readwrite');
    const store = transaction.objectStore('pattern_hints');
    
    for (const pattern of patterns) {
      const age = now - pattern.lastUpdated;
      const decay = Math.max(0.1, 1 - (age / (4 * oneWeek))); // Decay over 4 weeks
      
      if (pattern.confidence * decay < 0.2) {
        // Remove very low confidence patterns
        store.delete(pattern.id);
      } else {
        // Update confidence
        pattern.confidence *= decay;
        store.put(pattern);
      }
    }
    
    await this.promisifyRequest(transaction);
  }

  async generateMonthlyReview(): Promise<MonthlyReview> {
    await this.initialize();
    
    console.log('Generating monthly review...');
    
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    try {
      // Get audits from this month
      const audits = await this.getAudits();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const monthAudits = audits.filter(a => a.at >= monthStart);
      
      console.log(`Found ${monthAudits.length} audits for this month`);
      
      // Get patterns that should be archived (low confidence, old)
      const patterns = await this.getPatternHints();
      const archivedPatterns = patterns.filter(p => 
        p.confidence < 0.3 && Date.now() - p.lastUpdated > 30 * 24 * 60 * 60 * 1000
      );
      
      console.log(`Found ${patterns.length} patterns, ${archivedPatterns.length} to archive`);
      
      // Enhanced local insights with fallback
      let insights = [
        `You made ${monthAudits.length} updates to your self-model this month`,
        'Your patterns continue to evolve',
        'Growth happens in small steps'
      ];

      // Add pattern-based insights
      if (patterns.length > 0) {
        const highConfidencePatterns = patterns.filter(p => p.confidence > 0.7);
        if (highConfidencePatterns.length > 0) {
          insights.push(`You have ${highConfidencePatterns.length} strong behavioral patterns identified`);
        }
      }

      try {
        const { aiService } = await import('./aiService');
        if (aiService.isAIAvailable()) {
          console.log('Attempting AI-powered summary...');
          const response = await aiService.generateMonthlySummary(
            month,
            {},
            [],
            [],
            patterns,
            monthAudits.length
          );

          if (response.success && response.summary) {
            insights = response.summary.insights || insights;
            console.log('AI summary successful');
          }
        }
      } catch (error) {
        console.warn('AI monthly summary failed, using local insights:', error);
      }

      const review: MonthlyReview = {
        id: `review-${month}`,
        month,
        createdAt: Date.now(),
        changes: monthAudits,
        archivedPatterns,
        userNotes: '',
        insights,
        stats: {
          totalAudits: monthAudits.length,
          confirmedAudits: monthAudits.filter(a => a.userConfirmed).length,
          newPatterns: patterns.filter(p => Date.now() - p.lastUpdated < 7 * 24 * 60 * 60 * 1000).length,
          strengthenedPatterns: patterns.filter(p => p.confidence > 0.8).length
        }
      };
      
      const transaction = this.db!.transaction(['monthly_reviews'], 'readwrite');
      const store = transaction.objectStore('monthly_reviews');
      store.put(review);
      
      await this.promisifyRequest(transaction);
      console.log('Monthly review generated successfully');
      return review;
    } catch (error) {
      console.error('Failed to generate monthly review:', error);
      
      // Return minimal review on error
      const fallbackReview: MonthlyReview = {
        id: `review-${month}-fallback`,
        month,
        createdAt: Date.now(),
        changes: [],
        archivedPatterns: [],
        userNotes: '',
        insights: ['Monthly review temporarily unavailable', 'Your data is safe and will be included in future reviews']
      };
      
      return fallbackReview;
    }
  }

  async getMonthlyReview(month: string): Promise<MonthlyReview | null> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['monthly_reviews'], 'readonly');
    const store = transaction.objectStore('monthly_reviews');
    const request = store.get(`review-${month}`);
    
    return this.promisifyRequest(request);
  }

  async archivePattern(patternId: string, reason: string): Promise<void> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['pattern_hints', 'self_model_audits'], 'readwrite');
    
    // Remove pattern
    const patternStore = transaction.objectStore('pattern_hints');
    patternStore.delete(patternId);
    
    // Create audit entry
    const audit: SelfModelAudit = {
      id: `audit-archive-${Date.now()}`,
      at: Date.now(),
      change: JSON.stringify({
        action: 'archive_pattern',
        patternId,
        reason
      }),
      layer: 'context',
      userConfirmed: true
    };
    
    const auditStore = transaction.objectStore('self_model_audits');
    auditStore.add(audit);
    
    await this.promisifyRequest(transaction);
  }

  async exportData(includeDeepLayer: boolean = false): Promise<string> {
    await this.initialize();
    
    const model = await this.getSelfModel();
    const audits = await this.getAudits();
    const patterns = await this.getPatternHints();
    
    const exportData = {
      selfModel: includeDeepLayer ? model : {
        ...model,
        triggers: model.layers.deep ? [] : model.triggers
      },
      audits: includeDeepLayer ? audits : audits.filter(a => a.layer !== 'deep'),
      patterns: includeDeepLayer ? patterns : patterns.filter(p => p.layer !== 'deep'),
      exportedAt: Date.now(),
      includesDeepLayer: includeDeepLayer
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  private promisifyRequest<T>(request: IDBRequest<T> | IDBTransaction): Promise<T> {
    return new Promise((resolve, reject) => {
      if ('result' in request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } else {
        request.oncomplete = () => resolve(undefined as T);
        request.onerror = () => reject(request.error);
      }
    });
  }
}

export const selfModelV2Service = new SelfModelV2Service();