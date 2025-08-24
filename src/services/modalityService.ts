import { supabase } from '@/integrations/supabase/client';

export interface VoiceTranscriptionResult {
  success: boolean;
  text?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language?: string;
  duration?: number;
  because: string;
  fallback?: boolean;
  error?: string;
}

export interface PhotoAnalysisResult {
  success: boolean;
  analysis?: string;
  analysis_type: 'content' | 'mood';
  because: string;
  fallback?: boolean;
  error?: string;
}

export interface SentimentAnalysisResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  emotions: string[];
  topics: string[];
  because: string;
}

class ModalityService {
  private cache = new Map<string, any>();

  async transcribeVoice(audioBlob: Blob, language = 'en'): Promise<VoiceTranscriptionResult> {
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const binaryString = String.fromCharCode(...uint8Array);
      const base64Audio = btoa(binaryString);

      const cacheKey = `transcribe_${base64Audio.slice(0, 50)}_${language}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const { data, error } = await supabase.functions.invoke('ai-voice-transcribe', {
        body: { audio: base64Audio, language }
      });

      if (error) throw error;

      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Voice transcription failed:', error);
      return {
        success: false,
        fallback: true,
        error: error instanceof Error ? error.message : 'Transcription failed',
        because: 'Voice transcription temporarily unavailable'
      };
    }
  }

  async analyzePhoto(imageData: string, analysisType: 'content' | 'mood' = 'content'): Promise<PhotoAnalysisResult> {
    try {
      const cacheKey = `photo_${imageData.slice(0, 50)}_${analysisType}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const { data, error } = await supabase.functions.invoke('ai-photo-analyze', {
        body: { imageData, analysis_type: analysisType }
      });

      if (error) throw error;

      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Photo analysis failed:', error);
      return {
        success: false,
        fallback: true,
        analysis_type: analysisType,
        error: error instanceof Error ? error.message : 'Photo analysis failed',
        because: 'Photo analysis temporarily unavailable'
      };
    }
  }

  async analyzeSentiment(text: string): Promise<SentimentAnalysisResult> {
    try {
      const cacheKey = `sentiment_${text.slice(0, 100)}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      // Use local sentiment analysis (simple keyword-based for now)
      const result = this.performLocalSentimentAnalysis(text);
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Sentiment analysis failed:', error);
      return {
        sentiment: 'neutral',
        confidence: 0.5,
        emotions: [],
        topics: [],
        because: 'Local sentiment analysis with privacy protection'
      };
    }
  }

  private performLocalSentimentAnalysis(text: string): SentimentAnalysisResult {
    const positiveWords = ['happy', 'joy', 'excited', 'great', 'amazing', 'wonderful', 'love', 'good', 'fantastic', 'awesome'];
    const negativeWords = ['sad', 'angry', 'frustrated', 'terrible', 'awful', 'hate', 'bad', 'horrible', 'disappointed', 'upset'];
    const emotionWords = {
      joy: ['happy', 'joyful', 'excited', 'cheerful'],
      sadness: ['sad', 'down', 'blue', 'melancholy'],
      anger: ['angry', 'furious', 'mad', 'irritated'],
      fear: ['scared', 'afraid', 'worried', 'anxious'],
      calm: ['peaceful', 'relaxed', 'serene', 'tranquil']
    };

    const words = text.toLowerCase().split(/\s+/);
    let positiveScore = 0;
    let negativeScore = 0;
    const detectedEmotions: string[] = [];
    const topics: string[] = [];

    words.forEach(word => {
      if (positiveWords.includes(word)) positiveScore++;
      if (negativeWords.includes(word)) negativeScore++;

      Object.entries(emotionWords).forEach(([emotion, keywords]) => {
        if (keywords.includes(word) && !detectedEmotions.includes(emotion)) {
          detectedEmotions.push(emotion);
        }
      });

      // Simple topic extraction (could be enhanced)
      if (word.length > 5 && !['the', 'and', 'but', 'with', 'from'].includes(word)) {
        topics.push(word);
      }
    });

    const totalScore = positiveScore + negativeScore;
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    let confidence = 0.5;

    if (totalScore > 0) {
      if (positiveScore > negativeScore) {
        sentiment = 'positive';
        confidence = positiveScore / totalScore;
      } else if (negativeScore > positiveScore) {
        sentiment = 'negative';
        confidence = negativeScore / totalScore;
      }
    }

    return {
      sentiment,
      confidence: Math.min(confidence, 0.9), // Cap confidence
      emotions: detectedEmotions.slice(0, 3), // Top 3 emotions
      topics: topics.slice(0, 5), // Top 5 topics
      because: 'Local sentiment analysis with privacy protection'
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const modalityService = new ModalityService();