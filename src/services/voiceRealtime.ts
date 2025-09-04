/**
 * Full-duplex realtime voice service with streaming STT/TTS and barge-in
 * Uses OpenAI Realtime API with WebSocket connection
 */

export interface VoiceSessionConfig {
  voice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';
  instructions?: string;
  temperature?: number;
  interruptionEnabled?: boolean;
  vadThreshold?: number;
  silenceDuration?: number;
}

export interface PartialTranscript {
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
}

export interface AudioMetrics {
  inputLevel: number;
  outputLevel: number;
  latencyMs: number;
  vadState: 'speaking' | 'silence';
}

export type SessionState = 'disconnected' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'processing';

interface VoiceRealtimeCallbacks {
  onPartialTranscript?: (transcript: PartialTranscript) => void;
  onFinalTranscript?: (transcript: string) => void;
  onAudioMetrics?: (metrics: AudioMetrics) => void;
  onStateChange?: (state: SessionState) => void;
  onError?: (error: Error) => void;
  onTTSStart?: () => void;
  onTTSEnd?: () => void;
}

class VoiceRealtimeService {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  private state: SessionState = 'disconnected';
  private callbacks: VoiceRealtimeCallbacks = {};
  private sessionId: string | null = null;
  private currentConfig: VoiceSessionConfig = {};
  
  // Audio metrics
  private inputLevel = 0;
  private outputLevel = 0;
  private lastLatencyCheck = 0;
  private vadState: 'speaking' | 'silence' = 'silence';
  
  // Performance tracking
  private metrics = {
    sttFirstToken: 0,
    sttFinalization: 0,
    ttsStart: 0,
    bargeInLatency: 0
  };

  constructor() {
    this.setupAudioContext();
  }

  private async setupAudioContext() {
    try {
      this.audioContext = new AudioContext({
        sampleRate: 24000,
        latencyHint: 'interactive'
      });
    } catch (error) {
      console.error('Failed to setup audio context:', error);
    }
  }

  async startSession(config: VoiceSessionConfig = {}): Promise<string> {
    if (this.state !== 'disconnected') {
      throw new Error('Session already active');
    }

    this.currentConfig = {
      voice: 'alloy',
      instructions: 'You are a helpful voice assistant. Be concise and natural.',
      temperature: 0.8,
      interruptionEnabled: true,
      vadThreshold: 0.5,
      silenceDuration: 1000,
      ...config
    };

    this.setState('connecting');

    try {
      // Request microphone permission
      await this.setupMicrophone();
      
      // Connect to WebSocket relay
      await this.connectWebSocket();
      
      this.sessionId = crypto.randomUUID();
      this.setState('connected');
      
      console.log('🎤 Realtime voice session started:', this.sessionId);
      return this.sessionId;
      
    } catch (error) {
      this.setState('disconnected');
      this.cleanup();
      throw new Error(`Failed to start voice session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async stopSession(): Promise<void> {
    if (this.state === 'disconnected') return;

    console.log('🛑 Stopping realtime voice session');
    
    this.setState('disconnected');
    await this.cleanup();
    this.sessionId = null;
  }

  private async setupMicrophone(): Promise<void> {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (!this.audioContext) {
        await this.setupAudioContext();
      }

      if (this.audioContext && this.audioStream) {
        this.source = this.audioContext.createMediaStreamSource(this.audioStream);
        this.processor = this.audioContext.createScriptProcessor(1024, 1, 1);
        
        this.processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          this.processAudioInput(new Float32Array(inputData));
        };
        
        this.source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
      }
    } catch (error) {
      throw new Error('Microphone access denied or unavailable');
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      // Note: In production, replace with your actual Supabase project ref
      const wsUrl = `wss://your-project-ref.functions.supabase.co/ai-realtime-voice`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('📡 WebSocket connected');
        this.sendSessionConfig();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        console.log('📡 WebSocket disconnected');
        if (this.state !== 'disconnected') {
          this.callbacks.onError?.(new Error('WebSocket connection lost'));
        }
      };
    });
  }

  private sendSessionConfig(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.currentConfig.instructions,
        voice: this.currentConfig.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: this.currentConfig.vadThreshold,
          prefix_padding_ms: 300,
          silence_duration_ms: this.currentConfig.silenceDuration
        },
        temperature: this.currentConfig.temperature,
        max_response_output_tokens: 'inf'
      }
    };

    this.ws.send(JSON.stringify(sessionUpdate));
    console.log('⚙️ Session config sent');
  }

  private processAudioInput(audioData: Float32Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Calculate input level for VU meter
    this.inputLevel = this.calculateAudioLevel(audioData);
    
    // Update VAD state
    const speaking = this.inputLevel > (this.currentConfig.vadThreshold || 0.01);
    if (speaking !== (this.vadState === 'speaking')) {
      this.vadState = speaking ? 'speaking' : 'silence';
      this.updateMetrics();
    }

    // Encode and send audio
    const encodedAudio = this.encodeAudioForAPI(audioData);
    this.ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: encodedAudio
    }));
  }

  private encodeAudioForAPI(float32Array: Float32Array): string {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    const chunkSize = 0x8000;
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    return btoa(binary);
  }

  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'session.created':
          console.log('✅ Session created');
          break;
          
        case 'session.updated':
          console.log('⚙️ Session updated');
          break;
          
        case 'input_audio_buffer.speech_started':
          this.setState('speaking');
          if (this.currentConfig.interruptionEnabled) {
            this.interruptTTS();
          }
          break;
          
        case 'input_audio_buffer.speech_stopped':
          this.setState('processing');
          break;
          
        case 'conversation.item.input_audio_transcription.completed':
          const transcript = data.transcript || '';
          this.callbacks.onFinalTranscript?.(transcript);
          break;
          
        case 'response.audio_transcript.delta':
          const partialText = data.delta || '';
          if (partialText.trim()) {
            this.callbacks.onPartialTranscript?.(
              {
                text: partialText,
                confidence: 0.9, // OpenAI doesn't provide confidence
                isFinal: false,
                timestamp: Date.now()
              }
            );
          }
          break;
          
        case 'response.audio.delta':
          this.playAudioDelta(data.delta);
          break;
          
        case 'response.audio.done':
          this.setState('listening');
          this.callbacks.onTTSEnd?.(
          );
          break;
          
        case 'response.created':
          this.setState('listening');
          this.callbacks.onTTSStart?.();
          this.metrics.ttsStart = performance.now();
          break;
          
        case 'error':
          this.callbacks.onError?.(new Error(data.error?.message || 'Unknown error'));
          break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private async playAudioDelta(base64Audio: string): Promise<void> {
    if (!this.audioContext || !base64Audio) return;

    try {
      // Decode base64 to audio data
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 to audio buffer
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start(0);

      // Update output level for VU meter
      this.outputLevel = this.calculateAudioLevel(float32Array);
      
    } catch (error) {
      console.error('Error playing audio delta:', error);
    }
  }

  interruptTTS(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.metrics.bargeInLatency = performance.now();
    
    this.ws.send(JSON.stringify({
      type: 'response.cancel'
    }));
    
    console.log('🚫 TTS interrupted');
  }

  private calculateAudioLevel(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  private updateMetrics(): void {
    const metrics: AudioMetrics = {
      inputLevel: this.inputLevel,
      outputLevel: this.outputLevel,
      latencyMs: performance.now() - this.lastLatencyCheck,
      vadState: this.vadState
    };
    
    this.callbacks.onAudioMetrics?.(metrics);
    this.lastLatencyCheck = performance.now();
  }

  private setState(newState: SessionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange?.(newState);
      console.log(`🔄 Voice state: ${newState}`);
    }
  }

  private async cleanup(): Promise<void> {
    // Stop audio processing
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    // Stop microphone
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  // Public methods for callbacks
  onPartialTranscript(callback: (transcript: PartialTranscript) => void): void {
    this.callbacks.onPartialTranscript = callback;
  }

  onFinalTranscript(callback: (transcript: string) => void): void {
    this.callbacks.onFinalTranscript = callback;
  }

  onAudioMetrics(callback: (metrics: AudioMetrics) => void): void {
    this.callbacks.onAudioMetrics = callback;
  }

  onStateChange(callback: (state: SessionState) => void): void {
    this.callbacks.onStateChange = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.callbacks.onError = callback;
  }

  onTTSStart(callback: () => void): void {
    this.callbacks.onTTSStart = callback;
  }

  onTTSEnd(callback: () => void): void {
    this.callbacks.onTTSEnd = callback;
  }

  // Getters
  getState(): SessionState {
    return this.state;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  isAvailable(): boolean {
    return typeof WebSocket !== 'undefined' && 
           typeof navigator.mediaDevices !== 'undefined' &&
           typeof AudioContext !== 'undefined';
  }
}

export const voiceRealtimeService = new VoiceRealtimeService();