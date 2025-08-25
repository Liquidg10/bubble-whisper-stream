// Enhanced Text-to-Speech service with compassionate tones
import { storageService } from './storage';
import { supabase } from '@/integrations/supabase/client';

interface TTSSettings {
  enabled: boolean;
  rate: number;
  pitch: number;
  voice?: string;
  volume: number;
}

interface TTSOptions extends Partial<TTSSettings> {
  tone?: 'compassionate' | 'gentle' | 'encouraging' | 'neutral' | 'professional';
  context?: 'banking' | 'financial' | 'companion' | 'ai-conversation' | 'notes' | 'bubble-detail' | 'cbt' | 'therapy' | 'reminders' | 'glimmers';
  interrupt?: boolean;
  useAI?: boolean;
}

class TTSService {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private isSupported = false;
  private settings: TTSSettings = {
    enabled: true,
    rate: 0.9,
    pitch: 1.0,
    volume: 0.8
  };
  private isPlaying: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.isSupported = true;
      this.loadVoices();
      this.loadSettings();
    }
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
    } catch (error) {
      console.warn('Failed to load TTS settings:', error);
    }
  }

  private loadVoices(): void {
    if (!this.synth) return;

    const updateVoices = () => {
      this.voices = this.synth!.getVoices();
    };

    updateVoices();
    
    // Chrome loads voices asynchronously
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = updateVoices;
    }
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!text.trim() || !this.settings.enabled) {
      return;
    }

    if (options.interrupt && this.isPlaying) {
      this.stop();
    }

    // Use AI TTS by default for better quality
    if (options.useAI !== false) {
      console.log('🎤 Attempting AI TTS for:', text.substring(0, 50) + '...', 'context:', options.context, 'tone:', options.tone);
      try {
        await this.speakWithAI(text, options);
        console.log('✅ AI TTS completed successfully');
        return;
      } catch (error) {
        console.error('❌ AI TTS failed:', error);
        console.warn('🔄 Falling back to browser TTS due to AI TTS failure:', error.message);
        // Fall through to browser TTS
      }
    }

    // Browser TTS fallback
    if (!this.isSupported || !this.synth) {
      return;
    }

    return new Promise((resolve, reject) => {
      const adjustedText = this.adjustForTone(text, options.tone);
      const utterance = new SpeechSynthesisUtterance(adjustedText);
      
      utterance.rate = options.tone === 'compassionate' ? 0.8 : (options.rate ?? this.settings.rate);
      utterance.pitch = options.tone === 'gentle' ? 0.9 : (options.pitch ?? this.settings.pitch);
      utterance.volume = options.volume ?? this.settings.volume;

      if (options.voice) {
        const voice = this.voices.find(v => v.name === options.voice);
        if (voice) utterance.voice = voice;
      }

      utterance.onstart = () => { this.isPlaying = true; };
      utterance.onend = () => { this.isPlaying = false; resolve(); };
      utterance.onerror = (event) => { this.isPlaying = false; reject(new Error(`TTS Error: ${event.error}`)); };

      this.synth!.speak(utterance);
    });
  }

  private async speakWithAI(text: string, options: TTSOptions): Promise<void> {
    console.log('📡 Calling AI TTS edge function with:', { 
      textLength: text.length, 
      voice: options.voice, 
      tone: options.tone || 'neutral',
      context: options.context 
    });

    try {
      const { data, error } = await supabase.functions.invoke('ai-tts-generate', {
        body: {
          text,
          voice: options.voice,
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

      // Play the audio
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audio.volume = options.volume ?? this.settings.volume;
      
      return new Promise((resolve, reject) => {
        audio.onended = () => {
          console.log('🎵 AI TTS audio playback completed');
          this.isPlaying = false;
          resolve();
        };
        audio.onerror = (e) => {
          console.error('🎵 Audio playback error:', e);
          this.isPlaying = false;
          reject(new Error('Audio playback failed - invalid audio data'));
        };
        audio.oncanplay = () => {
          console.log('🎵 Audio can play, starting playback');
        };
        
        this.isPlaying = true;
        console.log('🎵 Starting audio playback...');
        audio.play().catch(err => {
          console.error('🎵 Audio play() failed:', err);
          this.isPlaying = false;
          reject(err);
        });
      });
    } catch (error) {
      console.error('❌ AI TTS complete failure:', error);
      throw new Error(`AI TTS failed: ${error.message}`);
    }
  }

  private adjustForTone(text: string, tone: string = 'neutral'): string {
    switch (tone) {
      case 'compassionate':
        return text.replace(/\./g, '... ').replace(/,/g, ', ');
      case 'gentle':
        return text.replace(/\!/g, '.').replace(/\?/g, '... ');
      default:
        return text;
    }
  }

  async speakCBTReframe(reframe: string): Promise<void> {
    const compassionateText = `Here's a kinder way to think about this: ${reframe}`;
    return this.speak(compassionateText, { tone: 'compassionate', interrupt: true });
  }

  stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
  }

  pause(): void {
    if (this.synth) {
      this.synth.pause();
    }
  }

  resume(): void {
    if (this.synth) {
      this.synth.resume();
    }
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  isAvailable(): boolean {
    return this.isSupported;
  }
}

export const ttsService = new TTSService();