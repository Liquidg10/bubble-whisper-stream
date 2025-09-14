/**
 * Phase 4A: Offline Voice Recorder Component
 * Mobile-optimized voice recording with local storage
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Pause, Play, Square, Trash2 } from 'lucide-react';
import { offlineVoiceRecording } from '@/services/offlineVoiceRecording';
import { useToast } from '@/hooks/use-toast';
import { useMobileCalendarPerformance } from '@/hooks/useMobileCalendarPerformance';

interface OfflineVoiceRecorderProps {
  onRecordingComplete?: (voiceNote: any) => void;
  bubbleId?: string;
  className?: string;
}

export function OfflineVoiceRecorder({ 
  onRecordingComplete, 
  bubbleId, 
  className 
}: OfflineVoiceRecorderProps) {
  const [recordingState, setRecordingState] = useState(offlineVoiceRecording.getRecordingState());
  const [voiceNotes, setVoiceNotes] = useState<any[]>([]);
  const { toast } = useToast();
  const { triggerHaptic, getAdaptiveStyles } = useMobileCalendarPerformance();

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (recordingState.isRecording && !recordingState.isPaused) {
      interval = setInterval(() => {
        setRecordingState(offlineVoiceRecording.getRecordingState());
      }, 100);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingState.isRecording, recordingState.isPaused]);

  useEffect(() => {
    loadVoiceNotes();
    offlineVoiceRecording.initialize();
  }, [bubbleId]);

  const loadVoiceNotes = async () => {
    const notes = await offlineVoiceRecording.getVoiceNotes(bubbleId);
    setVoiceNotes(notes);
  };

  const handleStartRecording = async () => {
    triggerHaptic('light');
    const success = await offlineVoiceRecording.startRecording();
    
    if (success) {
      setRecordingState(offlineVoiceRecording.getRecordingState());
      toast({
        title: "Recording started",
        description: "Tap pause or stop when finished",
      });
    } else {
      toast({
        title: "Recording failed",
        description: "Please check microphone permissions",
        variant: "destructive"
      });
    }
  };

  const handlePauseRecording = () => {
    triggerHaptic('medium');
    if (recordingState.isPaused) {
      offlineVoiceRecording.resumeRecording();
    } else {
      offlineVoiceRecording.pauseRecording();
    }
    setRecordingState(offlineVoiceRecording.getRecordingState());
  };

  const handleStopRecording = async () => {
    triggerHaptic('heavy');
    const voiceNote = await offlineVoiceRecording.stopRecording();
    
    if (voiceNote) {
      setRecordingState(offlineVoiceRecording.getRecordingState());
      await loadVoiceNotes();
      onRecordingComplete?.(voiceNote);
      
      toast({
        title: "Recording saved",
        description: `${formatDuration(voiceNote.duration)} voice note saved offline`,
      });
    }
  };

  const handleDeleteVoiceNote = async (id: string) => {
    triggerHaptic('medium');
    const success = await offlineVoiceRecording.deleteVoiceNote(id);
    
    if (success) {
      await loadVoiceNotes();
      toast({
        title: "Voice note deleted",
        description: "Recording removed from storage",
      });
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const adaptiveStyles = getAdaptiveStyles();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Recording Controls */}
      <div className="flex items-center justify-center space-x-2 p-4 bg-card rounded-lg" style={adaptiveStyles}>
        {!recordingState.isRecording ? (
          <Button
            onClick={handleStartRecording}
            size="lg"
            className="flex items-center space-x-2"
            style={{ minHeight: '48px', minWidth: '48px' }}
          >
            <Mic className="h-5 w-5" />
            <span>Start Recording</span>
          </Button>
        ) : (
          <div className="flex items-center space-x-2">
            <Button
              onClick={handlePauseRecording}
              variant="outline"
              size="lg"
              style={{ minHeight: '48px', minWidth: '48px' }}
            >
              {recordingState.isPaused ? (
                <Play className="h-5 w-5" />
              ) : (
                <Pause className="h-5 w-5" />
              )}
            </Button>
            
            <Button
              onClick={handleStopRecording}
              variant="destructive"
              size="lg"
              style={{ minHeight: '48px', minWidth: '48px' }}
            >
              <Square className="h-5 w-5" />
            </Button>
            
            <div className="flex flex-col items-center">
              <div className="text-sm font-medium">
                {formatDuration(recordingState.duration)}
              </div>
              <div className="text-xs text-muted-foreground">
                {recordingState.isPaused ? 'Paused' : 'Recording...'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recording Indicator */}
      {recordingState.isRecording && (
        <div className="flex items-center justify-center space-x-2 p-2">
          <div 
            className={`w-3 h-3 rounded-full ${
              recordingState.isPaused ? 'bg-yellow-500' : 'bg-red-500'
            } ${recordingState.isPaused ? '' : 'animate-pulse'}`} 
          />
          <span className="text-sm text-muted-foreground">
            {recordingState.isPaused ? 'Recording paused' : 'Recording in progress'}
          </span>
        </div>
      )}

      {/* Saved Voice Notes */}
      {voiceNotes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Saved Voice Notes ({voiceNotes.length})
          </h4>
          
          {voiceNotes.map((note) => (
            <div 
              key={note.id} 
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
              style={adaptiveStyles}
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <Mic className="h-4 w-4 text-primary" />
                </div>
                
                <div>
                  <div className="text-sm font-medium">
                    {formatDuration(note.duration)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(note.timestamp).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {note.synced ? '✓ Synced' : '⏳ Local only'}
                  </div>
                </div>
              </div>
              
              <Button
                onClick={() => handleDeleteVoiceNote(note.id)}
                variant="ghost"
                size="sm"
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Offline Status */}
      <div className="text-xs text-muted-foreground text-center">
        Voice notes are saved locally and will sync when online
      </div>
    </div>
  );
}