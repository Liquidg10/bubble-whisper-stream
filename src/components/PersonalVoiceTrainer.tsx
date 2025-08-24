import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { Mic, Play, Pause, RotateCcw, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './ui/use-toast';
import { useBubbleStore } from '@/stores/bubbleStore';

const SAMPLE_PHRASES = [
  "The quick brown fox jumps over the lazy dog.",
  "She sells seashells by the seashore.",
  "How much wood would a woodchuck chuck if a woodchuck could chuck wood?",
  "Peter Piper picked a peck of pickled peppers.",
  "I scream, you scream, we all scream for ice cream!"
];

const REQUIRED_SAMPLES = 5;
const SAMPLE_DURATION = 30; // seconds

export function PersonalVoiceTrainer() {
  const { settings } = useBubbleStore();
  const [currentSample, setCurrentSample] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSamples, setRecordedSamples] = useState<boolean[]>(new Array(REQUIRED_SAMPLES).fill(false));
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Auto-stop after sample duration
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= SAMPLE_DURATION) {
            stopRecording();
            return SAMPLE_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Recording Failed",
        description: "Unable to access microphone",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  }, [mediaRecorder, isRecording]);

  const uploadSample = useCallback(async () => {
    if (!recordedBlob) return;

    setIsUploading(true);
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        const { data, error } = await supabase.functions.invoke('personal-voice-record', {
          body: {
            audioData: base64Audio,
            sampleIndex: currentSample,
            totalSamples: REQUIRED_SAMPLES
          }
        });

        if (error) throw error;

        if (data.success) {
          const newRecordedSamples = [...recordedSamples];
          newRecordedSamples[currentSample] = true;
          setRecordedSamples(newRecordedSamples);
          
          toast({
            title: "Sample Recorded",
            description: `Voice sample ${currentSample + 1} uploaded successfully`,
          });

          // Move to next sample or complete
          if (currentSample < REQUIRED_SAMPLES - 1) {
            setCurrentSample(currentSample + 1);
          } else {
            toast({
              title: "Voice Training Complete!",
              description: "All voice samples collected. Your personal voice is being processed.",
            });
          }
          
          setRecordedBlob(null);
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      };
      reader.readAsDataURL(recordedBlob);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : 'Failed to upload sample',
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [recordedBlob, currentSample, recordedSamples, toast]);

  const reRecordSample = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
  };

  const isEnabled = settings.biometricEnabled && settings.personalVoiceEnabled;
  const completedSamples = recordedSamples.filter(Boolean).length;
  const isComplete = completedSamples === REQUIRED_SAMPLES;

  if (!isEnabled) {
    return (
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Personal Voice Clone requires biometric authentication to be enabled first for security.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-purple-600" />
          Personal Voice Trainer
          <Badge variant={isComplete ? "default" : "secondary"}>
            {completedSamples}/{REQUIRED_SAMPLES} Samples
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Training Progress</span>
            <span>{Math.round((completedSamples / REQUIRED_SAMPLES) * 100)}%</span>
          </div>
          <Progress value={(completedSamples / REQUIRED_SAMPLES) * 100} />
        </div>

        {!isComplete && (
          <>
            {/* Current Sample */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Sample {currentSample + 1}</h3>
                {recordedSamples[currentSample] && (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm italic">
                  "{SAMPLE_PHRASES[currentSample]}"
                </p>
              </div>

              {/* Recording Controls */}
              <div className="space-y-4">
                {!recordedBlob ? (
                  <div className="space-y-2">
                    <Button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isUploading}
                      className="w-full"
                      variant={isRecording ? "destructive" : "default"}
                    >
                      {isRecording ? (
                        <>
                          <Pause className="h-4 w-4 mr-2" />
                          Stop Recording ({SAMPLE_DURATION - recordingTime}s)
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4 mr-2" />
                          Start Recording
                        </>
                      )}
                    </Button>
                    
                    {isRecording && (
                      <Progress value={(recordingTime / SAMPLE_DURATION) * 100} />
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button onClick={uploadSample} disabled={isUploading} className="flex-1">
                        {isUploading ? "Uploading..." : "Save Sample"}
                      </Button>
                      <Button onClick={reRecordSample} variant="outline">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sample Overview */}
            <div className="grid grid-cols-5 gap-2">
              {SAMPLE_PHRASES.map((_, index) => (
                <div
                  key={index}
                  className={`p-2 text-center text-xs rounded border ${
                    recordedSamples[index] 
                      ? 'bg-green-100 border-green-300 text-green-800' 
                      : index === currentSample
                      ? 'bg-blue-100 border-blue-300 text-blue-800'
                      : 'bg-muted'
                  }`}
                >
                  {index + 1}
                </div>
              ))}
            </div>
          </>
        )}

        {isComplete && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Training Complete!</strong> Your personal voice model is being processed. 
              You'll be able to use it for text-to-speech once ready.
            </AlertDescription>
          </Alert>
        )}

        {/* Privacy Notice */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Privacy Promise:</strong> Voice samples are encrypted and stored locally. 
            They're only used to create your personal TTS voice and are never shared.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}