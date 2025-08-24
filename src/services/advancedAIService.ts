import { supabase } from '@/integrations/supabase/client';

export interface VoiceTranscriptionOptions {
  language?: string;
  includeTimestamps?: boolean;
}

export interface VoiceTranscriptionResult {
  success: boolean;
  text?: string;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  language?: string;
  duration?: number;
  fallback?: boolean;
  error?: string;
  because?: string;
}

export interface PatternAnalysisOptions {
  operation?: 'analyze' | 'sentiment' | 'categorize' | 'similar';
  contentType?: 'bubble' | 'cbt' | 'voice' | 'sketch';
  context?: {
    bubbleCount?: number;
    recentMoods?: string[];
    timeOfDay?: string;
  };
}

export interface PatternAnalysisResult {
  success: boolean;
  operation: string;
  analysis?: {
    patterns?: string[];
    insights?: string[];
    suggestions?: string[];
    sentiment?: string;
    emotions?: string[];
    intensity?: number;
    category?: string;
    tags?: string[];
    themes?: string[];
    confidence?: number;
  };
  fallback?: boolean;
  error?: string;
  because?: string;
}

class AdvancedAIService {
  private isOnline = true;
  private requestCache = new Map<string, any>();

  constructor() {
    // Monitor online status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.isOnline = true);
      window.addEventListener('offline', () => this.isOnline = false);
      this.isOnline = navigator.onLine;
    }
  }

  async transcribeVoice(
    audioBlob: Blob,
    options: VoiceTranscriptionOptions = {}
  ): Promise<VoiceTranscriptionResult> {
    if (!this.isOnline) {
      return {
        success: false,
        fallback: true,
        error: 'Voice transcription requires internet connection'
      };
    }

    try {
      // Convert blob to base64
      const base64Audio = await this.blobToBase64(audioBlob);
      
      const response = await supabase.functions.invoke('ai-voice-transcribe', {
        body: {
          audio: base64Audio,
          language: options.language || 'en'
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return response.data;

    } catch (error) {
      console.error('Voice transcription failed:', error);
      return {
        success: false,
        fallback: true,
        error: error instanceof Error ? error.message : 'Transcription failed'
      };
    }
  }

  async analyzePatterns(
    content: string,
    options: PatternAnalysisOptions = {}
  ): Promise<PatternAnalysisResult> {
    if (!this.isOnline) {
      return this.localPatternAnalysis(content, options);
    }

    // Check cache first
    const cacheKey = `pattern-${content.slice(0, 50)}-${options.operation}`;
    if (this.requestCache.has(cacheKey)) {
      return this.requestCache.get(cacheKey);
    }

    try {
      const response = await supabase.functions.invoke('ai-pattern-analysis', {
        body: {
          content,
          contentType: options.contentType || 'bubble',
          operation: options.operation || 'analyze',
          bubbleCount: options.context?.bubbleCount || 0,
          recentMoods: options.context?.recentMoods || [],
          timeContext: {
            timeOfDay: options.context?.timeOfDay || this.getTimeOfDay()
          }
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Cache successful results
      this.requestCache.set(cacheKey, response.data);
      
      // Clear old cache entries
      if (this.requestCache.size > 50) {
        const firstKey = this.requestCache.keys().next().value;
        this.requestCache.delete(firstKey);
      }

      return response.data;

    } catch (error) {
      console.error('AI pattern analysis failed:', error);
      return this.localPatternAnalysis(content, options);
    }
  }

  async analyzeSentiment(content: string): Promise<PatternAnalysisResult> {
    return this.analyzePatterns(content, { operation: 'sentiment' });
  }

  async categorizeContent(content: string, contentType?: string): Promise<PatternAnalysisResult> {
    return this.analyzePatterns(content, { 
      operation: 'categorize',
      contentType: contentType as any
    });
  }

  async findSimilarThemes(content: string): Promise<PatternAnalysisResult> {
    return this.analyzePatterns(content, { operation: 'similar' });
  }

  // Voice recording utilities
  async startVoiceRecording(): Promise<MediaRecorder | null> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('Voice recording not supported in this browser');
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      return mediaRecorder;

    } catch (error) {
      console.error('Failed to start voice recording:', error);
      return null;
    }
  }

  async stopVoiceRecording(mediaRecorder: MediaRecorder): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const chunks: BlobPart[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        resolve(blob);
      };

      mediaRecorder.onerror = (event) => {
        reject(new Error('Recording failed'));
      };

      mediaRecorder.stop();
      
      // Stop all tracks
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    });
  }

  // Local fallback methods
  private localPatternAnalysis(
    content: string,
    options: PatternAnalysisOptions
  ): PatternAnalysisResult {
    const words = content.toLowerCase().split(/\s+/);
    
    // Simple sentiment analysis
    const positiveWords = ['good', 'great', 'happy', 'joy', 'love', 'success', 'wonderful', 'amazing'];
    const negativeWords = ['bad', 'sad', 'angry', 'terrible', 'hate', 'failure', 'awful', 'horrible'];
    
    const positiveCount = words.filter(w => positiveWords.includes(w)).length;
    const negativeCount = words.filter(w => negativeWords.includes(w)).length;
    
    let sentiment = 'neutral';
    if (positiveCount > negativeCount) sentiment = 'positive';
    if (negativeCount > positiveCount) sentiment = 'negative';
    
    // Simple categorization
    const categories = {
      work: ['work', 'job', 'meeting', 'project', 'deadline', 'boss'],
      personal: ['family', 'friend', 'relationship', 'home', 'personal'],
      health: ['health', 'doctor', 'exercise', 'tired', 'energy', 'sleep'],
      emotion: ['feel', 'emotion', 'mood', 'happy', 'sad', 'angry', 'anxious']
    };
    
    let category = 'general';
    let maxMatches = 0;
    
    Object.entries(categories).forEach(([cat, keywords]) => {
      const matches = words.filter(w => keywords.includes(w)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        category = cat;
      }
    });

    return {
      success: true,
      operation: options.operation || 'analyze',
      analysis: {
        sentiment,
        category,
        patterns: [`Local analysis: ${sentiment} sentiment detected`],
        insights: ['Pattern analysis using local processing'],
        confidence: 0.6,
        emotions: sentiment === 'positive' ? ['optimistic'] : 
                 sentiment === 'negative' ? ['concerned'] : ['neutral']
      },
      fallback: true,
      because: 'Using local pattern analysis while AI is unavailable'
    };
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  isAIAvailable(): boolean {
    return this.isOnline;
  }

  clearCache(): void {
    this.requestCache.clear();
  }
}

export const advancedAIService = new AdvancedAIService();