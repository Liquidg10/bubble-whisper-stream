/**
 * HeaderVoiceCapture - Migrated to use unified VoiceEngine
 * Phase 2: Presentation adapter that preserves UI but uses VoiceEngine
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Check, AlertCircle, Clock } from 'lucide-react';
import { useVoiceEngine } from '@/hooks/useVoiceEngine';
import { cn } from '@/lib/utils';
import { flags } from '@/config/flags';

interface HeaderVoiceCaptureProps {
  className?: string;
  onBubbleCreated?: (bubble: any) => void;
}

export const HeaderVoiceCapture: React.FC<HeaderVoiceCaptureProps> = ({
  className,
  onBubbleCreated
}) => {
  // Use unified voice engine if flag is enabled, otherwise fallback to old implementation
  const useUnifiedEngine = flags.VOICE_ENGINE_UNIFIED;
  
  const voiceEngine = useVoiceEngine({
    source: 'header-voice-capture',
    mode: 'quick',
    enableHotkey: useUnifiedEngine && flags.VOICE_HOTKEY_UNIFIED,
    hotkeyPriority: 1, // Lower priority than overlay components
    onResult: (result) => {
      onBubbleCreated?.(result.bubble);
    }
  });

  // Fallback to original implementation if unified engine is disabled
  if (!useUnifiedEngine) {
    return <HeaderVoiceCaptureOriginal className={className} onBubbleCreated={onBubbleCreated} />;
  }

  const getStatusIcon = () => {
    if (voiceEngine.isProcessing) return <Clock className="h-3 w-3" />;
    if (voiceEngine.lastResult?.autoCommitted) return <Check className="h-3 w-3 text-green-600" />;
    if (voiceEngine.lastIntent?.needsClarification) return <AlertCircle className="h-3 w-3 text-yellow-600" />;
    if (voiceEngine.isRecording) return <Mic className="h-3 w-3" />;
    return <MicOff className="h-3 w-3" />;
  };

  const getButtonVariant = () => {
    if (voiceEngine.lastIntent?.needsClarification) return 'outline';
    if (voiceEngine.isRecording) return 'default';
    return 'ghost';
  };

  const getConfidence = () => {
    return voiceEngine.lastIntent?.confidence || 0;
  };

  const getSuccessMessage = () => {
    if (voiceEngine.lastResult?.autoCommitted && voiceEngine.lastResult?.bubble) {
      return `Created ${voiceEngine.lastResult.intent.type}: \"${voiceEngine.lastResult.bubble.content || 'bubble'}\"`;
    }
    return '';
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Voice Button */}
      <Button
        variant={getButtonVariant()}
        size="sm"
        className={cn(
          'h-8 w-8 p-0 transition-all duration-200',
          voiceEngine.isRecording && 'ring-2 ring-primary animate-pulse',
          voiceEngine.lastIntent?.needsClarification && 'ring-2 ring-yellow-500'
        )}
        onMouseDown={() => voiceEngine.startRecording()}
        onMouseUp={() => voiceEngine.stopRecording()}
        onMouseLeave={() => voiceEngine.stopRecording()}
        disabled={voiceEngine.isProcessing || !voiceEngine.canStartRecording}
        title={`Hold ${voiceEngine.hotkey} to speak`}
      >
        {getStatusIcon()}
      </Button>

      {/* Confidence Badge */}
      {getConfidence() > 0 && (
        <Badge 
          variant="secondary" 
          className="text-xs h-5 px-2"
        >
          {Math.round(getConfidence() * 100)}%
        </Badge>
      )}

      {/* Success Message */}
      {voiceEngine.lastResult?.autoCommitted && getSuccessMessage() && (
        <span className="text-xs text-green-600 font-medium">
          ✓ {getSuccessMessage()}
        </span>
      )}

      {/* Live Transcript (for debugging) */}
      {flags.VOICE_DEBUG_LOGGING && voiceEngine.liveTranscript && (
        <span className="text-xs text-muted-foreground max-w-32 truncate">
          "{voiceEngine.liveTranscript}"
        </span>
      )}
    </div>
  );
};

// Original implementation for fallback
const HeaderVoiceCaptureOriginal: React.FC<HeaderVoiceCaptureProps> = ({ className, onBubbleCreated }) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        disabled
        title="Voice capture (legacy mode)"
      >
        <MicOff className="h-3 w-3" />
      </Button>
      <span className="text-xs text-muted-foreground">
        Legacy mode
      </span>
    </div>
  );
};
