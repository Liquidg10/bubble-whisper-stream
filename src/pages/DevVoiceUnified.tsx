/**
 * Dev Voice Route - Testing and validation interface for unified voice system
 * Phase 2: Development route for voice engine validation
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useVoiceEngine } from '@/hooks/useVoiceEngine';
import { voiceRouter } from '@/intent/voiceRouter';
import { audioSessionManager } from '@/services/voiceSessionManager';
import { voiceHotkeyManager } from '@/services/voiceHotkeyManager';
import { decisionTraceService } from '@/services/decisionTraceService';
import { HeaderVoiceCapture } from '@/components/HeaderVoiceCaptureUnified';
import { VoiceFirstCaptureUnified } from '@/components/VoiceFirstCaptureUnified';
import { VoiceSettingsUnified } from '@/components/VoiceSettingsUnified';
import { flags } from '@/config/flags';
import { Mic, TestTube, Settings, Activity, Target, Zap } from 'lucide-react';
import { toast } from 'sonner';

export default function DevVoiceUnified() {
  const [selectedTest, setSelectedTest] = useState<string>('');
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [manualTestText, setManualTestText] = useState('');
  const [sessionStatus, setSessionStatus] = useState<any>(null);

  // Test voice engine
  const testVoiceEngine = useVoiceEngine({
    source: 'dev-voice-test',
    mode: 'conversational',
    enableHotkey: false,
    onResult: (result) => {
      console.log('Dev test result:', result);
    },
    onError: (error) => {
      console.error('Dev test error:', error);
    }
  });

  // Golden test scenarios
  const goldenScenarios = [
    {
      id: 'reminder-simple',
      text: 'remind me to call mom tomorrow at 3pm',
      expectedType: 'ReminderNote',
      expectedConfidence: 0.9,
      expectedTags: ['reminder']
    },
    {
      id: 'shopping-list',
      text: 'add milk and bread to shopping list',
      expectedType: 'Task',
      expectedConfidence: 0.85,
      expectedTags: ['shopping']
    },
    {
      id: 'idea-capture',
      text: 'idea for a new mobile app that helps with meditation',
      expectedType: 'Thought',
      expectedConfidence: 0.8,
      expectedTags: ['idea']
    },
    {
      id: 'task-work',
      text: 'need to finish the quarterly report by Friday',
      expectedType: 'Task',
      expectedConfidence: 0.7,
      expectedTags: []
    },
    {
      id: 'memory-joy',
      text: 'had an amazing dinner with friends tonight',
      expectedType: 'Memory',
      expectedConfidence: 0.75,
      expectedTags: ['joy']
    },
    {
      id: 'note-simple',
      text: 'take note that the meeting room booking system is broken',
      expectedType: 'Thought',
      expectedConfidence: 0.85,
      expectedTags: ['note']
    },
    {
      id: 'ambiguous-low',
      text: 'um, something about that thing',
      expectedType: 'Thought',
      expectedConfidence: 0.6,
      expectedTags: []
    }
  ];

  // Update session status periodically
  useEffect(() => {
    const updateStatus = () => {
      setSessionStatus({
        audioSession: audioSessionManager.getCurrentSession(),
        hotkeyTarget: voiceHotkeyManager.getActiveTarget()?.id,
        isPressed: voiceHotkeyManager.isHotkeyPressed(),
        engineState: testVoiceEngine
      });
    };

    updateStatus();
    const interval = setInterval(updateStatus, 1000);
    return () => clearInterval(interval);
  }, [testVoiceEngine]);

  // Run golden scenario tests
  const runGoldenTests = async () => {
    setIsRunningTests(true);
    setTestResults([]);

    const results = [];

    for (const scenario of goldenScenarios) {
      const startTime = performance.now();
      
      try {
        // Route intent
        const intent = voiceRouter.route(scenario.text);
        const processingTime = performance.now() - startTime;

        const result = {
          scenarioId: scenario.id,
          text: scenario.text,
          intent,
          processingTime,
          passed: {
            type: intent.type === scenario.expectedType,
            confidence: Math.abs(intent.confidence - scenario.expectedConfidence) < 0.2,
            tags: scenario.expectedTags.every(tag => intent.tags.includes(tag))
          }
        };

        const overallPassed = result.passed.type && result.passed.confidence && result.passed.tags;
        (result as any).passed.overall = overallPassed;
        
        results.push(result);
        setTestResults([...results]);

        // Brief delay between tests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          scenarioId: scenario.id,
          text: scenario.text,
          error: error.message,
          processingTime: performance.now() - startTime,
          passed: { overall: false, type: false, confidence: false, tags: false }
        });
        setTestResults([...results]);
      }
    }

    setIsRunningTests(false);
    
    const passedCount = results.filter(r => (r as any).passed?.overall).length;
    toast.success(`Tests complete: ${passedCount}/${results.length} passed`);
  };

  // Test manual text input
  const testManualInput = async () => {
    if (!manualTestText.trim()) return;

    const startTime = performance.now();
    try {
      const intent = voiceRouter.route(manualTestText);
      const processingTime = performance.now() - startTime;

      const result = {
        scenarioId: 'manual',
        text: manualTestText,
        intent,
        processingTime,
        passed: { overall: true, type: true, confidence: true, tags: true }
      };

      setTestResults(prev => [result, ...prev]);
      toast.success(`Processed in ${processingTime.toFixed(2)}ms`);
    } catch (error) {
      toast.error(`Failed to process: ${error.message}`);
    }
  };

  // Get recent decision traces
  const recentTraces = decisionTraceService.getTraces({ limit: 10 });

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getPassedColor = (passed: boolean) => {
    return passed ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Voice System Dev Console</h1>
          <p className="text-muted-foreground">
            Unified voice engine testing and validation
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant={flags.VOICE_ENGINE_UNIFIED ? 'default' : 'secondary'}>
            {flags.VOICE_ENGINE_UNIFIED ? 'Unified Engine' : 'Legacy Mode'}
          </Badge>
          <Badge variant={sessionStatus?.audioSession ? 'destructive' : 'outline'}>
            {sessionStatus?.audioSession ? 'Session Active' : 'Available'}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="testing" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="testing" className="flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            Testing
          </TabsTrigger>
          <TabsTrigger value="components" className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Components
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Monitoring
          </TabsTrigger>
        </TabsList>

        {/* Testing Tab */}
        <TabsContent value="testing" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Golden Scenario Tests */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Golden Scenario Tests
                </CardTitle>
                <CardDescription>
                  Automated testing of {goldenScenarios.length} voice scenarios
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={runGoldenTests}
                  disabled={isRunningTests}
                  className="w-full"
                >
                  {isRunningTests ? 'Running Tests...' : 'Run All Tests'}
                </Button>

                {isRunningTests && (
                  <Progress 
                    value={(testResults.length / goldenScenarios.length) * 100} 
                    className="w-full" 
                  />
                )}

                {testResults.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {testResults.map((result, i) => (
                      <div key={i} className="p-3 border rounded-lg text-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{result.scenarioId}</span>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={result.passed?.overall ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {result.passed?.overall ? 'PASS' : 'FAIL'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {result.processingTime?.toFixed(2)}ms
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-muted-foreground mb-2">"{result.text}"</p>
                        
                        {result.intent && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline">{result.intent.type}</Badge>
                            <Badge 
                              variant="outline"
                              className={`${getConfidenceColor(result.intent.confidence)} text-white`}
                            >
                              {Math.round(result.intent.confidence * 100)}%
                            </Badge>
                            <Badge variant="outline">{result.intent.confidenceGate}</Badge>
                          </div>
                        )}
                        
                        {result.error && (
                          <p className="text-red-600 text-xs mt-1">{result.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Manual Testing */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Manual Intent Testing
                </CardTitle>
                <CardDescription>
                  Test voice routing with custom text input
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Enter text to test voice intent routing..."
                  value={manualTestText}
                  onChange={(e) => setManualTestText(e.target.value)}
                  rows={3}
                />
                
                <Button
                  onClick={testManualInput}
                  disabled={!manualTestText.trim()}
                  className="w-full"
                >
                  Test Intent Routing
                </Button>

                {/* Current voice engine status */}
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <h4 className="font-medium mb-2">Voice Engine Status</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Recording: {testVoiceEngine.isRecording ? 'Yes' : 'No'}</div>
                    <div>Processing: {testVoiceEngine.isProcessing ? 'Yes' : 'No'}</div>
                    <div>Session: {testVoiceEngine.sessionState}</div>
                    <div>Can Start: {testVoiceEngine.canStartRecording ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Components Tab */}
        <TabsContent value="components" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Header Voice Capture */}
            <Card>
              <CardHeader>
                <CardTitle>Header Voice Capture</CardTitle>
                <CardDescription>
                  Compact voice capture for quick interactions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center p-4 border rounded-lg">
                  <HeaderVoiceCapture onBubbleCreated={(bubble) => 
                    toast.success(`Created ${bubble.type}: ${bubble.content}`)
                  } />
                </div>
                
                <div className="text-sm text-muted-foreground">
                  Click and hold the microphone or use the configured hotkey to capture voice.
                  This is the small, always-available voice capture interface.
                </div>
              </CardContent>
            </Card>

            {/* Voice First Capture */}
            <Card>
              <CardHeader>
                <CardTitle>Voice First Capture (Overlay)</CardTitle>
                <CardDescription>
                  Rich conversational voice interface
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative h-40 border rounded-lg overflow-hidden">
                  <VoiceFirstCaptureUnified 
                    className="relative"
                    onBubbleCreated={(bubble) => 
                      toast.success(`Created ${bubble.type}: ${bubble.content}`)
                    } 
                  />
                </div>
                
                <div className="text-sm text-muted-foreground">
                  Draggable overlay with live transcript, confidence display, and confirmation flows.
                  Optimized for longer voice interactions.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <VoiceSettingsUnified />
        </TabsContent>

        {/* Monitoring Tab */}
        <TabsContent value="monitoring" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
                <CardDescription>Real-time voice system monitoring</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {sessionStatus && (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span>Audio Session:</span>
                      <Badge variant={sessionStatus.audioSession ? 'destructive' : 'outline'}>
                        {sessionStatus.audioSession?.source || 'Available'}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between">
                      <span>Hotkey Target:</span>
                      <Badge variant="outline">
                        {sessionStatus.hotkeyTarget || 'None'}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between">
                      <span>Hotkey Pressed:</span>
                      <Badge variant={sessionStatus.isPressed ? 'default' : 'outline'}>
                        {sessionStatus.isPressed ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Decision Traces */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Decision Traces</CardTitle>
                <CardDescription>Voice processing audit trail</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {recentTraces.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent traces</p>
                  ) : (
                    recentTraces.map((trace, i) => (
                      <div key={trace.id} className="p-2 border rounded text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{trace.action}</span>
                          <Badge variant="outline" className="text-xs">
                            {trace.decision}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs">{trace.becauseText}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs">
                            {Math.round(trace.finalConfidence * 100)}% confidence
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(trace.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}