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
}

export const VoiceFirstCapture: React.FC<VoiceFirstCaptureProps> = ({
  className,
  onBubbleCreated
}) => {
  const { addBubble, settings } = useBubbleStore();
  
  // Get voice settings from bubble store
  const voiceAutoCommit = settings.voiceAutoCommit ?? true;
  const voiceConfidenceThreshold = settings.voiceConfidenceThreshold ?? 0.6;
  const voiceFeedbackLevel = settings.voiceFeedbackLevel ?? 'standard';
  const voiceHotkey = settings.voiceHotkey ?? 'Space';
  
  // Voice capture states
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [currentIntent, setCurrentIntent] = useState<IntentResult | null>(null);
  const [confidence, setConfidence] = useState(0);
  
  // Confirmation states for medium confidence
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingBubble, setPendingBubble] = useState<any>(null);
  
  // Bubble creation feedback
  const [recentlyCreatedBubble, setRecentlyCreatedBubble] = useState<any>(null);
  const [showCreationSuccess, setShowCreationSuccess] = useState(false);
  
  // Refs for audio processing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const isHotkeyPressed = useRef(false);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string>('');
  const finalResultProcessedRef = useRef(false);

  // Voice Activity Detection for near-instant processing
  const startVADProcessing = useCallback(async () => {
    const currentText = interimTranscript || transcript;
    if (!isListening || !currentText || currentText.length < 5) return;
    
    // Prevent duplicate processing
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      // Route intent with partial transcript for near-instant feedback
      const intent = voiceRouter.route(currentText, {
        context: {
          timeOfDay: new Date().getHours() > 17 ? 'evening' : 'day',
          recentBubbles: []
        }
      });
      
      setCurrentIntent(intent);
      setConfidence(intent.confidence);
      
      console.log('🎯 Voice intent (partial):', {
        text: currentText,
        intent: intent.type,
        confidence: intent.confidence,
        gate: intent.confidenceGate
      });
      
    } catch (error) {
      console.error('❌ Intent routing failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [transcript, interimTranscript, isListening, isProcessing]);

  // Debounced VAD processing for partial transcripts
  useEffect(() => {
    const currentText = interimTranscript || transcript;
    if (currentText && isListening && currentText.length > 5) {
      // Clear existing timeout
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      
      // Set new timeout with longer delay to avoid processing spam
      processingTimeoutRef.current = setTimeout(startVADProcessing, 500);
      
      return () => {
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
        }
      };
    }
  }, [transcript, interimTranscript, isListening, startVADProcessing]);

  // Global hotkey listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === voiceHotkey && !e.repeat) {
        e.preventDefault();
        if (!isListening && !isHotkeyPressed.current) {
          isHotkeyPressed.current = true;
          startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === voiceHotkey && isHotkeyPressed.current) {
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
  }, [voiceHotkey, isListening]);

  const startListening = async () => {
    try {
      setIsListening(true);
      setTranscript('');
      setInterimTranscript('');
      setCurrentIntent(null);
      setConfidence(0);
      setShowCreationSuccess(false);
      audioChunksRef.current = [];
      sessionIdRef.current = Date.now().toString();
      finalResultProcessedRef.current = false;

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
          let newFinalTranscript = '';
          let newInterimTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              newFinalTranscript += result[0].transcript;
            } else {
              newInterimTranscript += result[0].transcript;
            }
          }
          
          // Handle final results - accumulate them properly
          if (newFinalTranscript && !finalResultProcessedRef.current) {
            setTranscript(prev => prev + newFinalTranscript);
            setInterimTranscript(''); // Clear interim when we get final
            finalResultProcessedRef.current = true;
          } else if (newInterimTranscript && !finalResultProcessedRef.current) {
            // Only show interim if we haven't processed final results yet
            setInterimTranscript(newInterimTranscript);
          }
        };
        
        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          if (event.error === 'no-speech') {
            // Silent timeout - normal behavior
            return;
          }
          setIsListening(false);
        };
        
        recognition.onend = () => {
          if (isListening) {
            // Recognition ended unexpectedly while we're still supposed to be listening
            console.log('Recognition ended, restarting...');
            try {
              recognition.start();
            } catch (error) {
              console.error('Failed to restart recognition:', error);
              setIsListening(false);
            }
          }
        };
        
        recognition.start();
        recognitionRef.current = recognition;
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
    
    // Clear any pending timeouts
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    
    // Stop speech recognition properly
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
      recognitionRef.current = null;
    }
    
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('Error stopping media recorder:', error);
      }
    }
    
    // Stop audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Process final transcript only if we have meaningful content
    const finalText = transcript.trim();
    if (finalText && finalText.length > 2) {
      await processFinalTranscript(finalText);
    }
    
    // Reset transcript after processing
    setTranscript('');
    setInterimTranscript('');
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
        confidenceThreshold: voiceConfidenceThreshold
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
        confidenceThreshold: voiceConfidenceThreshold,
        finalConfidence: intent.confidence,
        decision: intent.autoCommitRecommended && voiceAutoCommit ? 'auto-write' : 
                 intent.confidenceGate === 'medium' ? 'draft' : 'suggest',
        action: `Create ${intent.type} bubble: "${finalText.substring(0, 50)}..."`,
        becauseText: `Because ${intent.confidenceGate} confidence voice intent detected`,
        metadata: { intent, text: finalText },
        undoable: true
      });
      
      // Handle based on confidence gate
      if (intent.confidenceGate === 'high' && voiceAutoCommit) {
        // High confidence - auto-commit
        await createBubbleFromIntent(finalText, intent, traceId);
        
        if (voiceFeedbackLevel !== 'minimal') {
          await ttsService.speak(
            voiceRouter.getConfidenceFeedback(finalText, intent), 
            { tone: 'gentle', context: 'companion' }
          );
        }
        
      } else if (intent.confidenceGate === 'medium') {
        // Medium confidence - request confirmation
        setAwaitingConfirmation(true);
        setPendingBubble({ text: finalText, intent, traceId });
        
        if (voiceFeedbackLevel !== 'minimal') {
          await ttsService.speak(
            voiceRouter.getConfidenceFeedback(finalText, intent),
            { tone: 'neutral', context: 'companion' }
          );
        }
        
      } else {
        // Low confidence - show clarification
        if (voiceFeedbackLevel !== 'minimal') {
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
    
    // Show creation success feedback
    setRecentlyCreatedBubble(bubble);
    setShowCreationSuccess(true);
    
    // Success feedback
    toast.success(`${intent.type} created!`, {
      description: text.substring(0, 60) + (text.length > 60 ? '...' : '')
    });
    
    // Reset state
    setTranscript('');
    setInterimTranscript('');
    setCurrentIntent(null);
    setConfidence(0);
    setAwaitingConfirmation(false);
    setPendingBubble(null);
    
    // Hide success indicator after a delay
    setTimeout(() => {
      setShowCreationSuccess(false);
      setRecentlyCreatedBubble(null);
    }, 3000);
    
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
    return `Hold ${voiceHotkey} to speak`;
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
              {voiceHotkey} key
            </p>
          </div>
          
          {/* Live Transcript */}
          <AnimatePresence>
            {(transcript || interimTranscript) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full max-w-md"
              >
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="text-center">
                    {transcript}
                    {interimTranscript && (
                      <span className="text-muted-foreground">{interimTranscript}</span>
                    )}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Bubble Creation Success */}
          <AnimatePresence>
            {showCreationSuccess && recentlyCreatedBubble && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                className="w-full max-w-md"
              >
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-green-700">
                    <Check className="h-4 w-4" />
                    <span className="font-medium">
                      {recentlyCreatedBubble.type} created!
                    </span>
                  </div>
                  <p className="text-green-600 mt-1 text-xs">
                    "{recentlyCreatedBubble.title}"
                  </p>
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