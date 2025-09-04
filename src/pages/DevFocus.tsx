import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { TaskStep, outline, estimateTotalTime } from '@/services/outliner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ttsService } from '@/services/tts';
import { Timer, Volume2, VolumeX, Play, Pause, RotateCcw, TestTube } from 'lucide-react';

interface LatencyMetrics {
  sttFirstToken?: number;
  sttFinalization?: number;
  ttsStart?: number;
  bargeInResponse?: number;
}

export const DevFocus: React.FC = () => {
  const [taskInput, setTaskInput] = useState('Complete project presentation');
  const [generatedSteps, setGeneratedSteps] = useState<TaskStep[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  
  // Mock timer state for testing
  const [mockTimer, setMockTimer] = useState({
    timeLeft: 1500, // 25 minutes in seconds
    isRunning: false,
    currentStep: 0,
  });
  
  const [latencyLog, setLatencyLog] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<LatencyMetrics>({});

  const handleGenerateSteps = async () => {
    setIsGenerating(true);
    try {
      const steps = await outline(taskInput);
      setGeneratedSteps(steps);
      addLatencyLog(`Generated ${steps.length} steps for: ${taskInput}`);
    } catch (error) {
      console.error('Error generating steps:', error);
      addLatencyLog(`Error generating steps: ${error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const testTTS = async (text: string) => {
    if (!ttsEnabled) {
      addLatencyLog('TTS disabled - skipping');
      return;
    }
    
    const startTime = Date.now();
    try {
      await ttsService.speak(text, { context: 'dev-test', tone: 'neutral' });
      const duration = Date.now() - startTime;
      setMetrics(prev => ({ ...prev, ttsStart: duration }));
      addLatencyLog(`TTS completed in ${duration}ms`);
    } catch (error) {
      addLatencyLog(`TTS failed: ${error}`);
    }
  };

  const testBargeIn = () => {
    const startTime = Date.now();
    // Simulate barge-in interruption
    setTimeout(() => {
      const responseTime = Date.now() - startTime;
      setMetrics(prev => ({ ...prev, bargeInResponse: responseTime }));
      addLatencyLog(`Barge-in response time: ${responseTime}ms`);
    }, Math.random() * 200 + 50); // Random delay 50-250ms
  };

  const addLatencyLog = (entry: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLatencyLog(prev => [`${timestamp}: ${entry}`, ...prev].slice(0, 20));
  };

  const toggleMockTimer = () => {
    setMockTimer(prev => ({ ...prev, isRunning: !prev.isRunning }));
    addLatencyLog(`Timer ${mockTimer.isRunning ? 'paused' : 'started'}`);
  };

  const resetMockTimer = () => {
    setMockTimer({ timeLeft: 1500, isRunning: false, currentStep: 0 });
    addLatencyLog('Timer reset to 25:00');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalTime = generatedSteps.length > 0 ? estimateTotalTime(generatedSteps) : 0;
  const timerProgress = ((1500 - mockTimer.timeLeft) / 1500) * 100;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-2">
            <TestTube className="h-8 w-8" />
            Focus Mode Dev Tools
          </h1>
          <p className="text-muted-foreground">Test outliner, timers, and latency monitoring</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Task Outliner Testing */}
          <Card>
            <CardHeader>
              <CardTitle>Task Outliner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Task Description</label>
                <Textarea
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  placeholder="Describe a task to break down..."
                  rows={2}
                />
              </div>
              
              <Button 
                onClick={handleGenerateSteps} 
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? 'Generating...' : 'Generate Steps'}
              </Button>
              
              {generatedSteps.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Generated Steps</h4>
                    <Badge variant="secondary">
                      {totalTime}min total
                    </Badge>
                  </div>
                  
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                    {generatedSteps.map((step, index) => (
                      <div key={step.id} className="flex items-center gap-2 p-2 text-sm border rounded">
                        <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                        <span className="flex-1">{step.title}</span>
                        <Badge variant="secondary" className="text-xs">{step.estMins}m</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mock Timer Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Mock Timer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-mono font-bold text-primary mb-2">
                  {formatTime(mockTimer.timeLeft)}
                </div>
                <Progress value={timerProgress} className="h-2 mb-4" />
                
                <div className="flex justify-center gap-2">
                  <Button onClick={toggleMockTimer} variant="outline" size="sm">
                    {mockTimer.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button onClick={resetMockTimer} variant="outline" size="sm">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Current Step</h4>
                {generatedSteps[mockTimer.currentStep] ? (
                  <div className="p-2 border rounded text-sm">
                    {generatedSteps[mockTimer.currentStep].title}
                  </div>
                ) : (
                  <div className="p-2 border rounded text-sm text-muted-foreground">
                    No steps generated yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* TTS Testing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>TTS Testing</span>
                <div className="flex items-center gap-2">
                  {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  <Switch 
                    checked={ttsEnabled} 
                    onCheckedChange={setTtsEnabled}
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => testTTS('Focus session starting. First step: Review requirements and plan approach. You have 25 minutes. Let\'s begin.')}
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!ttsEnabled}
              >
                Test Session Start
              </Button>
              
              <Button
                onClick={() => testTTS('Great work! Focus session complete. Time for a 5-minute break.')}
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!ttsEnabled}
              >
                Test Session Complete
              </Button>
              
              <Button
                onClick={() => testTTS('Step completed! Next: Complete first draft.')}
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!ttsEnabled}
              >
                Test Step Transition
              </Button>
            </CardContent>
          </Card>

          {/* Latency Monitoring */}
          <Card>
            <CardHeader>
              <CardTitle>Latency Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-2 border rounded">
                  <div className="font-medium">TTS Start</div>
                  <div className="text-lg font-mono">
                    {metrics.ttsStart ? `${metrics.ttsStart}ms` : '--'}
                  </div>
                </div>
                
                <div className="p-2 border rounded">
                  <div className="font-medium">Barge-in Response</div>
                  <div className="text-lg font-mono">
                    {metrics.bargeInResponse ? `${metrics.bargeInResponse}ms` : '--'}
                  </div>
                </div>
              </div>
              
              <Button onClick={testBargeIn} variant="outline" size="sm" className="w-full">
                Test Barge-in Response
              </Button>
              
              <div className="space-y-1">
                <h4 className="font-medium text-sm">Activity Log</h4>
                <div className="h-32 overflow-y-auto text-xs font-mono bg-muted/50 p-2 rounded border">
                  {latencyLog.length === 0 ? (
                    <div className="text-muted-foreground">No activity yet...</div>
                  ) : (
                    latencyLog.map((entry, index) => (
                      <div key={index} className="mb-1">{entry}</div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};