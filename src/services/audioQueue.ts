// Audio Queue Management System
import { supabase } from '@/integrations/supabase/client';
import { useBubbleStore } from '@/stores/bubbleStore';

export interface AudioQueueItem {
  id: string;
  text: string;
  voice?: string;
  tone?: 'compassionate' | 'gentle' | 'encouraging' | 'neutral' | 'professional';
  context?: string;
  audioContent?: string;
  status: 'waiting' | 'loading' | 'ready' | 'playing' | 'completed' | 'failed';
  retryCount: number;
  priority: number;
  timestamp: number;
}

export interface AudioQueueState {
  queue: AudioQueueItem[];
  currentItem: AudioQueueItem | null;
  isPlaying: boolean;
  volume: number;
  isProcessing: boolean;
}

class AudioQueueService {
  private queue: AudioQueueItem[] = [];
  private currentItem: AudioQueueItem | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private isPlaying: boolean = false;
  private isProcessing: boolean = false;
  private listeners: Set<() => void> = new Set();
  private audioCache: Map<string, string> = new Map(); // Cache frequently used audio
  private maxCacheSize = 50;

  constructor() {
    // Initialize cache with common phrases
    this.preloadCommonPhrases();
  }

  // State management for UI updates
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  getState(): AudioQueueState {
    return {
      queue: [...this.queue],
      currentItem: this.currentItem,
      isPlaying: this.isPlaying,
      volume: this.getCurrentVolume(),
      isProcessing: this.isProcessing
    };
  }

  // Add item to queue
  async enqueue(
    text: string, 
    options: {
      voice?: string;
      tone?: string;
      context?: string;
      priority?: number;
      interrupt?: boolean;
    } = {}
  ): Promise<string> {
    const item: AudioQueueItem = {
      id: crypto.randomUUID(),
      text,
      voice: options.voice,
      tone: options.tone as any,
      context: options.context,
      status: 'waiting',
      retryCount: 0,
      priority: options.priority || 0,
      timestamp: Date.now()
    };

    if (options.interrupt) {
      this.clearQueue();
      this.stop();
    }

    // Insert based on priority (higher priority first)
    const insertIndex = this.queue.findIndex(q => q.priority < item.priority);
    if (insertIndex === -1) {
      this.queue.push(item);
    } else {
      this.queue.splice(insertIndex, 0, item);
    }

    this.notifyListeners();
    this.processQueue();
    
    return item.id;
  }

  // Process queue items
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.isPlaying || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.notifyListeners();

    const nextItem = this.queue.shift()!;
    this.currentItem = nextItem;

    try {
      await this.loadAudio(nextItem);
      await this.playAudio(nextItem);
      this.currentItem = null;
    } catch (error) {
      console.error('Failed to process queue item:', error);
      await this.handleFailure(nextItem, error);
    }

    this.isProcessing = false;
    this.notifyListeners();

    // Continue with next item
    setTimeout(() => this.processQueue(), 100);
  }

  // Load audio with caching and retry logic
  private async loadAudio(item: AudioQueueItem): Promise<void> {
    const cacheKey = this.getCacheKey(item);
    
    // Check cache first
    if (this.audioCache.has(cacheKey)) {
      item.audioContent = this.audioCache.get(cacheKey);
      item.status = 'ready';
      this.notifyListeners();
      return;
    }

    item.status = 'loading';
    this.notifyListeners();

    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000]; // Exponential backoff

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const storeState = useBubbleStore.getState();
        const { voicePreferences, globalVoice, voiceSpeed } = storeState.settings;
        
        // Determine voice based on context or use provided voice
        let selectedVoice = item.voice || globalVoice;
        if (!item.voice && item.context && voicePreferences[item.context]) {
          selectedVoice = voicePreferences[item.context];
        }

        const { data, error } = await supabase.functions.invoke('ai-tts-generate', {
          body: {
            text: item.text,
            voice: selectedVoice,
            tone: item.tone || 'neutral',
            context: item.context,
            speed: voiceSpeed || 1.0  // Pass speed from settings
          }
        });

        if (error) throw new Error(`Edge function error: ${JSON.stringify(error)}`);
        if (!data?.audioContent) throw new Error('No audio content received');

        item.audioContent = data.audioContent;
        item.status = 'ready';
        
        // Cache the audio if it's commonly used
        if (this.shouldCache(item)) {
          this.addToCache(cacheKey, data.audioContent);
        }
        
        this.notifyListeners();
        return;

      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        } else {
          // Final attempt failed, try browser TTS fallback
          await this.tryBrowserTTSFallback(item);
          return;
        }
      }
    }
  }

  // Browser TTS fallback
  private async tryBrowserTTSFallback(item: AudioQueueItem): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Browser TTS not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.rate = useBubbleStore.getState().settings.voiceSpeed || 1.0;
      utterance.volume = this.getCurrentVolume();
      
      utterance.onend = () => {
        item.status = 'completed';
        this.notifyListeners();
        resolve();
      };
      
      utterance.onerror = (error) => {
        reject(new Error(`Browser TTS failed: ${error.error}`));
      };

      speechSynthesis.speak(utterance);
      item.status = 'playing';
      this.isPlaying = true;
      this.notifyListeners();
    });
  }

  // Play audio item
  private async playAudio(item: AudioQueueItem): Promise<void> {
    if (!item.audioContent) {
      throw new Error('No audio content to play');
    }

    return new Promise((resolve, reject) => {
      this.currentAudio = new Audio(`data:audio/mp3;base64,${item.audioContent}`);
      this.currentAudio.volume = this.getCurrentVolume();
      
      this.currentAudio.onended = () => {
        item.status = 'completed';
        this.isPlaying = false;
        this.currentAudio = null;
        this.notifyListeners();
        resolve();
      };
      
      this.currentAudio.onerror = () => {
        this.isPlaying = false;
        this.currentAudio = null;
        reject(new Error('Audio playback failed'));
      };
      
      item.status = 'playing';
      this.isPlaying = true;
      this.notifyListeners();
      
      this.currentAudio.play().catch(reject);
    });
  }

  // Handle failed items
  private async handleFailure(item: AudioQueueItem, error: Error): Promise<void> {
    item.status = 'failed';
    item.retryCount++;
    
    console.error(`Audio queue item failed (attempt ${item.retryCount}):`, error);
    
    // Retry up to 2 times for certain errors
    if (item.retryCount < 2 && this.isRetryableError(error)) {
      item.status = 'waiting';
      this.queue.unshift(item); // Add back to front of queue
    }
    
    this.notifyListeners();
  }

  // Cache management
  private getCacheKey(item: AudioQueueItem): string {
    return `${item.text}-${item.voice || 'default'}-${item.tone || 'neutral'}-${useBubbleStore.getState().settings.voiceSpeed || 1.0}`;
  }

  private shouldCache(item: AudioQueueItem): boolean {
    // Cache short, common phrases and greetings
    return item.text.length < 100 || 
           item.text.includes('reminder') || 
           item.text.includes('glimmer') ||
           item.context === 'companion';
  }

  private addToCache(key: string, audioContent: string): void {
    if (this.audioCache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.audioCache.keys().next().value;
      this.audioCache.delete(firstKey);
    }
    this.audioCache.set(key, audioContent);
  }

  private async preloadCommonPhrases(): Promise<void> {
    const commonPhrases = [
      "Here's your reminder",
      "You have a new glimmer",
      "How are you feeling?",
      "That's completed"
    ];

    // Preload these in background after a delay
    setTimeout(async () => {
      for (const phrase of commonPhrases) {
        try {
          await this.enqueue(phrase, { priority: -1 }); // Low priority
        } catch (error) {
          console.log('Failed to preload phrase:', phrase);
        }
      }
    }, 5000);
  }

  // Queue controls
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.isPlaying = false;
    if (this.currentItem) {
      this.currentItem.status = 'failed';
      this.currentItem = null;
    }
    this.notifyListeners();
  }

  pause(): void {
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
      this.isPlaying = false;
      this.notifyListeners();
    }
  }

  resume(): void {
    if (this.currentAudio && this.currentAudio.paused) {
      this.currentAudio.play().then(() => {
        this.isPlaying = true;
        this.notifyListeners();
      }).catch(console.error);
    }
  }

  clearQueue(): void {
    this.queue.length = 0;
    this.notifyListeners();
  }

  skipCurrent(): void {
    this.stop();
    setTimeout(() => this.processQueue(), 100);
  }

  // Utility methods
  private getCurrentVolume(): number {
    return useBubbleStore.getState().settings.voiceVolume || 0.8;
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('network') || 
           message.includes('timeout') || 
           message.includes('edge function');
  }

  // Public getters
  get queueLength(): number {
    return this.queue.length;
  }

  get isActive(): boolean {
    return this.isPlaying || this.isProcessing || this.queue.length > 0;
  }
}

export const audioQueueService = new AudioQueueService();