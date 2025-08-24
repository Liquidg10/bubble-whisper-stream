import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Mic, MicOff, Play, Pause, Square, Trash2, Sparkles } from 'lucide-react';
import { modalityService } from '@/services/modalityService';
import { motion, AnimatePresence } from 'framer-motion';

interface EnhancedVoiceCaptureProps {
  onTranscription?: (text: string, sentiment?: any) => void;
  onAudioBlob?: (blob: Blob) => void;
  autoTranscribe?: boolean;
  analyzeSentiment?: boolean;
}

export const EnhancedVoiceCapture: React.FC<EnhancedVoiceCaptureProps> = ({
  onTranscription,
  onAudioBlob,
  autoTranscribe = true,
  analyzeSentiment = true
}) => {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [sentiment, setSentiment] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedBlob(blob);
        onAudioBlob?.(blob);

        // Create audio URL for playback
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        audioUrlRef.current = URL.createObjectURL(blob);

        if (autoTranscribe) {
          await transcribeAudio(blob);
        }

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  }, [autoTranscribe, onAudioBlob, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }, [isRecording]);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    setIsProcessing(true);
    setSentiment(null);
    
    try {
      const result = await modalityService.transcribeVoice(blob);
      
      if (result.success && result.text) {
        setTranscription(result.text);
        
        if (analyzeSentiment) {
          const sentimentResult = await modalityService.analyzeSentiment(result.text);
          setSentiment(sentimentResult);
          onTranscription?.(result.text, sentimentResult);
        } else {
          onTranscription?.(result.text);
        }

        toast({
          title: "Transcription Complete",
          description: result.because,
        });
      } else {
        throw new Error(result.error || 'Transcription failed');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription Failed",
        description: "Could not transcribe audio. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [analyzeSentiment, onTranscription, toast]);

  const togglePlayback = useCallback(() => {
    if (!audioUrlRef.current) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrlRef.current);
      audioRef.current.onloadedmetadata = () => {
        setDuration(audioRef.current?.duration || 0);
      };
      audioRef.current.ontimeupdate = () => {
        setCurrentTime(audioRef.current?.currentTime || 0);
      };
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const clearRecording = useCallback(() => {
    setRecordedBlob(null);
    setTranscription('');
    setSentiment(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-6 space-y-4">
        {/* Recording Controls */}
        <div className="flex items-center justify-center space-x-4">
          {!isRecording ? (
            <Button
              onClick={startRecording}
              disabled={isProcessing}
              size="lg"
              className="rounded-full w-16 h-16"
            >
              <Mic className="w-6 h-6" />
            </Button>
          ) : (
            <Button
              onClick={stopRecording}
              size="lg"
              variant="destructive"
              className="rounded-full w-16 h-16"
            >
              <Square className="w-6 h-6" />
            </Button>
          )}

          {isRecording && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center space-x-2"
            >
              <MicOff className="w-4 h-4 text-destructive animate-pulse" />
              <span className="text-sm font-mono">{formatTime(duration)}</span>
            </motion.div>
          )}
        </div>

        {/* Playback Controls */}
        <AnimatePresence>
          {recordedBlob && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-center space-x-2">
                <Button
                  onClick={togglePlayback}
                  variant="outline"
                  size="sm"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                
                <Button
                  onClick={clearRecording}
                  variant="outline"
                  size="sm"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {duration > 0 && (
                <div className="space-y-1">
                  <Slider
                    value={[currentTime]}
                    max={duration}
                    step={0.1}
                    className="w-full"
                    onValueChange={([value]) => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = value;
                        setCurrentTime(value);
                      }
                    }}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Processing Indicator */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center space-x-2 p-3 bg-muted rounded-lg"
            >
              <Sparkles className="w-4 h-4 animate-spin" />
              <span className="text-sm">Processing with AI...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcription Results */}
        <AnimatePresence>
          {transcription && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="text-sm font-medium mb-2">Transcription:</h4>
                <p className="text-sm">{transcription}</p>
              </div>

              {sentiment && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant={sentiment.sentiment === 'positive' ? 'default' : sentiment.sentiment === 'negative' ? 'destructive' : 'secondary'}>
                    {sentiment.sentiment} ({Math.round(sentiment.confidence * 100)}%)
                  </Badge>
                  {sentiment.emotions.map((emotion: string) => (
                    <Badge key={emotion} variant="outline">
                      {emotion}
                    </Badge>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};