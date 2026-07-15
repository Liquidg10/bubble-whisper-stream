/**
 * useVoiceEngine - React hook for unified voice processing
 * Provides consistent interface for all voice capture components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { voiceEngine, VoiceEngineConfig, VoiceProcessingResult } from '@/services/voiceEngine';
import { voiceHotkeyManager } from '@/services/voiceHotkeyManager';
import { useBubbleStore } from '@/stores/bubbleStore';
import { IntentResult } from '@/intent/voiceRouter';
import { SessionState } from '@/services/voiceSessionManager';
import { toast } from 'sonner';
import { isKillSwitchActive } from '@/config/flags';

export interface UseVoiceEngineOptions {
  source: string;
  mode?: 'quick' | 'conversational' | 'realtime';
  enableHotkey?: boolean;
  hotkeyPriority?: number;
  autoCommitOverride?: boolean;
  onResult?: (result: VoiceProcessingResult) => void;
  onError?: (error: Error) => void;
}

export interface VoiceEngineState {
  isRecording: boolean;
  isProcessing: boolean;
  sessionState: SessionState;
  liveTranscript: string;
  lastIntent: IntentResult | null;
  lastResult: VoiceProcessingResult | null;
  error: Error | null;
  canStartRecording: boolean;
}

export function useVoiceEngine(options: UseVoiceEngineOptions) {
  const { settings } = useBubbleStore();
  const [state, setState] = useState<VoiceEngineState>({
    isRecording: false,
    isProcessing: false,
    sessionState: 'idle',
    liveTranscript: '',
    lastIntent: null,
    lastResult: null,
    error: null,
    canStartRecording: true
  });

  const hotkeyUnregisterRef = useRef<(() => void) | null>(null);
  const engineStateRef = useRef(voiceEngine.getState());

  // Get voice settings from store
  const voiceHotkey = settings.voiceHotkey ?? 'Space';
  const confidenceThreshold = settings.voiceConfidenceThreshold ?? 0.7;
  // Kill-switch gate: when the global auto-write kill switch is active, voice capture
  // must never silently auto-commit a bubble, regardless of the per-user store setting
  // or a caller-supplied override. This is the single choke point for ALL useVoiceEngine
  // consumers (HeaderVoiceCaptureUnified and any future callers), replacing the old
  // per-component kill-switch patches from Runs 52/58 that only covered the deleted
  // HeaderVoiceCapture.tsx.
  const autoCommitEnabled = !isKillSwitchActive() &&
    (options.autoCommitOverride ?? (settings.voiceAutoCommit !== false));

  // Update engine state tracking
  const updateEngineState = useCallback(() => {
    const engineState = voiceEngine.getState();
    engineStateRef.current = engineState;
    
    setState(prev => ({
      ...prev,
      isRecording: engineState.isRecording,
      liveTranscript: engineState.liveTranscript,
      canStartRecording: !engineState.isRecording || engineState.source === options.source
    }));
  }, [options.source]);

  // Register hotkey target
  useEffect(() => {
    if (!options.enableHotkey) return;

    voiceHotkeyManager.setHotkey(voiceHotkey);

    const unregister = voiceHotkeyManager.registerTarget({
      id: options.source,
      priority: options.hotkeyPriority ?? 1,
      isVisible: () => true, // Component manages its own visibility
      isActive: () => !state.isProcessing,
      onHotkeyPress: () => startRecording(),
      onHotkeyRelease: () => stopRecording()
    });

    hotkeyUnregisterRef.current = unregister;

    return () => {
      unregister();
      hotkeyUnregisterRef.current = null;
    };
  }, [options.enableHotkey, options.source, options.hotkeyPriority, voiceHotkey, state.isProcessing]);

  // Start recording
  const startRecording = useCallback(async (): Promise<boolean> => {
    if (state.isRecording || state.isProcessing) {
      return false;
    }

    setState(prev => ({ ...prev, error: null, lastResult: null }));

    const config: VoiceEngineConfig = {
      source: options.source,
      mode: options.mode ?? 'quick',
      confidenceThreshold,
      autoCommitEnabled
    };

    const callbacks = {
      onTranscriptUpdate: (transcript: string, isFinal: boolean) => {
        setState(prev => ({ ...prev, liveTranscript: transcript }));
      },
      onIntentDetected: (intent: IntentResult) => {
        setState(prev => ({ ...prev, lastIntent: intent }));
      },
      onProcessingComplete: (result: VoiceProcessingResult) => {
        setState(prev => ({ 
          ...prev, 
          lastResult: result,
          isProcessing: false 
        }));
        
        // Show user feedback
        if (result.autoCommitted && result.bubble) {
          toast.success(`Created ${result.intent.type}`, {
            description: result.transcript.substring(0, 50) + '...',
            action: {
              label: 'Undo',
              onClick: () => {
                // TODO: Implement undo via decisionTraceService
                toast.info('Undo functionality coming soon');
              }
            }
          });
        } else if (result.intent.needsClarification) {
          toast.info(result.intent.clarification || 'Could you clarify what type of note this should be?');
        }

        options.onResult?.(result);
        updateEngineState();
      },
      onError: (error: Error, context: string) => {
        setState(prev => ({ 
          ...prev, 
          error, 
          isRecording: false, 
          isProcessing: false 
        }));
        
        toast.error(`Voice capture failed: ${error.message}`);
        options.onError?.(error);
        updateEngineState();
      },
      onSessionStateChange: (sessionState: SessionState) => {
        setState(prev => ({ 
          ...prev, 
          sessionState,
          isProcessing: sessionState === 'processing'
        }));
      }
    };

    const success = await voiceEngine.startCapture(config, callbacks);
    if (success) {
      updateEngineState();
    }
    return success;
  }, [state.isRecording, state.isProcessing, options, confidenceThreshold, autoCommitEnabled, updateEngineState]);

  // Stop recording
  const stopRecording = useCallback(async (): Promise<VoiceProcessingResult | null> => {
    if (!state.isRecording) {
      return null;
    }

    setState(prev => ({ ...prev, isProcessing: true }));
    
    const result = await voiceEngine.stopCapture();
    updateEngineState();
    return result;
  }, [state.isRecording, updateEngineState]);

  // Force stop (cleanup)
  const forceStop = useCallback(() => {
    voiceEngine.forceStop();
    setState(prev => ({
      ...prev,
      isRecording: false,
      isProcessing: false,
      sessionState: 'idle',
      liveTranscript: '',
      error: null
    }));
    updateEngineState();
  }, [updateEngineState]);

  // Manual transcript processing (for typing interface)
  const processText = useCallback(async (text: string): Promise<VoiceProcessingResult | null> => {
    // TODO: Implement text-only processing through voice engine
    // This allows text input to use the same intent routing and decision making
    return null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hotkeyUnregisterRef.current) {
        hotkeyUnregisterRef.current();
      }
      if (state.isRecording) {
        voiceEngine.forceStop();
      }
    };
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    startRecording,
    stopRecording,
    forceStop,
    processText,
    
    // Configuration
    hotkey: voiceHotkey,
    isHotkeyPressed: options.enableHotkey ? voiceHotkeyManager.isHotkeyPressed() : false,
    
    // Utilities
    createBubbleFromResult: (result: VoiceProcessingResult) => {
      if (result.bubble) return result.bubble;
      // Fallback bubble creation if not auto-committed
      return result.intent; // TODO: Use voiceRouter.createBubbleFromIntent
    }
  };
}