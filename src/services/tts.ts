// Enhanced Text-to-Speech service with compassionate tones
import { storageService } from './storage';

interface TTSSettings {
  enabled: boolean;
  rate: number;
  pitch: number;
  voice?: string;
  volume: number;
}

interface TTSOptions extends Partial<TTSSettings> {
  tone?: 'compassionate' | 'gentle' | 'encouraging' | 'neutral';
  interrupt?: boolean;
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
    if (!this.isSupported || !this.synth || !text.trim() || !this.settings.enabled) {
      return;
    }

    if (options.interrupt && this.isPlaying) {
      this.stop();
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