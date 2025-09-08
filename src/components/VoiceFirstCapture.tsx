/**
 * Voice-First Capture Component with Confidence Gates and Hotkeys
 * Implements near-instant voice capture with auto-commit for high confidence
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  Check, 
  X, 
  Keyboard,
  Settings,
  Zap
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { voiceRouter, IntentResult } from '@/intent/voiceRouter';
import { modalityService } from '@/services/modalityService';
import { ttsService } from '@/services/tts';
import { decisionTraceService } from '@/services/decisionTraceService';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface VoiceFirstCaptureProps {
  className?: string;
  onBubbleCreated?: (bubble: any) => void;
  hotkey?: string;
  autoCommitEnabled?: boolean;
}

interface VoiceSettings {
  hotkey: string;
  autoCommitEnabled: boolean;
  confidenceThreshold: number;
  feedbackLevel: 'minimal' | 'standard' | 'verbose';
}

export const VoiceFirstCapture: React.FC<VoiceFirstCaptureProps> = ({
  className,
  onBubbleCreated,
  hotkey = 'Space',
  autoCommitEnabled = true
}) => {
  const { addBubble, settings } = useBubbleStore();
  
  // Voice capture states
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [currentIntent, setCurrentIntent] = useState<IntentResult | null>(null);
  const [confidence, setConfidence] = useState(0);
  
  // Confirmation states for medium confidence
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingBubble, setPendingBubble] = useState<any>(null);
  
  // Voice settings
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    hotkey,
    autoCommitEnabled,
    confidenceThreshold: 0.6,
    feedbackLevel: 'standard'
  });
  
  // Refs for audio processing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isHotkeyPressed = useRef(false);

  // Voice Activity Detection for near-instant processing
  const startVADProcessing = useCallback(async () => {
    if (!isListening || !transcript) return;
    
    setIsProcessing(true);
    try {
      // Route intent with partial transcript for near-instant feedback
      const intent = voiceRouter.route(transcript, {
        context: {
          timeOfDay: new Date().getHours() > 17 ? 'evening' : 'day',
          recentBubbles: []
        }
      });
      
      setCurrentIntent(intent);
      setConfidence(intent.confidence);
      
      console.log('🎯 Voice intent (partial):', {
        text: transcript,
        intent: intent.type,
        confidence: intent.confidence,
        gate: intent.confidenceGate
      });
      
    } catch (error) {
      console.error('❌ Intent routing failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [transcript, isListening]);

  // Debounced VAD processing for partial transcripts
  useEffect(() => {
    if (transcript && isListening) {
      const timer = setTimeout(startVADProcessing, 300);
      return () => clearTimeout(timer);
    }
  }, [transcript, isListening, startVADProcessing]);

  // Global hotkey listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === voiceSettings.hotkey && !e.repeat) {
        e.preventDefault();
        if (!isListening && !isHotkeyPressed.current) {
          isHotkeyPressed.current = true;
          startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === voiceSettings.hotkey && isHotkeyPressed.current) {
        e.preventDefault();
        isHotkeyPressed.current = false;
        if (isListening) {
          stopListening();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [voiceSettings.hotkey, isListening]);

  const startListening = async () => {
    try {
      setIsListening(true);
      setTranscript('');
      setCurrentIntent(null);
      setConfidence(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;
      
      // Use Web Speech API for near-instant partial results
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              setTranscript(prev => prev + result[0].transcript);
            } else {
              interimTranscript += result[0].transcript;
            }
          }
          
          // Update with partial results for near-instant feedback
          if (interimTranscript) {
            setTranscript(prev => prev + interimTranscript);
          }
        };
        
        recognition.start();
        
        streamRef.current = stream;
        (streamRef.current as any).recognition = recognition;
      }
      
      // Also record for fallback processing
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start(250); // Small chunks for streaming
      
    } catch (error) {
      console.error('❌ Failed to start listening:', error);
      toast.error('Could not access microphone');
      setIsListening(false);
    }
  };

  const stopListening = async () => {
    setIsListening(false);
    
    // Stop speech recognition
    if (streamRef.current && (streamRef.current as any).recognition) {
      (streamRef.current as any).recognition.stop();
    }
    
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    // Stop audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Process final transcript
    if (transcript.trim()) {
      await processFinalTranscript(transcript.trim());
    }
  };

  const processFinalTranscript = async (finalText: string) => {
    if (!finalText) return;
    
    setIsProcessing(true);
    
    try {
      // Get final intent with full context
      const intent = voiceRouter.route(finalText, {
        context: {
          timeOfDay: new Date().getHours() > 17 ? 'evening' : 'day',
          recentBubbles: []
        },
        confidenceThreshold: voiceSettings.confidenceThreshold
      });
      
      setCurrentIntent(intent);
      setConfidence(intent.confidence);
      
      // Create decision trace
      const traceId = decisionTraceService.addTrace({
        feature: 'context' as any, // TODO: Add voice-capture to DecisionTrace types
        signals: [
          {
            type: 'voice-intent',
            value: intent.type,
            confidence: intent.confidence,
            source: 'voice-router'
          },
          {
            type: 'text-length',
            value: finalText.length,
            confidence: finalText.length > 10 ? 0.8 : 0.4,
            source: 'transcript'
          }
        ],
        confidenceThreshold: voiceSettings.confidenceThreshold,
        finalConfidence: intent.confidence,
        decision: intent.autoCommitRecommended && voiceSettings.autoCommitEnabled ? 'auto-write' : 
                 intent.confidenceGate === 'medium' ? 'draft' : 'suggest',
        action: `Create ${intent.type} bubble: "${finalText.substring(0, 50)}..."`,
        becauseText: `Because ${intent.confidenceGate} confidence voice intent detected`,
        metadata: { intent, text: finalText },
        undoable: true
      });
      
      // Handle based on confidence gate
      if (intent.confidenceGate === 'high' && voiceSettings.autoCommitEnabled) {
        // High confidence - auto-commit
        await createBubbleFromIntent(finalText, intent, traceId);
        
        if (voiceSettings.feedbackLevel !== 'minimal') {
          await ttsService.speak(
            voiceRouter.getConfidenceFeedback(finalText, intent), 
            { tone: 'gentle', context: 'companion' }
          );
        }
        
      } else if (intent.confidenceGate === 'medium') {
        // Medium confidence - request confirmation
        setAwaitingConfirmation(true);
        setPendingBubble({ text: finalText, intent, traceId });
        
        if (voiceSettings.feedbackLevel !== 'minimal') {
          await ttsService.speak(
            voiceRouter.getConfidenceFeedback(finalText, intent),
            { tone: 'neutral', context: 'companion' }
          );
        }
        
      } else {
        // Low confidence - show clarification
        if (voiceSettings.feedbackLevel !== 'minimal') {
          await ttsService.speak(
            voiceRouter.getConfidenceFeedback(finalText, intent),
            { tone: 'gentle', context: 'companion' }
          );
        }
        
        toast.error(intent.clarification || 'Could you try rephrasing that?');
      }
      
    } catch (error) {
      console.error('❌ Voice processing failed:', error);
      toast.error('Failed to process voice input');
    } finally {
      setIsProcessing(false);
    }
  };

  const createBubbleFromIntent = async (text: string, intent: IntentResult, traceId?: string) => {
    const bubble = voiceRouter.createBubbleFromIntent(text, intent);
    
    addBubble(bubble);
    onBubbleCreated?.(bubble);
    
    // Success feedback
    toast.success(`${intent.type} created!`, {
      description: text.substring(0, 60) + (text.length > 60 ? '...' : '')
    });
    
    // Reset state
    setTranscript('');
    setCurrentIntent(null);
    setConfidence(0);
    setAwaitingConfirmation(false);
    setPendingBubble(null);
    
    console.log('✅ Voice bubble created:', { bubble, intent, trace: traceId });
  };

  const handleConfirmation = async (confirmed: boolean) => {
    if (!pendingBubble) return;
    
    if (confirmed) {
      await createBubbleFromIntent(
        pendingBubble.text, 
        pendingBubble.intent, 
        pendingBubble.traceId
      );
    } else {
      toast.info('Voice input cancelled');
      decisionTraceService.markAsUndone(pendingBubble.traceId, 'user-rejected');
    }
    
    setAwaitingConfirmation(false);
    setPendingBubble(null);
  };

  const getStatusText = () => {
    if (isListening) return 'Listening...';
    if (isProcessing) return 'Processing...';
    if (awaitingConfirmation) return 'Confirm?';
    return `Hold ${voiceSettings.hotkey} to speak`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Main Voice Capture Button */}
      <Card className={cn(
        'p-6 transition-all duration-200',
        isListening && 'ring-2 ring-primary',
        awaitingConfirmation && 'ring-2 ring-yellow-500'
      )}>
        <div className="flex flex-col items-center space-y-4">
          {/* Voice Button */}
          <Button
            size="lg"
            variant={isListening ? 'default' : 'outline'}
            className={cn(
              'h-16 w-16 rounded-full transition-all duration-200',
              isListening && 'bg-primary pulse',
              isProcessing && 'animate-pulse'
            )}
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            disabled={isProcessing}
          >
            {isListening ? (
              <Mic className="h-6 w-6" />
            ) : (
              <MicOff className="h-6 w-6" />
            )}
          </Button>
          
          {/* Status Text */}
          <div className="text-center">
            <p className="text-sm font-medium">{getStatusText()}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Keyboard className="h-3 w-3" />
              {voiceSettings.hotkey} key
            </p>
          </div>
          
          {/* Live Transcript */}
          <AnimatePresence>
            {transcript && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full max-w-md"
              >
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="text-center">{transcript}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Intent & Confidence Display */}
          <AnimatePresence>
            {currentIntent && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2"
              >
                <Badge variant="outline">
                  {currentIntent.type}
                </Badge>
                <Badge 
                  variant="outline" 
                  className={getConfidenceColor(confidence)}
                >
                  {Math.round(confidence * 100)}%
                </Badge>
                {currentIntent.autoCommitRecommended && (
                  <Badge variant="default" className="bg-green-600">
                    <Zap className="h-3 w-3 mr-1" />
                    Auto
                  </Badge>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
      
      {/* Confirmation Dialog for Medium Confidence */}
      <AnimatePresence>
        {awaitingConfirmation && pendingBubble && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="p-4 border-yellow-200 bg-yellow-50">
              <div className="space-y-3">
                <div className="text-center">
                  <p className="font-medium">Confirm this {pendingBubble.intent.type}?</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    "{pendingBubble.text}"
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1"
                    onClick={() => handleConfirmation(true)}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Yes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleConfirmation(false)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    No
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Settings Hint */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Settings className="h-3 w-3" />
          Hotkey & auto-commit in Settings
        </p>
      </div>
    </div>
  );
};