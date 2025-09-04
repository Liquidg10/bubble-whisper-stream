/**
 * Development route for testing realtime voice features
 * Latency monitoring, barge-in testing, intent logging
 */

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RealtimeVoiceOrb } from '@/components/RealtimeVoiceOrb';
import { voiceRealtimeService, SessionState, AudioMetrics } from '@/services/voiceRealtime';
import { voiceRouter } from '@/intent/voiceRouter';
import { Mic, Volume2, Zap, Wifi, Activity, Brain, TestTube } from 'lucide-react';
import { motion } from 'framer-motion';

interface LatencyMetrics {
  sttFirstToken: number;
  sttFinalization: number;
  ttsStart: number;
  bargeInLatency: number;
  totalRoundTrip: number;
}

interface IntentLog {
  id: string;
  timestamp: number;
  text: string;
  intent: any;
  latency: number;
}

export default function DevRealtimeVoice() {
  // Session monitoring
  const [sessionState, setSessionState] = useState<SessionState>('disconnected');
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
    inputLevel: 0,
    outputLevel: 0,
    latencyMs: 0,
    vadState: 'silence'
  });
  
  // Performance tracking
  const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics>({
    sttFirstToken: 0,
    sttFinalization: 0,
    ttsStart: 0,
    bargeInLatency: 0,
    totalRoundTrip: 0
  });
  
  // Logs and testing
  const [intentLogs, setIntentLogs] = useState<IntentLog[]>([]);
  const [connectionHealth, setConnectionHealth] = useState({
    packetsLost: 0,
    avgLatency: 0,
    stability: 100
  });
  
  // Test cases
  const testPhrases = [
    "Remind me to call mom at 3pm",
    "I need to buy milk and eggs",
    "Take a note about the meeting",
    "Add groceries to my shopping list",
    "What a wonderful day this is",
    "I have an idea for the project",
    "Don't forget the dentist appointment tomorrow"
  ];

  useEffect(() => {
    // Setup service callbacks for monitoring
    voiceRealtimeService.onStateChange(setSessionState);
    voiceRealtimeService.onAudioMetrics(setAudioMetrics);
    
    voiceRealtimeService.onPartialTranscript((transcript) => {
      if (latencyMetrics.sttFirstToken === 0) {
        setLatencyMetrics(prev => ({
          ...prev,
          sttFirstToken: performance.now()
        }));
      }
    });

    voiceRealtimeService.onFinalTranscript((text) => {
      const finalizationTime = performance.now();
      setLatencyMetrics(prev => ({
        ...prev,
        sttFinalization: finalizationTime
      }));
      
      // Test intent routing
      testIntentRouting(text);
    });

    voiceRealtimeService.onTTSStart(() => {
      setLatencyMetrics(prev => ({
        ...prev,
        ttsStart: performance.now()
      }));
    });

    voiceRealtimeService.onError((error) => {
      console.error('Voice service error:', error);
    });

    return () => {
      voiceRealtimeService.stopSession();
    };
  }, []);

  const testIntentRouting = (text: string) => {
    const startTime = performance.now();
    const intent = voiceRouter.route(text);
    const endTime = performance.now();
    
    const logEntry: IntentLog = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      text,
      intent,
      latency: endTime - startTime
    };
    
    setIntentLogs(prev => [logEntry, ...prev.slice(0, 19)]); // Keep last 20
  };

  const testBargeIn = async () => {
    if (sessionState !== 'listening') return;
    
    const startTime = performance.now();
    voiceRealtimeService.interruptTTS();
    const endTime = performance.now();
    
    setLatencyMetrics(prev => ({
      ...prev,
      bargeInLatency: endTime - startTime
    }));
  };

  const runLatencyTest = async () => {
    try {
      // Reset metrics
      setLatencyMetrics({
        sttFirstToken: 0,
        sttFinalization: 0,
        ttsStart: 0,
        bargeInLatency: 0,
        totalRoundTrip: 0
      });

      // Start session if not already connected
      if (sessionState === 'disconnected') {
        await voiceRealtimeService.startSession();
      }
      
      console.log('🧪 Latency test started - speak now');
    } catch (error) {
      console.error('Failed to start latency test:', error);
    }
  };

  const runIntentTest = (phrase: string) => {
    testIntentRouting(phrase);
  };

  const clearLogs = () => {
    setIntentLogs([]);
  };

  const getLatencyColor = (latency: number, threshold: number) => {
    if (latency === 0) return 'text-muted-foreground';
    if (latency < threshold) return 'text-green-500';
    if (latency < threshold * 1.5) return 'text-yellow-500';
    return 'text-red-500';
  };

  const formatLatency = (ms: number) => {
    return ms > 0 ? `${Math.round(ms)}ms` : '-';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Realtime Voice Testing</h1>
          <p className="text-muted-foreground">
            Latency monitoring, barge-in testing, and intent routing validation
          </p>
        </div>
        
        <Badge variant={sessionState === 'connected' ? 'default' : 'secondary'}>
          {sessionState}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">STT First Token</span>
                <span className={`font-mono ${getLatencyColor(latencyMetrics.sttFirstToken, 400)}`}>
                  {formatLatency(latencyMetrics.sttFirstToken)}
                </span>
              </div>
              <Progress 
                value={Math.min(latencyMetrics.sttFirstToken / 10, 100)} 
                className="h-2"
              />
              
              <div className="flex justify-between items-center">
                <span className="text-sm">STT Finalization</span>
                <span className={`font-mono ${getLatencyColor(latencyMetrics.sttFinalization, 1000)}`}>
                  {formatLatency(latencyMetrics.sttFinalization)}
                </span>
              </div>
              <Progress 
                value={Math.min(latencyMetrics.sttFinalization / 20, 100)} 
                className="h-2"
              />
              
              <div className="flex justify-between items-center">
                <span className="text-sm">TTS Start</span>
                <span className={`font-mono ${getLatencyColor(latencyMetrics.ttsStart, 500)}`}>
                  {formatLatency(latencyMetrics.ttsStart)}
                </span>
              </div>
              <Progress 
                value={Math.min(latencyMetrics.ttsStart / 10, 100)} 
                className="h-2"
              />
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Barge-in Latency</span>
                <span className={`font-mono ${getLatencyColor(latencyMetrics.bargeInLatency, 200)}`}>
                  {formatLatency(latencyMetrics.bargeInLatency)}
                </span>
              </div>
              <Progress 
                value={Math.min(latencyMetrics.bargeInLatency / 4, 100)} 
                className="h-2"
              />
            </div>
            
            <Separator />
            
            <div className="flex gap-2">
              <Button onClick={runLatencyTest} size="sm" className="flex-1">
                <TestTube className="h-4 w-4 mr-2" />
                Run Test
              </Button>
              <Button onClick={testBargeIn} size="sm" variant="outline" disabled={sessionState !== 'listening'}>
                <Zap className="h-4 w-4 mr-2" />
                Test Barge-in
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Audio Monitoring */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Audio Monitoring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* VU Meters */}
            <div className="flex justify-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <div className="text-sm font-medium">Input</div>
                <div className="w-4 h-32 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="w-full bg-blue-500 rounded-full origin-bottom"
                    animate={{ height: `${Math.min(audioMetrics.inputLevel * 100, 100)}%` }}
                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {(audioMetrics.inputLevel * 100).toFixed(1)}%
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-2">
                <div className="text-sm font-medium">Output</div>
                <div className="w-4 h-32 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="w-full bg-green-500 rounded-full origin-bottom"
                    animate={{ height: `${Math.min(audioMetrics.outputLevel * 100, 100)}%` }}
                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {(audioMetrics.outputLevel * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">VAD State</span>
                <Badge variant={audioMetrics.vadState === 'speaking' ? 'default' : 'secondary'}>
                  {audioMetrics.vadState}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Connection</span>
                <Badge variant={sessionState === 'connected' ? 'default' : 'destructive'}>
                  <Wifi className="h-3 w-3 mr-1" />
                  {connectionHealth.stability}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Intent Testing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Intent Routing Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Test Phrases</div>
              <div className="space-y-1">
                {testPhrases.map((phrase, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => runIntentTest(phrase)}
                    className="w-full text-left justify-start text-xs"
                  >
                    {phrase}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Intent Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Intent Logs
              </div>
              <Button onClick={clearLogs} size="sm" variant="outline">
                Clear
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {intentLogs.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    No intents logged yet. Speak or test phrases to see results.
                  </div>
                ) : (
                  intentLogs.map((log) => (
                    <Card key={log.id} className="p-3">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <div className="text-sm font-medium">{log.text}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatLatency(log.latency)}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {log.intent.type}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {Math.round(log.intent.confidence * 100)}% conf.
                          </Badge>
                          {log.intent.horizon && (
                            <Badge variant="outline" className="text-xs">
                              {log.intent.horizon}
                            </Badge>
                          )}
                          {log.intent.tags.map((tag: string) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        {log.intent.needsClarification && (
                          <div className="text-xs text-yellow-600 dark:text-yellow-400">
                            Needs clarification
                          </div>
                        )}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Floating Voice Interface */}
      <RealtimeVoiceOrb className="fixed bottom-6 right-6" />
    </div>
  );
}