import { supabase } from '@/integrations/supabase/client';

export interface AIReframeResponse {
  success: boolean;
  reframes?: Array<{
    text: string;
    because: string;
  }>;
  fallback?: boolean;
  error?: string;
  model?: string;
}

export interface AIGlimmerResponse {
  success: boolean;
  glimmer?: {
    message: string;
    tone: string;
    trigger: string;
    because: string;
    type: string;
    model: string;
    createdAt: string;
  };
  fallback?: boolean;
  error?: string;
}

export interface AIMonthlySummaryResponse {
  success: boolean;
  summary?: {
    month: string;
    summary: string;
    insights: string[];
    gentleNext: string;
    stats: any;
    model: string;
    generatedAt: string;
  };
  fallback?: boolean;
  error?: string;
}

export interface AIEmbeddingResponse {
  success: boolean;
  embeddings?: Array<{
    embedding: number[];
    index: number;
  }>;
  results?: Array<{
    index: number;
    similarity: number;
    id: string;
    text: string;
  }>;
  fallback?: boolean;
  error?: string;
}

class AIService {
  private isOnline = true;
  private requestQueue: Map<string, Promise<any>> = new Map();

  constructor() {
    // Monitor online status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.isOnline = true);
      window.addEventListener('offline', () => this.isOnline = false);
      this.isOnline = navigator.onLine;
    }
  }

  private async makeRequest<T>(
    functionName: string, 
    payload: any, 
    cacheKey?: string
  ): Promise<T> {
    // If offline, return fallback immediately
    if (!this.isOnline) {
      return { success: false, fallback: true, error: 'Offline' } as T;
    }

    // Check cache for duplicate requests
    if (cacheKey && this.requestQueue.has(cacheKey)) {
      return this.requestQueue.get(cacheKey);
    }

    const request = supabase.functions.invoke(functionName, {
      body: payload,
    }).then(response => {
      if (cacheKey) {
        this.requestQueue.delete(cacheKey);
      }
      
      if (response.error) {
        console.error(`AI ${functionName} error:`, response.error);
        return { success: false, fallback: true, error: response.error.message };
      }
      
      return response.data;
    }).catch(error => {
      if (cacheKey) {
        this.requestQueue.delete(cacheKey);
      }
      console.error(`AI ${functionName} failed:`, error);
      return { success: false, fallback: true, error: error.message };
    });

    if (cacheKey) {
      this.requestQueue.set(cacheKey, request);
    }

    return request;
  }

  async getCBTReframe(
    thought: string, 
    distortions?: string[], 
    tone: string = 'compassionate'
  ): Promise<AIReframeResponse> {
    const cacheKey = `cbt-${thought.slice(0, 50)}`;
    
    return this.makeRequest<AIReframeResponse>('ai-cbt-reframe', {
      thought,
      distortions,
      tone
    }, cacheKey);
  }

  async generateGlimmer(
    trigger: string,
    tone: string = 'friend',
    patterns: any[] = [],
    timeContext: any = {},
    userPreferences: any = {}
  ): Promise<AIGlimmerResponse> {
    return this.makeRequest<AIGlimmerResponse>('ai-glimmer-generate', {
      trigger,
      tone,
      patterns,
      timeContext,
      userPreferences
    });
  }

  async generateMonthlySummary(
    month: string,
    bubbleStats: any = {},
    cbtEntries: any[] = [],
    glimmers: any[] = [],
    patterns: any[] = [],
    auditCount: number = 0,
    preferences: any = {}
  ): Promise<AIMonthlySummaryResponse> {
    return this.makeRequest<AIMonthlySummaryResponse>('ai-monthly-summary', {
      month,
      bubbleStats,
      cbtEntries,
      glimmers,
      patterns,
      auditCount,
      preferences
    });
  }

  async getEmbeddings(texts: string[]): Promise<AIEmbeddingResponse> {
    return this.makeRequest<AIEmbeddingResponse>('ai-embeddings', {
      texts,
      operation: 'embed'
    });
  }

  async searchSimilar(
    query: string,
    embeddings: Array<{ id: string; text: string; embedding: number[] }>
  ): Promise<AIEmbeddingResponse> {
    return this.makeRequest<AIEmbeddingResponse>('ai-embeddings', {
      query,
      embeddings,
      operation: 'similarity'
    });
  }

  isAIAvailable(): boolean {
    return this.isOnline;
  }

  clearCache(): void {
    this.requestQueue.clear();
  }
}

export const aiService = new AIService();