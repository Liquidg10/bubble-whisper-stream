import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Check, AlertCircle, Clock } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { voiceRouter } from '@/intent/voiceRouter';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface HeaderVoiceCaptureProps {
  className?: string;
  onBubbleCreated?: (bubble: any) => void;
}

export const HeaderVoiceCapture: React.FC<HeaderVoiceCaptureProps> = ({
  className,
  onBubbleCreated
}) => {
  const { addBubble, settings } = useBubbleStore();
  
  // Get voice settings from bubble store
  const voiceAutoCommit = settings.voiceAutoCommit ?? true;
  const confidenceThreshold = settings.voiceConfidenceThreshold ?? 0.7;
  const voiceHotkey = settings.voiceHotkey ?? 'Space';

  // States
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [currentIntent, setCurrentIntent] = useState<any>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<any>(null);
  const [bubbleCreated, setBubbleCreated] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Refs
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hotkey handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === voiceHotkey && !e.repeat) {
        e.preventDefault();
        if (!isListening && !isProcessing) {
          startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === voiceHotkey && isListening) {
        e.preventDefault();
        stopListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [voiceHotkey, isListening, isProcessing]);

  const startListening = async () => {
    try {
      setIsListening(true);
      setLiveTranscript('');
      setCurrentIntent(null);
      setConfidence(0);
      setBubbleCreated(false);
      setSuccessMessage('');

      // Web Speech API setup
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              // Handle final results in stopListening
            } else {
              interimTranscript += transcript;
            }
          }
          setLiveTranscript(interimTranscript);
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      // Audio recording setup
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      mediaRecorder.start();

    } catch (error) {
      console.error('Error starting voice capture:', error);
      setIsListening(false);
    }
  };

  const stopListening = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    setIsListening(false);
    setIsProcessing(true);

    // Get final transcript
    if (recognitionRef.current) {
      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript.trim()) {
          processFinalTranscript(finalTranscript.trim());
        } else {
          setIsProcessing(false);
        }
      };
    }

    // Fallback: process current live transcript if no final result
    processingTimeoutRef.current = setTimeout(() => {
      if (liveTranscript.trim()) {
        processFinalTranscript(liveTranscript.trim());
      } else {
        setIsProcessing(false);
      }
    }, 1000);
  };

  const processFinalTranscript = async (transcript: string) => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }

    try {
      // Route the intent
      const intent = voiceRouter.route(transcript);
      setCurrentIntent(intent);
      setConfidence(intent.confidence);

      // Handle based on confidence and auto-commit settings
      if (intent.confidence >= 0.85 && intent.autoCommitRecommended && voiceAutoCommit) {
        // High confidence + auto-commit enabled = create bubble immediately
        await createBubbleFromIntent(transcript, intent);
      } else if (intent.confidence >= confidenceThreshold && intent.confidence < 0.85) {
        // Medium confidence = ask for confirmation
        setPendingIntent({ transcript, intent });
        setAwaitingConfirmation(true);
      } else {
        // Low confidence = just show the intent without creating
        toast.info(`I heard "${transcript}" but wasn't sure what to do. Try being more specific.`);
      }

    } catch (error) {
      console.error('Error processing voice input:', error);
      toast.error('Error processing voice input');
    } finally {
      setIsProcessing(false);
    }
  };

  const createBubbleFromIntent = async (transcript: string, intent: any) => {
    try {
      const bubble = voiceRouter.createBubbleFromIntent(transcript, intent);
      
      // Add to store
      addBubble(bubble);

      // Show success
      setBubbleCreated(true);
      setSuccessMessage(`Created ${intent.type}: "${bubble.content || 'bubble'}"`);
      
      // Toast notification
      toast.success(`Auto-created ${intent.type} bubble`, {
        description: bubble.content,
        action: {
          label: "Undo",
          onClick: () => {
            // TODO: Implement undo functionality
            toast.info("Undo functionality coming soon");
          }
        }
      });

      // Call callback
      onBubbleCreated?.(bubble);

      // Clear after delay
      setTimeout(() => {
        setBubbleCreated(false);
        setSuccessMessage('');
        setCurrentIntent(null);
        setConfidence(0);
      }, 3000);

    } catch (error) {
      console.error('Error creating bubble:', error);
      toast.error('Error creating bubble');
    }
  };

  const handleConfirmation = async (confirmed: boolean) => {
    if (confirmed && pendingIntent) {
      await createBubbleFromIntent(pendingIntent.transcript, pendingIntent.intent);
    }
    
    setAwaitingConfirmation(false);
    setPendingIntent(null);
  };

  const getStatusIcon = () => {
    if (isProcessing) return <Clock className="h-3 w-3" />;
    if (bubbleCreated) return <Check className="h-3 w-3 text-green-600" />;
    if (awaitingConfirmation) return <AlertCircle className="h-3 w-3 text-yellow-600" />;
    if (isListening) return <Mic className="h-3 w-3" />;
    return <MicOff className="h-3 w-3" />;
  };

  const getButtonVariant = () => {
    if (awaitingConfirmation) return 'outline';
    if (isListening) return 'default';
    return 'ghost';
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Voice Button */}
      <Button
        variant={getButtonVariant()}
        size="sm"
        className={cn(
          'h-8 w-8 p-0 transition-all duration-200',
          isListening && 'ring-2 ring-primary animate-pulse',
          awaitingConfirmation && 'ring-2 ring-yellow-500'
        )}
        onMouseDown={startListening}
        onMouseUp={stopListening}
        onMouseLeave={stopListening}
        disabled={isProcessing}
        title={`Hold ${voiceHotkey} to speak`}
      >
        {getStatusIcon()}
      </Button>

      {/* Confidence Badge */}
      {confidence > 0 && (
        <Badge 
          variant="secondary" 
          className="text-xs h-5 px-2"
        >
          {Math.round(confidence * 100)}%
        </Badge>
      )}

      {/* Success Message */}
      {bubbleCreated && successMessage && (
        <span className="text-xs text-green-600 font-medium">
          ✓ {successMessage}
        </span>
      )}

      {/* Confirmation */}
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
    </div>
  );
};