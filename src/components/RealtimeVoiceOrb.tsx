/**
 * Floating realtime voice orb with VU meter and barge-in capabilities
 * Press-to-hold + tap-to-toggle modes with latency indicators
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Mic, MicOff, Zap, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { useBubbleStore } from '@/stores/bubbleStore';
import { voiceRealtimeService, SessionState, AudioMetrics, PartialTranscript } from '@/services/voiceRealtime';
import { voiceRouter } from '@/intent/voiceRouter';
import { crossViewUndoService } from '@/services/crossViewUndoService';
import { isFeatureEnabled } from '@/config/flags';

interface RealtimeVoiceOrbProps {
  className?: string;
  onBubbleCreated?: (bubble: any) => void;
}

export const RealtimeVoiceOrb: React.FC<RealtimeVoiceOrbProps> = ({ 
  className, 
  onBubbleCreated 
}) => {
  const { toast } = useToast();
  const { addBubble, bubbles } = useBubbleStore();
  
  // Session state
  const [sessionState, setSessionState] = useState<SessionState>('disconnected');
  const [isInteractionMode, setIsInteractionMode] = useState<'hold' | 'toggle'>('hold');
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Audio metrics
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
    inputLevel: 0,
    outputLevel: 0,
    latencyMs: 0,
    vadState: 'silence'
  });
  
  // Transcription state
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [isProcessingIntent, setIsProcessingIntent] = useState(false);
  
  // Performance metrics
  const [latencyMetrics, setLatencyMetrics] = useState({
    sttFirst: 0,
    ttsStart: 0,
    bargeIn: 0,
    connected: false
  });
  
  // Refs for interaction handling
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);

  // Feature flag check
  const isEnabled = isFeatureEnabled('realtimeVoice');

  useEffect(() => {
    if (!isEnabled) return;

    // Setup voice service callbacks
    voiceRealtimeService.onStateChange(setSessionState);
    voiceRealtimeService.onAudioMetrics(setAudioMetrics);
    voiceRealtimeService.onPartialTranscript(handlePartialTranscript);
    voiceRealtimeService.onFinalTranscript(handleFinalTranscript);
    voiceRealtimeService.onError(handleError);
    voiceRealtimeService.onTTSStart(() => {
      setLatencyMetrics(prev => ({ ...prev, ttsStart: performance.now() }));
    });

    return () => {
      voiceRealtimeService.stopSession();
    };
  }, [isEnabled]);

  const handlePartialTranscript = useCallback((transcript: PartialTranscript) => {
    setPartialTranscript(transcript.text);
    
    // Record STT first token latency
    if (!latencyMetrics.sttFirst && transcript.text.trim()) {
      setLatencyMetrics(prev => ({ ...prev, sttFirst: performance.now() }));
    }
  }, [latencyMetrics.sttFirst]);

  const handleFinalTranscript = useCallback(async (text: string) => {
    setFinalTranscript(text);
    setPartialTranscript('');
    
    if (!text.trim()) return;

    try {
      setIsProcessingIntent(true);
      
      // Route intent with context
      const context = {
        timeOfDay: getTimeOfDay(),
        recentBubbles: bubbles.slice(-5)
      };
      
      const intent = voiceRouter.route(text, { context });
      
      if (intent.needsClarification) {
        // For now, create as Thought and let user manually adjust
        // In future: implement clarification dialog
        console.log('Intent needs clarification:', intent.clarification);
      }
      
      // Create bubble
      const bubble = voiceRouter.createBubbleFromIntent(text, intent);
      await addBubble(bubble);
      
      // Add to undo stack
      crossViewUndoService.addEntry({
        view: 'bubble',
        type: 'create',
        data: { bubble },
        description: `Voice created ${intent.type}: "${text.substring(0, 30)}..."`
      });
      
      onBubbleCreated?.(bubble);
      
      toast({
        title: "Voice Captured",
        description: `Created ${intent.type.toLowerCase()}: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`,
      });
      
    } catch (error) {
      console.error('Failed to process voice intent:', error);
      toast({
        title: "Processing Failed",
        description: "Could not process voice command",
        variant: "destructive"
      });
    } finally {
      setIsProcessingIntent(false);
      setFinalTranscript('');
    }
  }, [bubbles, addBubble, onBubbleCreated, toast]);

  const handleError = useCallback((error: Error) => {
    console.error('Voice session error:', error);
    toast({
      title: "Voice Error",
      description: error.message,
      variant: "destructive"
    });
  }, [toast]);

  const startSession = useCallback(async () => {
    if (sessionState !== 'disconnected') return;

    try {
      const id = await voiceRealtimeService.startSession({
        instructions: "You are a helpful voice assistant for capturing thoughts, reminders, and tasks. Be concise and natural in your responses.",
        interruptionEnabled: true,
        vadThreshold: 0.02,
        silenceDuration: 800
      });
      
      setSessionId(id);
      setLatencyMetrics(prev => ({ ...prev, connected: true }));
      
      toast({
        title: "Voice Ready",
        description: "Realtime voice interface connected",
      });
      
    } catch (error) {
      console.error('Failed to start voice session:', error);
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : 'Could not start voice session',
        variant: "destructive"
      });
    }
  }, [sessionState, toast]);

  const stopSession = useCallback(async () => {
    try {
      await voiceRealtimeService.stopSession();
      setSessionId(null);
      setPartialTranscript('');
      setFinalTranscript('');
      setLatencyMetrics({
        sttFirst: 0,
        ttsStart: 0,
        bargeIn: 0,
        connected: false
      });
    } catch (error) {
      console.error('Failed to stop voice session:', error);
    }
  }, []);

  const handleMouseDown = useCallback(() => {
    if (isInteractionMode !== 'hold') return;
    
    isHoldingRef.current = true;
    // Start session if not already connected
    if (sessionState === 'disconnected') {
      startSession();
    }
  }, [isInteractionMode, sessionState, startSession]);

  const handleMouseUp = useCallback(() => {
    if (isInteractionMode === 'hold') {
      isHoldingRef.current = false;
    }
  }, [isInteractionMode]);

  const handleClick = useCallback(() => {
    if (isInteractionMode === 'toggle') {
      if (sessionState === 'disconnected') {
        startSession();
      } else {
        stopSession();
      }
    }
  }, [isInteractionMode, sessionState, startSession, stopSession]);

  const handleBargeIn = useCallback(() => {
    if (sessionState === 'listening') {
      const startTime = performance.now();
      voiceRealtimeService.interruptTTS();
      setLatencyMetrics(prev => ({ 
        ...prev, 
        bargeIn: performance.now() - startTime 
      }));
    }
  }, [sessionState]);

  const getTimeOfDay = (): string => {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  };

  const getOrbColor = (): string => {
    switch (sessionState) {
      case 'speaking':
        return 'bg-blue-500';
      case 'listening':
        return 'bg-green-500';
      case 'processing':
        return 'bg-yellow-500';
      case 'connected':
        return 'bg-primary';
      case 'connecting':
        return 'bg-orange-500';
      default:
        return 'bg-muted';
    }
  };

  const getStatusText = (): string => {
    switch (sessionState) {
      case 'speaking':
        return isInteractionMode === 'hold' ? 'Speaking (release when done)' : 'Speaking (tap to stop)';
      case 'listening':
        return 'AI is responding...';
      case 'processing':
        return 'Processing...';
      case 'connected':
        return isInteractionMode === 'hold' ? 'Hold to speak' : 'Tap to speak';
      case 'connecting':
        return 'Connecting...';
      default:
        return isInteractionMode === 'hold' ? 'Hold to start' : 'Tap to start';
    }
  };

  const vuMeterHeight = Math.min(audioMetrics.inputLevel * 100, 100);
  const outputMeterHeight = Math.min(audioMetrics.outputLevel * 100, 100);

  // Debug: Log feature flag state
  console.log('RealtimeVoiceOrb - realtimeVoice flag enabled:', isEnabled);
  
  if (!isEnabled) {
    return null;
  }

  return (
    <div className={`fixed bottom-6 right-6 flex flex-col items-end gap-4 ${className}`}>
      {/* Latency Panel (Dev Mode) */}
      {localStorage.getItem('DEBUG') === 'true' && latencyMetrics.connected && (
        <Card className="p-3 bg-background/95 backdrop-blur-sm">
          <div className="text-xs space-y-1">
            <div className="font-medium">Performance</div>
            <div className="flex justify-between gap-4">
              <span>STT First:</span>
              <span>{latencyMetrics.sttFirst ? `${latencyMetrics.sttFirst}ms` : '-'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>TTS Start:</span>
              <span>{latencyMetrics.ttsStart ? `${latencyMetrics.ttsStart}ms` : '-'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Barge-in:</span>
              <span>{latencyMetrics.bargeIn ? `${latencyMetrics.bargeIn}ms` : '-'}</span>
            </div>
          </div>
        </Card>
      )}

      {/* VU Meters */}
      <AnimatePresence>
        {sessionState !== 'disconnected' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-end gap-2"
          >
            {/* Input level */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-1.5 h-16 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="w-full bg-blue-500 rounded-full origin-bottom"
                  style={{ height: `${vuMeterHeight}%` }}
                  animate={{ height: `${vuMeterHeight}%` }}
                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                />
              </div>
              <Mic className="h-3 w-3 text-muted-foreground" />
            </div>

            {/* Output level */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-1.5 h-16 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="w-full bg-green-500 rounded-full origin-bottom"
                  style={{ height: `${outputMeterHeight}%` }}
                  animate={{ height: `${outputMeterHeight}%` }}
                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                />
              </div>
              <Volume2 className="h-3 w-3 text-muted-foreground" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transcript Display */}
      <AnimatePresence>
        {(partialTranscript || finalTranscript || isProcessingIntent) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="max-w-xs"
          >
            <Card className="p-3 bg-background/95 backdrop-blur-sm">
              <div className="text-sm">
                {isProcessingIntent ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
                    Processing intent...
                  </div>
                ) : (
                  <div className="space-y-1">
                    {partialTranscript && (
                      <div className="text-muted-foreground italic">
                        {partialTranscript}
                      </div>
                    )}
                    {finalTranscript && (
                      <div className="font-medium">
                        {finalTranscript}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Voice Orb */}
      <div className="flex flex-col items-center gap-2">
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative"
        >
          <Button
            size="lg"
            className={`h-16 w-16 rounded-full transition-all duration-200 ${getOrbColor()} hover:opacity-90 active:scale-95`}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleClick}
            disabled={sessionState === 'connecting'}
            aria-label={getStatusText()}
          >
            {/* Pulsing animation for active states */}
            {(sessionState === 'speaking' || sessionState === 'listening') && (
              <motion.div
                className="absolute inset-0 rounded-full bg-current opacity-30"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
            )}
            
            {/* Icon */}
            {sessionState === 'connecting' ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                <Wifi className="h-6 w-6" />
              </motion.div>
            ) : sessionState === 'disconnected' ? (
              <Mic className="h-6 w-6" />
            ) : sessionState === 'speaking' ? (
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                <MicOff className="h-6 w-6" />
              </motion.div>
            ) : (
              <Volume2 className="h-6 w-6" />
            )}
          </Button>

          {/* Barge-in button */}
          {sessionState === 'listening' && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute -top-2 -right-2"
            >
              <Button
                size="sm"
                variant="destructive"
                className="h-6 w-6 rounded-full p-0"
                onClick={handleBargeIn}
                aria-label="Interrupt AI"
              >
                <Zap className="h-3 w-3" />
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* Status and Controls */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium text-center">
            {getStatusText()}
          </span>
          
          {/* Mode toggle */}
          <div className="flex items-center gap-1">
            <Button
              variant={isInteractionMode === 'hold' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsInteractionMode('hold')}
              disabled={sessionState === 'connecting'}
              className="text-xs h-6 px-2"
            >
              Hold
            </Button>
            <Button
              variant={isInteractionMode === 'toggle' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsInteractionMode('toggle')}
              disabled={sessionState === 'connecting'}
              className="text-xs h-6 px-2"
            >
              Toggle
            </Button>
          </div>

          {/* Connection status */}
          <Badge 
            variant={sessionState === 'connected' || sessionState === 'listening' || sessionState === 'speaking' ? 'default' : 'secondary'}
            className="text-xs"
          >
            {latencyMetrics.connected ? (
              <div className="flex items-center gap-1">
                <Wifi className="h-3 w-3" />
                Real-time
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <WifiOff className="h-3 w-3" />
                Offline
              </div>
            )}
          </Badge>
        </div>
      </div>
    </div>
  );
};