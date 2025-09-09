import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Square, Volume2, VolumeX } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { ttsService } from '@/services/tts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled } from '@/config/flags';
import { Bubble, BubbleType } from '@/types/bubble';
import { setHorizon } from '@/lib/horizon';

interface VoiceIntentCaptureProps {
  onBubbleCreated?: (bubble: Bubble) => void;
  className?: string;
}

interface IntentResult {
  type: BubbleType;
  tags: string[];
  horizon?: 'today' | 'week' | 'later';
  confidence: number;
}

const DEBUG = localStorage.getItem('DEBUG') === 'true';

export const VoiceIntentCapture: React.FC<VoiceIntentCaptureProps> = ({ 
  onBubbleCreated, 
  className 
}) => {
  const { toast } = useToast();
  const { addBubble, settings } = useBubbleStore();
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'hold' | 'toggle'>('hold');
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  
  // Audio infrastructure
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Intent routing logic
  const routeIntent = useCallback((text: string): IntentResult => {
    const lowerText = text.toLowerCase().trim();
    
    // Reminder patterns
    if (lowerText.includes('remind') || lowerText.includes('reminder') || 
        lowerText.includes('set a reminder') || lowerText.includes('don\'t forget')) {
      
      let horizon: 'today' | 'week' | 'later' = 'today';
      const tags = ['reminder'];
      
      if (lowerText.includes('tomorrow') || lowerText.includes('next week') || 
          lowerText.includes('later') || lowerText.includes('someday')) {
        horizon = 'week';
      }
      if (lowerText.includes('next month') || lowerText.includes('eventually')) {
        horizon = 'later';
      }
      
      return { type: 'ReminderNote', tags, horizon, confidence: 0.9 };
    }
    
    // Buy/shopping patterns
    if (lowerText.includes('buy') || lowerText.includes('need to get') || 
        lowerText.includes('pick up') || lowerText.includes('grocery') ||
        lowerText.includes('shopping') || lowerText.includes('purchase')) {
      return { type: 'Task', tags: ['shopping'], confidence: 0.85 };
    }
    
    // Idea patterns  
    if (lowerText.includes('idea') || lowerText.includes('what if') || 
        lowerText.includes('i\'m thinking') || lowerText.includes('concept') ||
        lowerText.includes('brainstorm')) {
      return { type: 'Thought', tags: ['idea'], confidence: 0.8 };
    }
    
    // Note patterns
    if (lowerText.includes('note') || lowerText.includes('take note') || 
        lowerText.includes('write down') || lowerText.includes('remember this') ||
        lowerText.includes('jot down')) {
      return { type: 'Thought', tags: ['note'], confidence: 0.85 };
    }
    
    // Task patterns
    if (lowerText.includes('task') || lowerText.includes('todo') || 
        lowerText.includes('need to do') || lowerText.includes('have to')) {
      return { type: 'Task', tags: [], confidence: 0.7 };
    }
    
    // Joy/happy patterns
    if (lowerText.includes('happy') || lowerText.includes('joy') || 
        lowerText.includes('excited') || lowerText.includes('love') ||
        lowerText.includes('amazing') || lowerText.includes('wonderful')) {
      return { type: 'Memory', tags: ['joy'], confidence: 0.75 };
    }
    
    // Default to Thought
    return { type: 'Thought', tags: [], confidence: 0.6 };
  }, []);
  
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
      // Create audio blob
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      
      // Convert to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      if (DEBUG) {
        console.log('🔄 Transcribing audio...', { size: audioBlob.size });
      }
      
      // Transcribe with Whisper
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
      
      // Route intent
      const intent = routeIntent(text);
      setConfidence(intent.confidence);
      
      if (DEBUG) {
        console.log('🎯 Intent routed:', { text, intent });
      }
      
      // Create bubble - position prominently in view center
      const bubble: Bubble = {
        id: crypto.randomUUID(),
        type: intent.type,
        content: text,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
        y: window.innerHeight / 2 + (Math.random() - 0.5) * 200,
        size: 0.8, // Slightly larger for visibility
        tags: intent.tags.map(tag => ({
          id: crypto.randomUUID(),
          name: tag,
          emoji: tag === 'shopping' ? '🛒' : tag === 'idea' ? '💡' : tag === 'reminder' ? '⏰' : tag === 'joy' ? '😊' : '📝'
        }))
      };
      
      // Set horizon if provided
      if (intent.horizon) {
        setHorizon(bubble, intent.horizon);
      }
      
      await addBubble(bubble);
      onBubbleCreated?.(bubble);
      
      // Provide feedback
      await provideFeedback(text, intent);
      
      toast({
        title: `Auto-created ${intent.type}!`,
        description: `${Math.round(intent.confidence * 100)}% confidence: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`,
      });
      
    } catch (error) {
      console.error('Failed to process recording:', error);
      
      // Fallback to browser speech recognition
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
  }, [routeIntent, addBubble, onBubbleCreated, toast]);
  
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
  
  // Browser speech recognition fallback
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
        const intent = routeIntent(text);
        
        const bubble: Bubble = {
          id: crypto.randomUUID(),
          type: intent.type,
          content: text,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          x: Math.random() * 400 + 100,
          y: Math.random() * 300 + 100,
          size: 0.7,
          tags: intent.tags.map(tag => ({
            id: crypto.randomUUID(),
            name: tag,
            emoji: tag === 'shopping' ? '🛒' : tag === 'idea' ? '💡' : '📝'
          }))
        };
        
        await addBubble(bubble);
        await provideFeedback(text, intent);
        resolve();
      };
      
      recognition.onerror = () => reject(new Error('Browser speech recognition failed'));
      recognition.start();
    });
  }, [routeIntent, addBubble, provideFeedback]);
  
  // Button handlers
  const handleMouseDown = useCallback(() => {
    if (recordingMode === 'hold' && !isRecording) {
      startRecording();
    }
  }, [recordingMode, isRecording, startRecording]);
  
  const handleMouseUp = useCallback(() => {
    if (recordingMode === 'hold' && isRecording) {
      stopRecording();
    }
  }, [recordingMode, isRecording, stopRecording]);
  
  const handleClick = useCallback(() => {
    if (recordingMode === 'toggle') {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  }, [recordingMode, isRecording, startRecording, stopRecording]);
  
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
        onMouseLeave={handleMouseUp} // Stop if mouse leaves while holding
        onClick={handleClick}
        disabled={isProcessing}
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