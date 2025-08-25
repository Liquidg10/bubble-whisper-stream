// AI-Powered Text-to-Speech service using OpenAI
import { storageService } from './storage';
import { supabase } from '@/integrations/supabase/client';
import { useBubbleStore } from '@/stores/bubbleStore';

interface TTSSettings {
  enabled: boolean;
  volume: number;
}

interface TTSOptions extends Partial<TTSSettings> {
  tone?: 'compassionate' | 'gentle' | 'encouraging' | 'neutral' | 'professional';
  context?: 'banking' | 'financial' | 'companion' | 'ai-conversation' | 'notes' | 'bubble-detail' | 'cbt' | 'therapy' | 'reminders' | 'glimmers';
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

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!text.trim() || !this.settings.enabled) {
      return;
    }

    if (options.interrupt && this.isPlaying) {
      this.stop();
    }

    console.log('🎤 Using AI TTS for:', text.substring(0, 50) + '...', 'context:', options.context, 'tone:', options.tone);
    
    try {
      await this.speakWithAI(text, options);
      console.log('✅ AI TTS completed successfully');
    } catch (error) {
      console.error('❌ AI TTS failed:', error);
      throw new Error(`TTS failed: ${error.message}`);
    }
  }

  private async speakWithAI(text: string, options: TTSOptions): Promise<void> {
    // Get user voice preferences from store
    const storeState = useBubbleStore.getState();
    const { voicePreferences, globalVoice } = storeState.settings;
    
    // Determine which voice to use based on user preferences
    let selectedVoice = globalVoice; // Default fallback
    if (options.context && voicePreferences[options.context]) {
      selectedVoice = voicePreferences[options.context];
    }

    console.log('📡 Calling AI TTS edge function with:', { 
      textLength: text.length, 
      voice: selectedVoice,
      tone: options.tone || 'neutral',
      context: options.context 
    });

    try {
      const { data, error } = await supabase.functions.invoke('ai-tts-generate', {
        body: {
          text,
          voice: selectedVoice, // Pass user's preferred voice
          tone: options.tone || 'neutral',
          context: options.context
        }
      });

      console.log('📡 Edge function response:', { data: data ? 'received' : 'null', error });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(`Edge function error: ${JSON.stringify(error)}`);
      }

      if (!data || !data.audioContent) {
        throw new Error('No audio content received from edge function');
      }

      console.log('🎵 Creating audio element with base64 data length:', data.audioContent.length);

      // Stop any currently playing audio
      this.stop();

      // Play the audio
      this.currentAudio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      this.currentAudio.volume = options.volume ?? this.settings.volume;
      
      return new Promise((resolve, reject) => {
        if (!this.currentAudio) {
          reject(new Error('Audio element not created'));
          return;
        }

        this.currentAudio.onended = () => {
          console.log('🎵 AI TTS audio playback completed');
          this.isPlaying = false;
          this.currentAudio = null;
          resolve();
        };
        this.currentAudio.onerror = (e) => {
          console.error('🎵 Audio playback error:', e);
          this.isPlaying = false;
          this.currentAudio = null;
          reject(new Error('Audio playback failed - invalid audio data'));
        };
        this.currentAudio.oncanplay = () => {
          console.log('🎵 Audio can play, starting playback');
        };
        
        this.isPlaying = true;
        console.log('🎵 Starting audio playback...');
        this.currentAudio.play().catch(err => {
          console.error('🎵 Audio play() failed:', err);
          this.isPlaying = false;
          this.currentAudio = null;
          reject(err);
        });
      });
    } catch (error) {
      console.error('❌ AI TTS complete failure:', error);
      throw new Error(`AI TTS failed: ${error.message}`);
    }
  }

  async speakCBTReframe(reframe: string): Promise<void> {
    const compassionateText = `Here's a kinder way to think about this: ${reframe}`;
    return this.speak(compassionateText, { tone: 'compassionate', interrupt: true });
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }

  pause(): void {
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
    }
  }

  resume(): void {
    if (this.currentAudio && this.currentAudio.paused) {
      this.currentAudio.play().catch(err => {
        console.error('Failed to resume audio:', err);
      });
    }
  }

  isAvailable(): boolean {
    return true; // Always available since we use OpenAI TTS
  }
}

export const ttsService = new TTSService();