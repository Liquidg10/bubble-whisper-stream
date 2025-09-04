import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Mic, MicOff, Volume2, Settings, Zap, TestTube } from 'lucide-react';
import { VoiceIntentCapture } from '@/components/VoiceIntentCapture';
import { ttsService } from '@/services/tts';
import { audioQueueService } from '@/services/audioQueue';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled, toggleFeatureFlag } from '@/config/flags';
import { useBubbleStore } from '@/stores/bubbleStore';

const DEBUG = localStorage.getItem('DEBUG') === 'true';

export const DevAI: React.FC = () => {
  const { toast } = useToast();
  const { bubbles, settings } = useBubbleStore();
  
  // Test states
  const [micTest, setMicTest] = useState<{
    isActive: boolean;
    volume: number;
    duration: number;
  }>({ isActive: false, volume: 0, duration: 0 });
  
  const [asrLatency, setAsrLatency] = useState<{
    isRunning: boolean;
    startTime?: number;
    latency?: number;
    transcript?: string;
  }>({ isRunning: false });
  
  const [ttsTest, setTtsTest] = useState({
    isPlaying: false,
    queueLength: 0
  });
  
  const [logs, setLogs] = useState<string[]>([]);
  const [testInput, setTestInput] = useState('Take note of this great idea for the app');
  
  // Audio analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>();
  
  // Mic volume test
  const startMicTest = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      setMicTest(prev => ({ ...prev, isActive: true, duration: 0 }));
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const startTime = Date.now();
      
      const updateVolume = () => {
        if (!analyserRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        const volume = Math.max(...dataArray) / 255 * 100;
        const duration = (Date.now() - startTime) / 1000;
        
        setMicTest(prev => ({ ...prev, volume, duration }));
        animationRef.current = requestAnimationFrame(updateVolume);
      };
      
      updateVolume();
      
      if (DEBUG) {
        addLog('🎤 Mic test started');
      }
      
    } catch (error) {
      console.error('Mic test failed:', error);
      toast({
        title: "Mic Test Failed",
        description: "Could not access microphone",
        variant: "destructive"
      });
    }
  }, [toast]);
  
  const stopMicTest = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    setMicTest({ isActive: false, volume: 0, duration: 0 });
    
    if (DEBUG) {
      addLog('🛑 Mic test stopped');
    }
  }, []);
  
  // ASR latency test
  const testASRLatency = useCallback(async () => {
    setAsrLatency({ isRunning: true, startTime: Date.now() });
    
    try {
      if (DEBUG) {
        addLog('⚡ Starting ASR latency test...');
      }
      
      // Record a short audio sample
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
        const transcribeStart = Date.now();
        
        const { data, error } = await supabase.functions.invoke('ai-voice-transcribe', {
          body: { audio: base64Audio }
        });
        
        const latency = Date.now() - transcribeStart;
        
        setAsrLatency({
          isRunning: false,
          latency,
          transcript: data?.text || error?.message || 'Failed'
        });
        
        if (DEBUG) {
          addLog(`⚡ ASR latency: ${latency}ms`);
          if (data?.text) {
            addLog(`📝 Transcript: "${data.text}"`);
          }
        }
      };
      
      mediaRecorder.start();
      
      // Stop after 2 seconds
      setTimeout(() => {
        mediaRecorder.stop();
        stream.getTracks().forEach(track => track.stop());
      }, 2000);
      
    } catch (error) {
      console.error('ASR test failed:', error);
      setAsrLatency({ isRunning: false });
      
      if (DEBUG) {
        addLog(`❌ ASR test failed: ${error.message}`);
      }
    }
  }, []);
  
  // TTS test
  const testTTS = useCallback(async () => {
    setTtsTest(prev => ({ ...prev, isPlaying: true }));
    
    try {
      await ttsService.speak('Voice testing: low latency capture working perfectly', {
        tone: 'gentle',
        context: 'notes',
        interrupt: false
      });
      
      if (DEBUG) {
        addLog('🔊 TTS test completed');
      }
      
    } catch (error) {
      console.error('TTS test failed:', error);
      
      if (DEBUG) {
        addLog(`❌ TTS test failed: ${error.message}`);
      }
    } finally {
      setTtsTest(prev => ({ ...prev, isPlaying: false }));
    }
  }, []);
  
  // Intent routing test
  const testIntentRouting = useCallback(() => {
    const testCases = [
      'Take note of this idea',
      'Remind me to call mom tomorrow',
      'I need to buy milk and bread',
      'Great idea for the weekend',
      'Set a reminder for next week',
      'Happy moment at the beach today'
    ];
    
    if (DEBUG) {
      addLog('🎯 Testing intent routing...');
      testCases.forEach(text => {
        addLog(`📝 "${text}" → [Processing would happen here]`);
      });
    }
  }, []);
  
  // Logging utility
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  }, []);
  
  // Monitor audio queue
  useEffect(() => {
    const unsubscribe = audioQueueService.subscribe(() => {
      const state = audioQueueService.getState();
      setTtsTest(prev => ({ 
        ...prev, 
        queueLength: state.queue.length,
        isPlaying: state.isPlaying 
      }));
    });
    
    return unsubscribe;
  }, []);
  
  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <TestTube className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">AI Voice Development</h1>
        <Badge variant="secondary">
          Bubbles: {bubbles.length}
        </Badge>
      </div>
      
      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">aiVision (ASR/Voice)</span>
            <Button
              variant={isFeatureEnabled('aiVision') ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                toggleFeatureFlag('aiVision', !isFeatureEnabled('aiVision'));
                addLog(`🔧 aiVision flag: ${!isFeatureEnabled('aiVision') ? 'ON' : 'OFF'}`);
              }}
            >
              {isFeatureEnabled('aiVision') ? 'ON' : 'OFF'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">DEBUG Logging</span>
            <Button
              variant={DEBUG ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                const newDebug = !DEBUG;
                localStorage.setItem('DEBUG', newDebug.toString());
                addLog(`🔧 DEBUG logging: ${newDebug ? 'ON' : 'OFF'}`);
                window.location.reload(); // Reload to apply DEBUG changes
              }}
            >
              {DEBUG ? 'ON' : 'OFF'}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Voice Capture Demo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Voice Intent Capture
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <VoiceIntentCapture
            onBubbleCreated={(bubble) => {
              if (DEBUG) {
                addLog(`✅ Created ${bubble.type}: "${bubble.content?.substring(0, 50)}..."`);
              }
            }}
          />
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Try: "Take note...", "Remind me...", "I need to buy...", "Great idea..."
            </p>
            <Badge variant="outline" className="text-xs">
              TTS: {settings.ttsEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardContent>
      </Card>
      
      {/* Testing Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mic Test */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Microphone Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                variant={micTest.isActive ? 'destructive' : 'default'}
                onClick={micTest.isActive ? stopMicTest : startMicTest}
                className="flex items-center gap-2"
              >
                {micTest.isActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {micTest.isActive ? 'Stop' : 'Start'} Test
              </Button>
              
              {micTest.isActive && (
                <Badge variant="secondary">
                  {micTest.duration.toFixed(1)}s
                </Badge>
              )}
            </div>
            
            {micTest.isActive && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Volume Level</span>
                  <span>{micTest.volume.toFixed(0)}%</span>
                </div>
                <Progress value={micTest.volume} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* ASR Latency */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ASR Latency Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={testASRLatency}
              disabled={asrLatency.isRunning || !isFeatureEnabled('aiVision')}
              className="flex items-center gap-2"
            >
              <Zap className="h-4 w-4" />
              {asrLatency.isRunning ? 'Testing...' : 'Test Latency'}
            </Button>
            
            {asrLatency.latency && (
              <div className="space-y-2">
                <Badge variant={asrLatency.latency < 1000 ? 'default' : 'destructive'}>
                  {asrLatency.latency}ms
                </Badge>
                {asrLatency.transcript && (
                  <p className="text-xs text-muted-foreground break-words">
                    "{asrLatency.transcript}"
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* TTS Test */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">TTS Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={testTTS}
                disabled={ttsTest.isPlaying || !settings.ttsEnabled}
                className="flex items-center gap-2"
              >
                <Volume2 className="h-4 w-4" />
                Test TTS
              </Button>
              
              {ttsTest.queueLength > 0 && (
                <Badge variant="secondary">
                  Queue: {ttsTest.queueLength}
                </Badge>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground">
              {ttsTest.isPlaying ? 'Playing...' : 'Ready'}
            </div>
          </CardContent>
        </Card>
        
        {/* Intent Routing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Intent Routing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={testIntentRouting}
              className="flex items-center gap-2"
            >
              🎯 Test Routing
            </Button>
            
            <Textarea
              placeholder="Test intent routing with custom text..."
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className="text-xs"
              rows={3}
            />
          </CardContent>
        </Card>
      </div>
      
      {/* Debug Logs */}
      {DEBUG && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Debug Logs
              <Button variant="outline" size="sm" onClick={clearLogs}>
                Clear
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs max-h-64 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">No logs yet...</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};