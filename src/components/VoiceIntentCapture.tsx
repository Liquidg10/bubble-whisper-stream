import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Square, Volume2, VolumeX } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { ttsService } from '@/services/tts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled, isKillSwitchActive } from '@/config/flags';
import { Bubble, BubbleType } from '@/types/bubble';
import { setHorizon } from '@/lib/horizon';
import { voiceRouter, IntentResult } from '@/intent/voiceRouter';

interface VoiceIntentCaptureProps {
  onBubbleCreated?: (bubble: Bubble) => void;
  className?: string;
}

const DEBUG = localStorage.getItem('DEBUG') === 'true';

export const VoiceIntentCapture: React.FC<VoiceIntentCaptureProps> = ({
  onBubbleCreated, 
  className 
}) => {
  const { toast } = useToast();
  const { addBubble, settings } = useBubbleStore();

  const voiceAutoCommit = settings.voiceAutoCommit ?? true;
  const confidenceThreshold = settings.voiceConfidenceThreshold ?? 0.7;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'hold' | 'toggle'>('hold');
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);

  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<{ transcript: string; intent: IntentResult } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const getTagEmoji = (tag: string): string => {
    const emojiMap: Record<string, string> = {
      shopping: '🛒',
      idea: '💡',
      reminder: '⏰',
      joy: '😊',
      note: '📝',
    };
    return emojiMap[tag] || '📝';
  };

  // Provide TTS feedback
  const provideFeedback = useCallback(async (text: string, intent: IntentResult) => {
    if (!settings.ttsEnabled) return;

    let summary = '';
    const shortText = text.substring(0, 50) + (text.length > 50 ? '...' : '');

    switch (intent.type) {
      case 'ReminderNote':
        summary = `Set reminder: ${shortText}`;
        if (intent.horizon) {
          summary += ` for ${intent.horizon.toLowerCase()}`;
        }
        break;
      case 'Task':
        if (intent.tags.includes('shopping')) {
          summary = `Added to shopping list: ${shortText}`;
        } else {
          summary = `Created task: ${shortText}`;
        }
        break;
      case 'Memory':
        summary = `Saved joyful memory: ${shortText}`;
        break;
      case 'Thought':
        if (intent.tags.includes('idea')) {
          summary = `Captured idea: ${shortText}`;
        } else {
          summary = `Took note: ${shortText}`;
        }
        break;
      default:
        summary = `Saved: ${shortText}`;
    }

    await ttsService.speak(summary, {
      tone: 'gentle',
      context: 'notes',
      interrupt: false
    });
  }, [settings.ttsEnabled]);

  // Commit a routed intent as a bubble, positioned prominently in view center — this
  // component's distinct capture UX vs. HeaderVoiceCapture's header-anchored button.
  const commitBubble = useCallback(async (text: string, intent: IntentResult) => {
    const bubble: Bubble = {
      id: crypto.randomUUID(),
      type: intent.type,
      content: text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
      y: window.innerHeight / 2 + (Math.random() - 0.5) * 200,
      size: 0.8,
      tags: intent.tags.map(tag => ({
        id: crypto.randomUUID(),
        name: tag,
        emoji: getTagEmoji(tag)
      }))
    };

    if (intent.horizon) {
      setHorizon(bubble, intent.horizon);
    }

    await addBubble(bubble);
    onBubbleCreated?.(bubble);

    await provideFeedback(text, intent);

    toast({
      title: `Auto-created ${intent.type}!`,
      description: `${Math.round(intent.confidence * 100)}% confidence: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`,
    });
  }, [addBubble, onBubbleCreated, provideFeedback, toast]);

  // Route the transcript through the shared voiceRouter (same classifier HeaderVoiceCapture
  // uses) and apply the same 3-tier confidence gate + Auto-Write Kill Switch check, instead
  // of this component's former private classifier that committed unconditionally.
  const handleTranscript = useCallback(async (text: string) => {
    const intent = voiceRouter.route(text);
    setConfidence(intent.confidence);

    if (DEBUG) {
      console.log('🎯 Intent routed:', { text, intent });
    }

    if (intent.confidence >= 0.85 && intent.autoCommitRecommended && voiceAutoCommit && !isKillSwitchActive()) {
      // High confidence + auto-commit enabled + kill switch inactive = create immediately
      await commitBubble(text, intent);
    } else if (intent.confidence >= 0.85 && intent.autoCommitRecommended && voiceAutoCommit && isKillSwitchActive()) {
      // Kill switch active: fall back to confirmation instead of silently auto-creating
      setPendingIntent({ transcript: text, intent });
      setAwaitingConfirmation(true);
    } else if (intent.confidence >= confidenceThreshold && intent.confidence < 0.85) {
      // Medium confidence = ask for confirmation
      setPendingIntent({ transcript: text, intent });
      setAwaitingConfirmation(true);
    } else {
      // Low confidence = surface what was heard without creating anything
      toast({
        title: "Not sure what to do",
        description: `I heard "${text}" but wasn't sure what to do. Try being more specific.`,
      });
    }
  }, [voiceAutoCommit, confidenceThreshold, commitBubble, toast]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      if (!isFeatureEnabled('aiVision')) {
        toast({
          title: "Feature Disabled",
          description: "Voice capture requires aiVision flag to be enabled.",
          variant: "destructive"
        });
        return;
      }
      
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
      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        await processRecording();
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      
      if (DEBUG) {
        console.log('🎤 Voice recording started');
      }
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Recording Failed",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive"
      });
    }
  }, [toast]);
  
  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (DEBUG) {
        console.log('🛑 Voice recording stopped');
      }
    }
  }, [isRecording]);
  
  // Process recorded audio
  const processRecording = useCallback(async () => {
    if (audioChunksRef.current.length === 0) return;
    
    setIsProcessing(true);

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      if (DEBUG) {
        console.log('🔄 Transcribing audio...', { size: audioBlob.size });
      }

      const { data, error } = await supabase.functions.invoke('ai-voice-transcribe', {
        body: { audio: base64Audio, language: 'en' }
      });
      
      if (error || !data.success) {
        throw new Error(data?.error || 'Transcription failed');
      }
      
      const text = data.text.trim();
      setTranscript(text);
      
      if (!text) {
        toast({
          title: "No Speech Detected",
          description: "Please try speaking more clearly.",
          variant: "destructive"
        });
        return;
      }

      await handleTranscript(text);

    } catch (error) {
      console.error('Failed to process recording:', error);

      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        await tryBrowserSpeechFallback();
      } else {
        toast({
          title: "Processing Failed",
          description: "Voice processing unavailable. Please try again or use text input.",
          variant: "destructive"
        });
      }
    } finally {
      setIsProcessing(false);
    }
  }, [handleTranscript, toast]);

  // Browser speech recognition fallback — also routed through the shared voiceRouter +
  // confidence gate (previously created bubbles unconditionally, bypassing the gate).
  const tryBrowserSpeechFallback = useCallback(async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('No speech recognition available');
    }
    
    return new Promise<void>((resolve, reject) => {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        await handleTranscript(text);
        resolve();
      };

      recognition.onerror = () => reject(new Error('Browser speech recognition failed'));
      recognition.start();
    });
  }, [handleTranscript]);

  // Resolve a pending medium-confidence / kill-switch confirmation
  const handleConfirmation = useCallback(async (confirmed: boolean) => {
    if (confirmed && pendingIntent) {
      await commitBubble(pendingIntent.transcript, pendingIntent.intent);
    }
    setAwaitingConfirmation(false);
    setPendingIntent(null);
  }, [pendingIntent, commitBubble]);

  // Button handlers
  const handleMouseDown = useCallback(() => {
    if (recordingMode === 'hold' && !isRecording && !awaitingConfirmation) {
      startRecording();
    }
  }, [recordingMode, isRecording, awaitingConfirmation, startRecording]);

  const handleMouseUp = useCallback(() => {
    if (recordingMode === 'hold' && isRecording) {
      stopRecording();
    }
  }, [recordingMode, isRecording, stopRecording]);

  const handleClick = useCallback(() => {
    if (recordingMode === 'toggle' && !awaitingConfirmation) {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  }, [recordingMode, isRecording, awaitingConfirmation, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const getStatusText = () => {
    if (isProcessing) return 'Processing...';
    if (awaitingConfirmation) return 'Awaiting confirmation';
    if (isRecording) return recordingMode === 'hold' ? 'Recording (release to stop)' : 'Recording (tap to stop)';
    return recordingMode === 'hold' ? 'Hold to record' : 'Tap to record';
  };
  
  const getButtonVariant = () => {
    if (isRecording) return 'destructive';
    if (isProcessing) return 'secondary';
    return 'default';
  };

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {/* Main capture button */}
      <Button
        size="lg"
        variant={getButtonVariant()}
        className="h-16 w-16 rounded-full transition-all duration-200 transform hover:scale-105 active:scale-95"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        disabled={isProcessing || awaitingConfirmation}
        aria-label={getStatusText()}
      >
        {isProcessing ? (
          <Square className="h-6 w-6 animate-pulse" />
        ) : isRecording ? (
          <MicOff className="h-6 w-6 animate-pulse" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </Button>
      
      {/* Status and controls */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">
          {getStatusText()}
        </span>
        
        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={recordingMode === 'hold' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRecordingMode('hold')}
            disabled={isRecording || isProcessing}
            className="text-xs h-6"
          >
            Hold
          </Button>
          <Button
            variant={recordingMode === 'toggle' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRecordingMode('toggle')}
            disabled={isRecording || isProcessing}
            className="text-xs h-6"
          >
            Toggle
          </Button>
        </div>
        
        {/* Transcript and confidence */}
        {transcript && (
          <div className="flex flex-col items-center gap-1 max-w-sm">
            <p className="text-xs text-center break-words">{transcript}</p>
            {confidence > 0 && (
              <Badge variant="outline" className="text-xs">
                {Math.round(confidence * 100)}% confidence
              </Badge>
            )}
          </div>
        )}

        {/* Medium-confidence / kill-switch confirmation */}
        {awaitingConfirmation && pendingIntent && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              Create {pendingIntent.intent.type}?
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => handleConfirmation(true)}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => handleConfirmation(false)}
            >
              No
            </Button>
          </div>
        )}

        {/* Debug info */}
        {DEBUG && (
          <Badge variant="secondary" className="text-xs">
            aiVision: {isFeatureEnabled('aiVision') ? 'ON' : 'OFF'}
          </Badge>
        )}
      </div>
    </div>
  );
};
