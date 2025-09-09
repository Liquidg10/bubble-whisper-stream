/**
 * VoiceEngine - Unified voice processing core
 * Handles recording, transcription, intent routing, and confidence gating
 */

import { audioSessionManager, SessionState } from './voiceSessionManager';
import { voiceRouter, IntentResult } from '@/intent/voiceRouter';
import { decisionTraceService } from './decisionTraceService';
import { modalityService } from './modalityService';
import { audioService } from './audio';
import { devLog } from '@/devtools/devLog';
import { useBubbleStore } from '@/stores/bubbleStore';
import { voiceMetricsService } from './voiceMetricsService';

export interface VoiceEngineConfig {
  source: string; // Component identifier
  mode: 'quick' | 'conversational' | 'realtime';
  useWebSpeech?: boolean;
  useWhisper?: boolean;
  confidenceThreshold?: number;
  autoCommitEnabled?: boolean;
}

export interface VoiceProcessingResult {
  transcript: string;
  intent: IntentResult;
  sessionId: string;
  processingTime: number;
  backend: 'web-speech' | 'whisper' | 'realtime';
  autoCommitted: boolean;
  bubble?: any;
}

export interface VoiceEngineCallbacks {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onIntentDetected?: (intent: IntentResult) => void;
  onProcessingComplete?: (result: VoiceProcessingResult) => void;
  onError?: (error: Error, context: string) => void;
  onSessionStateChange?: (state: SessionState) => void;
}

export class VoiceEngine {
  private sessionId: string | null = null;
  private isRecording = false;
  private callbacks: VoiceEngineCallbacks = {};
  private config: VoiceEngineConfig | null = null;
  private startTime = 0;
  private liveTranscript = '';
  private recognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  constructor() {
    // Subscribe to session state changes
    audioSessionManager.onStateChange((state, source) => {
      this.callbacks.onSessionStateChange?.(state);
    });
  }

  /**
   * Start voice capture session
   */
  async startCapture(config: VoiceEngineConfig, callbacks: VoiceEngineCallbacks = {}): Promise<boolean> {
    if (this.isRecording) {
      devLog(`VoiceEngine: Already recording for ${this.config?.source}`);
      return false;
    }

    // Request session lock
    this.sessionId = await audioSessionManager.requestSession(config.source);
    if (!this.sessionId) {
      const current = audioSessionManager.getCurrentSession();
      callbacks.onError?.(
        new Error(`Voice session unavailable - ${current?.source} is active`), 
        'session_lock'
      );
      return false;
    }

    this.config = config;
    this.callbacks = callbacks;
    this.startTime = Date.now();
    this.liveTranscript = '';
    this.isRecording = true;

    devLog(`VoiceEngine: Starting capture for ${config.source}`, { mode: config.mode });

    try {
      // Start with primary backend (Web Speech for quick captures)
      if (config.useWebSpeech !== false) {
        await this.startWebSpeechRecognition();
      }

      // Also start audio recording for fallback
      await this.startAudioRecording();

      return true;
    } catch (error) {
      devLog('VoiceEngine: Failed to start capture:', error);
      this.cleanup();
      callbacks.onError?.(error as Error, 'start_capture');
      return false;
    }
  }

  /**
   * Stop voice capture and process
   */
  async stopCapture(): Promise<VoiceProcessingResult | null> {
    if (!this.isRecording || !this.sessionId) {
      devLog('VoiceEngine: No active recording to stop');
      return null;
    }

    devLog(`VoiceEngine: Stopping capture for ${this.config?.source}`);
    
    // Update session state
    audioSessionManager.updateSessionState(this.sessionId, 'processing');

    try {
      // Stop recognition and recording
      this.stopRecognition();
      await this.stopAudioRecording();

      // Process the final transcript
      const finalTranscript = this.liveTranscript.trim();
      if (!finalTranscript) {
        throw new Error('No transcript captured');
      }

      return await this.processTranscript(finalTranscript);
    } catch (error) {
      devLog('VoiceEngine: Failed to stop capture:', error);
      this.callbacks.onError?.(error as Error, 'stop_capture');
      return null;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Force stop and cleanup
   */
  forceStop(): void {
    devLog(`VoiceEngine: Force stopping for ${this.config?.source}`);
    this.cleanup();
  }

  /**
   * Get current state
   */
  getState(): {
    isRecording: boolean;
    sessionId: string | null;
    source: string | null;
    liveTranscript: string;
  } {
    return {
      isRecording: this.isRecording,
      sessionId: this.sessionId,
      source: this.config?.source || null,
      liveTranscript: this.liveTranscript
    };
  }

  private async startWebSpeechRecognition(): Promise<void> {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      throw new Error('Web Speech API not supported');
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      this.liveTranscript = finalTranscript || interimTranscript;
      this.callbacks.onTranscriptUpdate?.(this.liveTranscript, !!finalTranscript);
    };

    this.recognition.onerror = (event: any) => {
      devLog('Web Speech recognition error:', event.error);
      // Don't fail completely - we have audio recording as fallback
    };

    this.recognition.start();
    
    // Attach to session for cleanup
    if (this.sessionId) {
      audioSessionManager.attachResources(this.sessionId, { recognition: this.recognition });
    }
  }

  private async startAudioRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.start();

      // Attach to session for cleanup
      if (this.sessionId) {
        audioSessionManager.attachResources(this.sessionId, { 
          stream: this.stream, 
          recorder: this.mediaRecorder 
        });
      }
    } catch (error) {
      devLog('Failed to start audio recording:', error);
      throw error;
    }
  }

  private stopRecognition(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        devLog('Error stopping recognition:', error);
      }
      this.recognition = null;
    }
  }

  private async stopAudioRecording(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      return new Promise((resolve) => {
        this.mediaRecorder!.onstop = () => resolve();
        this.mediaRecorder!.stop();
      });
    }
  }

  private async processTranscript(transcript: string): Promise<VoiceProcessingResult> {
    const processingStart = Date.now();
    
    devLog(`VoiceEngine: Processing transcript: "${transcript}"`);

    // Route intent
    const intent = voiceRouter.route(transcript, {
      confidenceThreshold: this.config?.confidenceThreshold
    });

    this.callbacks.onIntentDetected?.(intent);

    // Create decision trace
    const traceId = decisionTraceService.addTrace({
      feature: 'context' as const,
      signals: [{
        type: 'voice_transcript',
        value: transcript,
        confidence: intent.confidence,
        source: this.config?.source || 'voice_engine'
      }],
      confidenceThreshold: this.config?.confidenceThreshold || 0.7,
      finalConfidence: intent.confidence,
      decision: intent.autoCommitRecommended ? 'auto-write' : 'suggest',
      action: `Create ${intent.type} bubble`,
      becauseText: `Detected ${intent.type} with ${Math.round(intent.confidence * 100)}% confidence`,
      metadata: { intent, source: this.config?.source },
      undoable: true
    });

    let autoCommitted = false;
    let bubble = null;

    // Handle auto-commit if enabled and confidence is high
    const settings = useBubbleStore.getState().settings;
    const shouldAutoCommit = settings.voiceAutoCommit !== false && 
                           intent.autoCommitRecommended && 
                           intent.confidence >= (this.config?.confidenceThreshold || 0.8);

    if (shouldAutoCommit) {
      try {
        bubble = voiceRouter.createBubbleFromIntent(transcript, intent);
        useBubbleStore.getState().addBubble(bubble);
        autoCommitted = true;
        
        devLog(`VoiceEngine: Auto-committed bubble for ${this.config?.source}`, { 
          bubbleId: bubble.id,
          type: intent.type 
        });

        // Mark decision trace as executed
        decisionTraceService.markAsUndone(traceId, bubble.id);
      } catch (error) {
        devLog('Failed to auto-commit bubble:', error);
        // Error already tracked in decision trace
      }
    }

    const result: VoiceProcessingResult = {
      transcript,
      intent,
      sessionId: this.sessionId!,
      processingTime: Date.now() - processingStart,
      backend: 'web-speech', // TODO: Track actual backend used
      autoCommitted,
      bubble
    };

    this.callbacks.onProcessingComplete?.(result);
    return result;
  }

  private cleanup(): void {
    if (this.sessionId) {
      audioSessionManager.releaseSession(this.sessionId, this.config?.source);
      this.sessionId = null;
    }

    this.stopRecognition();
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    this.mediaRecorder = null;
    this.isRecording = false;
    this.config = null;
    this.callbacks = {};
    this.liveTranscript = '';
  }
}

// Export singleton instance
export const voiceEngine = new VoiceEngine();