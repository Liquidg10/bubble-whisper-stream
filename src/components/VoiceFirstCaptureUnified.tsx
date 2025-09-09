/**
 * VoiceFirstCaptureUnified - Enhanced overlay using unified VoiceEngine
 * Phase 2: Presentation adapter with rich UI and conversational features
 */

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Volume2, Check, X, Settings, Zap, Move } from 'lucide-react';
import { useVoiceEngine } from '@/hooks/useVoiceEngine';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { OverlayHandle } from '@/components/OverlayHandle';
import { flags } from '@/config/flags';
import { toast } from 'sonner';

interface VoiceFirstCaptureUnifiedProps {
  className?: string;
  onBubbleCreated?: (bubble: any) => void;
}

export const VoiceFirstCaptureUnified: React.FC<VoiceFirstCaptureUnifiedProps> = ({
  className,
  onBubbleCreated
}) => {
  // Use unified voice engine
  const voiceEngine = useVoiceEngine({
    source: 'voice-first-capture',
    mode: 'conversational',
    enableHotkey: flags.VOICE_HOTKEY_UNIFIED,
    hotkeyPriority: 10, // High priority overlay component
    onResult: (result) => {
      onBubbleCreated?.(result.bubble);
    },
    onError: (error) => {
      toast.error(`Voice capture failed: ${error.message}`);
    }
  });

  // Drag state (preserved from original)
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  // Confirmation states for medium confidence
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  // Handle confirmation for medium confidence intents
  const handleConfirmation = async (confirmed: boolean) => {
    if (!voiceEngine.lastResult) return;

    if (confirmed && voiceEngine.lastResult.intent) {
      // Create bubble manually if not auto-committed
      const bubble = voiceEngine.createBubbleFromResult(voiceEngine.lastResult);
      onBubbleCreated?.(bubble);
      toast.success(`Created ${voiceEngine.lastResult.intent.type}`);
    } else {
      toast.info('Voice input cancelled');
    }
    
    setAwaitingConfirmation(false);
  };

  // Check if we need confirmation
  React.useEffect(() => {
    if (voiceEngine.lastIntent?.confidenceGate === 'medium' && 
        !voiceEngine.lastResult?.autoCommitted &&
        voiceEngine.lastResult?.transcript) {
      setAwaitingConfirmation(true);
    } else {
      setAwaitingConfirmation(false);
    }
  }, [voiceEngine.lastIntent, voiceEngine.lastResult]);

  const getStatusText = () => {
    if (voiceEngine.isRecording) return 'Listening...';
    if (voiceEngine.isProcessing) return 'Processing...';
    if (awaitingConfirmation) return 'Confirm?';
    return `Hold ${voiceEngine.hotkey} to speak`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Drag handlers (preserved from original)
  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      
      setPosition({
        x: dragRef.current.startPosX + deltaX,
        y: dragRef.current.startPosY + deltaY
      });
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      className={cn('fixed z-50', className)}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          'transition-all duration-200',
          isDragging && 'cursor-grabbing scale-105'
        )}
      >
        <Card className="w-80 shadow-lg backdrop-blur-sm bg-background/95">
          {/* Header with drag handle */}
          <div 
            className="flex items-center justify-between p-3 border-b cursor-grab active:cursor-grabbing"
            onMouseDown={handleDragStart}
          >
            <div className="flex items-center gap-2">
              <Move className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Voice Capture</span>
            </div>
            
            <div className="flex items-center gap-1">
              {flags.VOICE_DEBUG_LOGGING && (
                <Badge variant="outline" className="text-xs">
                  {voiceEngine.sessionState}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => voiceEngine.forceStop()}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Main content */}
          <div className="p-4 space-y-4">
            {/* Central voice button */}
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                variant={voiceEngine.isRecording ? 'destructive' : 'default'}
                className={cn(
                  'h-20 w-20 rounded-full transition-all duration-200',
                  voiceEngine.isRecording && 'animate-pulse ring-4 ring-primary/30',
                  awaitingConfirmation && 'ring-4 ring-yellow-500/30'
                )}
                onMouseDown={() => voiceEngine.startRecording()}
                onMouseUp={() => voiceEngine.stopRecording()}
                onMouseLeave={() => voiceEngine.stopRecording()}
                disabled={voiceEngine.isProcessing || !voiceEngine.canStartRecording}
              >
                {voiceEngine.isRecording ? (
                  <MicOff className="h-8 w-8" />
                ) : (
                  <Mic className="h-8 w-8" />
                )}
              </Button>

              <span className="text-sm text-muted-foreground text-center">
                {getStatusText()}
              </span>
            </div>

            {/* Live transcript */}
            <AnimatePresence>
              {voiceEngine.liveTranscript && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-3 bg-muted rounded-lg min-h-[60px] flex items-center"
                >
                  <p className="text-sm italic">
                    "{voiceEngine.liveTranscript}"
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Intent and confidence display */}
            <AnimatePresence>
              {voiceEngine.lastIntent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {voiceEngine.lastIntent.type}
                    </span>
                    {voiceEngine.lastIntent.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  
                  <Badge 
                    variant="secondary"
                    className={cn(
                      'text-xs',
                      getConfidenceColor(voiceEngine.lastIntent.confidence)
                    )}
                  >
                    {Math.round(voiceEngine.lastIntent.confidence * 100)}%
                  </Badge>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Confirmation controls */}
            <AnimatePresence>
              {awaitingConfirmation && voiceEngine.lastResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
                >
                  <span className="text-sm flex-1">
                    Create {voiceEngine.lastIntent?.type}?
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleConfirmation(true)}
                    className="h-8"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Yes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConfirmation(false)}
                    className="h-8"
                  >
                    <X className="h-4 w-4 mr-1" />
                    No
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success feedback */}
            <AnimatePresence>
              {voiceEngine.lastResult?.autoCommitted && voiceEngine.lastResult?.bubble && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
                >
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-300">
                    Created {voiceEngine.lastResult.intent.type}!
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Debug info */}
            {flags.VOICE_DEBUG_LOGGING && (
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Engine: {voiceEngine.sessionState}</div>
                <div>Backend: {voiceEngine.lastResult?.backend || 'none'}</div>
                <div>Session: {voiceEngine.canStartRecording ? 'available' : 'busy'}</div>
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );
};