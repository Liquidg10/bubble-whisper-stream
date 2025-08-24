import React, { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Play, Pause, Trash2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/use-toast';
import { advancedAIService } from '@/services/advancedAIService';
import AIIndicator from '@/components/AIIndicator';

interface VoiceCaptureProps {
  onTranscription?: (text: string, analysis?: any) => void;
  onAudioBlob?: (blob: Blob) => void;
  autoTranscribe?: boolean;
  analyzePatterns?: boolean;
  className?: string;
}

const VoiceCapture: React.FC<VoiceCaptureProps> = ({
  onTranscription,
  onAudioBlob,
  autoTranscribe = true,
  analyzePatterns = true,
  className = ''
}) => {
  const { toast } = useToast();
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const mediaRecorder = await advancedAIService.startVoiceRecording();
      if (!mediaRecorder) {
        toast({
          title: "Recording not available",
          description: "Voice recording is not supported in this browser",
          variant: "destructive",
        });
        return;
      }

      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);
      
      // Update duration timer
      recordingTimerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      toast({
        title: "Recording started",
        description: "Speak clearly for best transcription results",
      });

    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Recording failed",
        description: "Could not access microphone",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    try {
      const blob = await advancedAIService.stopVoiceRecording(mediaRecorderRef.current);
      
      setIsRecording(false);
      setRecordedBlob(blob);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }

      // Create audio URL for playback
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      audioUrlRef.current = URL.createObjectURL(blob);

      onAudioBlob?.(blob);

      // Auto-transcribe if enabled
      if (autoTranscribe) {
        await transcribeAudio(blob);
      }

      toast({
        title: "Recording complete",
        description: `${duration} seconds recorded`,
      });

    } catch (error) {
      console.error('Failed to stop recording:', error);
      toast({
        title: "Recording failed",
        description: "Could not save recording",
        variant: "destructive",
      });
    }
  }, [isRecording, duration, autoTranscribe, onAudioBlob, toast]);

  // Transcribe audio
  const transcribeAudio = useCallback(async (blob?: Blob) => {
    const audioBlob = blob || recordedBlob;
    if (!audioBlob) return;

    setIsProcessing(true);
    
    try {
      const result = await advancedAIService.transcribeVoice(audioBlob, {
        language: 'en',
        includeTimestamps: true
      });

      if (result.success && result.text) {
        setTranscription(result.text);
        onTranscription?.(result.text);

        // Analyze patterns if enabled
        if (analyzePatterns) {
          const patternResult = await advancedAIService.analyzePatterns(result.text, {
            operation: 'analyze',
            contentType: 'voice'
          });
          
          if (patternResult.success) {
            setAnalysis(patternResult.analysis);
            onTranscription?.(result.text, patternResult.analysis);
          }
        }

        toast({
          title: "Transcription complete",
          description: result.because || "Voice successfully transcribed",
        });
      } else {
        throw new Error(result.error || 'Transcription failed');
      }

    } catch (error) {
      console.error('Transcription failed:', error);
      toast({
        title: "Transcription failed",
        description: "Could not transcribe audio. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [recordedBlob, onTranscription, analyzePatterns, toast]);

  // Play/pause audio
  const togglePlayback = useCallback(() => {
    if (!audioUrlRef.current) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrlRef.current);
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

  // Clear recording
  const clearRecording = useCallback(() => {
    setRecordedBlob(null);
    setTranscription('');
    setAnalysis(null);
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

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Recording controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={isRecording ? "destructive" : "default"}
                size="lg"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className="relative"
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-5 h-5 mr-2" />
                    Stop ({formatTime(duration)})
                  </>
                ) : (
                  <>
                    <Mic className="w-5 h-5 mr-2" />
                    Record
                  </>
                )}
                
                {isRecording && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                )}
              </Button>
              
              <AIIndicator showStatus size="sm" />
            </div>

            {recordedBlob && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePlayback}
                  disabled={isProcessing}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => transcribeAudio()}
                  disabled={isProcessing}
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearRecording}
                  disabled={isProcessing}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Audio playback controls */}
          {recordedBlob && audioRef.current && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <div className="flex-1">
                  <Slider
                    value={[currentTime]}
                    max={audioRef.current?.duration || duration}
                    step={0.1}
                    onValueChange={([value]) => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = value;
                        setCurrentTime(value);
                      }
                    }}
                    className="w-full"
                  />
                </div>
                <span>{formatTime(audioRef.current?.duration || duration)}</span>
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex items-center justify-center gap-2 py-4">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">
                Processing with AI...
              </span>
            </div>
          )}

          {/* Transcription results */}
          {transcription && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Transcription</Badge>
                <AIIndicator model="ai" size="sm" />
              </div>
              
              <div className="p-3 bg-accent/50 rounded-lg">
                <p className="text-sm">{transcription}</p>
              </div>
              
              {analysis && (
                <div className="space-y-2">
                  <Badge variant="outline">AI Analysis</Badge>
                  
                  {analysis.sentiment && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Sentiment:</span>
                      <Badge variant={
                        analysis.sentiment === 'positive' ? 'default' :
                        analysis.sentiment === 'negative' ? 'destructive' : 'secondary'
                      }>
                        {analysis.sentiment}
                      </Badge>
                    </div>
                  )}
                  
                  {analysis.patterns && analysis.patterns.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium">Patterns:</span>
                      <div className="flex flex-wrap gap-1">
                        {analysis.patterns.slice(0, 3).map((pattern: string, index: number) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {pattern}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default VoiceCapture;