// AI-Powered Text-to-Speech service using OpenAI with Queue Management
import { storageService } from './storage';
import { audioQueueService } from './audioQueue';
import { useBubbleStore } from '@/stores/bubbleStore';

interface TTSSettings {
  enabled: boolean;
  volume: number;
}

interface TTSOptions extends Partial<TTSSettings> {
  tone?: 'compassionate' | 'gentle' | 'encouraging' | 'neutral' | 'professional' | 'celebratory';
  context?: 'banking' | 'financial' | 'companion' | 'ai-conversation' | 'notes' | 'bubble-detail' | 'cbt' | 'therapy' | 'reminders' | 'glimmers' | 'focus-mode' | 'dev-test';
  interrupt?: boolean;
}

class TTSService {
  private settings: TTSSettings = {
    enabled: true,
    volume: 0.8
  };
  private isPlaying: boolean = false;
  private currentAudio: HTMLAudioElement | null = null;

  constructor() {
    this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await storageService.getSettings();
      if (settings) {
        this.settings = { 
          ...this.settings, 
          enabled: settings.ttsEnabled ?? this.settings.enabled 
        };
      }
      console.log('✅ TTS settings loaded:', this.settings);
    } catch (error) {
      console.log('📝 TTS using default settings (storage not ready):', this.settings);
      // Silently continue with default settings - this is normal on first load
    }
  }

  async speak(text: string, options: TTSOptions = {}): Promise<string> {
    if (!text.trim() || !this.settings.enabled) {
      return '';
    }

    console.log('🎤 Queuing AI TTS for:', text.substring(0, 50) + '...', 'context:', options.context, 'tone:', options.tone);
    
    try {
      // Use audio queue for better management
      const queueId = await audioQueueService.enqueue(text, {
        tone: options.tone,
        context: options.context,
        interrupt: options.interrupt,
        priority: options.interrupt ? 10 : 0 // High priority for interrupts
      });
      
      console.log('✅ TTS queued successfully with ID:', queueId);
      return queueId;
    } catch (error) {
      console.error('❌ TTS queueing failed:', error);
      
      // Fallback to browser TTS
      try {
        await this.fallbackToBrowserTTS(text, options);
        return 'browser-fallback';
      } catch (fallbackError) {
        console.error('❌ Browser TTS fallback failed:', fallbackError);
        throw new Error(`All TTS methods failed: ${error.message}`);
      }
    }
  }

  // Browser TTS fallback method
  private async fallbackToBrowserTTS(text: string, options: TTSOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Browser TTS not supported'));
        return;
      }

      console.log('🔄 Using browser TTS fallback for:', text.substring(0, 50) + '...');

      const utterance = new SpeechSynthesisUtterance(text);
      const storeState = useBubbleStore.getState();
      
      utterance.rate = storeState.settings.voiceSpeed || 1.0;
      utterance.volume = options.volume ?? storeState.settings.voiceVolume ?? this.settings.volume;
      
      // Try to match tone with browser voices
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        switch (options.tone) {
          case 'compassionate':
          case 'gentle':
            utterance.voice = voices.find(v => v.name.includes('Female')) || voices[0];
            break;
          case 'professional':
            utterance.voice = voices.find(v => v.name.includes('Male')) || voices[0];
            break;
          default:
            utterance.voice = voices[0];
        }
      }
      
      utterance.onend = () => {
        console.log('✅ Browser TTS completed successfully');
        this.isPlaying = false;
        resolve();
      };
      
      utterance.onerror = (error) => {
        console.error('❌ Browser TTS failed:', error);
        this.isPlaying = false;
        reject(new Error(`Browser TTS failed: ${error.error}`));
      };

      this.isPlaying = true;
      speechSynthesis.speak(utterance);
    });
  }

  async speakCBTReframe(reframe: string): Promise<string> {
    const compassionateText = `Here's a kinder way to think about this: ${reframe}`;
    return this.speak(compassionateText, { tone: 'compassionate', context: 'cbt', interrupt: true });
  }

  stop(): void {
    audioQueueService.stop();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }

  pause(): void {
    audioQueueService.pause();
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
    }
  }

  resume(): void {
    audioQueueService.resume();
    if (this.currentAudio && this.currentAudio.paused) {
      this.currentAudio.play().catch(err => {
        console.error('Failed to resume audio:', err);
      });
    }
  }

  clearQueue(): void {
    audioQueueService.clearQueue();
  }

  skipCurrent(): void {
    audioQueueService.skipCurrent();
  }

  getQueueState() {
    return audioQueueService.getState();
  }

  isAvailable(): boolean {
    return true; // Always available since we use OpenAI TTS
  }
}

export const ttsService = new TTSService();