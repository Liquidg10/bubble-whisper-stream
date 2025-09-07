/**
 * Dev Route 2: CBT Policy Simulator
 * Simulate fatigue/quiet hours, see policy decisions
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Settings, Brain, Clock, Target, AlertTriangle, RefreshCw, Play } from 'lucide-react';
import { cbtDevHarness, type PolicyTestResult } from '@/services/cbtDevHarness';
import { goldenSampleLoader } from '@/services/goldenSampleLoader';

export default function DevCBTPolicy() {
  const [inputMessage, setInputMessage] = useState('');
  const [testResult, setTestResult] = useState<PolicyTestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Mock settings state
  const [assistLevel, setAssistLevel] = useState<'off' | 'subtle' | 'standard'>('standard');
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(7);
  const [cbtEnabled, setCbtEnabled] = useState(true);
  const [fatigueScenario, setFatigueScenario] = useState<'fresh' | 'moderate' | 'high' | 'exhausted'>('fresh');
  const [isQuietTime, setIsQuietTime] = useState(false);

  // Manual fatigue controls
  const [dailyCount, setDailyCount] = useState(0);
  const [lastInteractionMins, setLastInteractionMins] = useState(0);

  // Apply mock settings to harness
  const applySettings = useCallback(() => {
    cbtDevHarness.setMockUserSettings({
      assistLevel,
      quietHours: { start: quietStart, end: quietEnd },
      topicExclusions: [],
      cbtEnabled
    });

    // Apply fatigue scenario or manual settings
    if (fatigueScenario !== 'fresh') {
      cbtDevHarness.simulateFatigueScenario(fatigueScenario);
    } else {
      // Use manual settings
      cbtDevHarness.setMockFatigueState({
        dailyCount,
        lastInteraction: lastInteractionMins > 0 ? Date.now() - (lastInteractionMins * 60000) : 0,
        topicCooldowns: {},
        declineCountsByTopic: {},
        userThresholds: {}
      });
    }

    cbtDevHarness.simulateQuietHours(isQuietTime);
  }, [assistLevel, quietStart, quietEnd, cbtEnabled, fatigueScenario, dailyCount, lastInteractionMins, isQuietTime]);

  // Test policy decision
  const testPolicy = async () => {
    if (!inputMessage.trim()) return;

    setIsLoading(true);
    applySettings();

    try {
      const result = await cbtDevHarness.testPolicyDecision(inputMessage, {
        messageId: `policy_test_${Date.now()}`,
        timestamp: Date.now()
      });
      setTestResult(result);
    } catch (error) {
      console.error('Policy test error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load sample message
  const loadSample = (category: 'distortion' | 'crisis' | 'neutral') => {
    const sample = goldenSampleLoader.getRandomSample(category);
    setInputMessage(sample.message);
  };

  // Reset everything
  const resetState = () => {
    cbtDevHarness.resetMockState();
    setTestResult(null);
    setInputMessage('');
    setAssistLevel('standard');
    setQuietStart(22);
    setQuietEnd(7);
    setCbtEnabled(true);
    setFatigueScenario('fresh');
    setIsQuietTime(false);
    setDailyCount(0);
    setLastInteractionMins(0);
  };

  // Get decision reasoning display
  const getDecisionColor = (decision: any) => {
    if (!decision.shouldShowCBT) return 'text-muted-foreground';
    if (decision.priority === 'crisis') return 'text-red-600 dark:text-red-400';
    if (decision.priority === 'high') return 'text-orange-600 dark:text-orange-400';
    return 'text-blue-600 dark:text-blue-400';
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            CBT Policy Simulator
          </h1>
          <p className="text-muted-foreground">
            Test policy decisions with different fatigue states and user settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetState}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={testPolicy} disabled={isLoading || !inputMessage.trim()}>
            <Play className="h-4 w-4 mr-2" />
            {isLoading ? 'Testing...' : 'Test Policy'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">User Settings</CardTitle>
              <CardDescription>Configure mock user preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Assist Level</Label>
                <Select value={assistLevel} onValueChange={(value: any) => setAssistLevel(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="subtle">Subtle</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label>CBT Enabled</Label>
                <Switch checked={cbtEnabled} onCheckedChange={setCbtEnabled} />
              </div>

              <div className="space-y-2">
                <Label>Quiet Hours</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Start</Label>
                    <Slider
                      value={[quietStart]}
                      onValueChange={([value]) => setQuietStart(value)}
                      max={23}
                      min={0}
                      step={1}
                      className="mt-1"
                    />
                    <p className="text-xs text-center">{quietStart}:00</p>
                  </div>
                  <div>
                    <Label className="text-xs">End</Label>
                    <Slider
                      value={[quietEnd]}
                      onValueChange={([value]) => setQuietEnd(value)}
                      max={23}
                      min={0}
                      step={1}
                      className="mt-1"
                    />
                    <p className="text-xs text-center">{quietEnd}:00</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Simulate Quiet Time</Label>
                <Switch checked={isQuietTime} onCheckedChange={setIsQuietTime} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fatigue State</CardTitle>
              <CardDescription>Simulate user fatigue scenarios</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Scenario</Label>
                <Select value={fatigueScenario} onValueChange={(value: any) => setFatigueScenario(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fresh">Fresh (Manual Control)</SelectItem>
                    <SelectItem value="moderate">Moderate Fatigue</SelectItem>
                    <SelectItem value="high">High Fatigue</SelectItem>
                    <SelectItem value="exhausted">Exhausted</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {fatigueScenario === 'fresh' && (
                <>
                  <div className="space-y-2">
                    <Label>Daily Interaction Count: {dailyCount}</Label>
                    <Slider
                      value={[dailyCount]}
                      onValueChange={([value]) => setDailyCount(value)}
                      max={20}
                      min={0}
                      step={1}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Last Interaction: {lastInteractionMins} mins ago</Label>
                    <Slider
                      value={[lastInteractionMins]}
                      onValueChange={([value]) => setLastInteractionMins(value)}
                      max={120}
                      min={0}
                      step={5}
                    />
                  </div>
                </>
              )}

              {fatigueScenario !== 'fresh' && (
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    Using predefined {fatigueScenario} fatigue scenario with realistic cooldowns and decline patterns.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Input & Testing */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Message</CardTitle>
              <CardDescription>Enter message to test policy decision</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="test-message">Message</Label>
                <Textarea
                  id="test-message"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Enter message to test..."
                  className="min-h-[120px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>Quick Samples</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" onClick={() => loadSample('neutral')}>
                    Neutral
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => loadSample('distortion')}>
                    Distortion
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => loadSample('crisis')}>
                    Crisis
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          {testResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Annotation</Label>
                    <p className="text-lg font-mono">
                      {testResult.timingMs.annotation.toFixed(2)}ms
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Decision</Label>
                    <p className="text-lg font-mono">
                      {testResult.timingMs.decision.toFixed(2)}ms
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Total</Label>
                    <p className="text-lg font-mono">
                      {testResult.timingMs.total.toFixed(2)}ms
                      <Badge 
                        variant={testResult.timingMs.total <= 50 ? 'default' : 'destructive'}
                        className="ml-2"
                      >
                        {testResult.timingMs.total <= 50 ? 'Good' : 'Slow'}
                      </Badge>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results */}
        <div className="space-y-4">
          {testResult ? (
            <>
              {/* Decision Result */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Policy Decision
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Show CBT Intervention</Label>
                      <Badge 
                        variant={testResult.decision.shouldShowCBT ? 'default' : 'secondary'}
                        className={getDecisionColor(testResult.decision)}
                      >
                        {testResult.decision.shouldShowCBT ? 'YES' : 'NO'}
                      </Badge>
                    </div>

                    {testResult.decision.shouldShowCBT && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          {testResult.decision.intervention && (
                            <div className="flex items-center justify-between">
                              <Label>Intervention Type</Label>
                              <Badge variant="outline">
                                {testResult.decision.intervention}
                              </Badge>
                            </div>
                          )}
                          
                          {testResult.decision.priority && (
                            <div className="flex items-center justify-between">
                              <Label>Priority</Label>
                              <Badge 
                                variant={
                                  testResult.decision.priority === 'crisis' ? 'destructive' :
                                  testResult.decision.priority === 'high' ? 'secondary' : 'default'
                                }
                              >
                                {testResult.decision.priority}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {testResult.decision.reason && (
                      <>
                        <Separator />
                        <div>
                          <Label className="text-sm text-muted-foreground">Reason</Label>
                          <p className="text-sm mt-1 p-2 bg-muted rounded">
                            {testResult.decision.reason}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Decision Reasoning */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Decision Tree</CardTitle>
                  <CardDescription>Step-by-step policy reasoning</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {testResult.reasoning.map((step, idx) => (
                        <div key={idx} className="text-sm p-2 bg-muted rounded flex items-start gap-2">
                          <Badge variant="outline" className="text-xs">
                            {idx + 1}
                          </Badge>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Annotation Details */}
              {testResult.annotation && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Annotation Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Distortions</Label>
                        <Badge variant="secondary">
                          {testResult.annotation.distortions.length}
                        </Badge>
                      </div>

                      {testResult.annotation.distortions.map((distortion, idx) => (
                        <div key={idx} className="text-sm p-2 border rounded">
                          <div className="flex items-center justify-between">
                            <span className="capitalize">
                              {distortion.type.replace('_', ' ')}
                            </span>
                            <Badge variant="outline">
                              {(distortion.confidence * 100).toFixed(1)}%
                            </Badge>
                          </div>
                        </div>
                      ))}

                      {testResult.annotation.crisisFlags.length > 0 && (
                        <>
                          <Separator />
                          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-4 w-4" />
                            <Label>Crisis Flags</Label>
                            <Badge variant="destructive">
                              {testResult.annotation.crisisFlags.length}
                            </Badge>
                          </div>
                          
                          {testResult.annotation.crisisFlags.map((flag, idx) => (
                            <div key={idx} className="text-sm p-2 border border-red-200 dark:border-red-800 rounded">
                              <div className="flex items-center justify-between">
                                <span className="capitalize text-red-700 dark:text-red-300">
                                  {flag.type.replace('_', ' ')}
                                </span>
                                <div className="flex gap-1">
                                  <Badge variant="destructive" className="text-xs">
                                    {flag.severity}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {(flag.confidence * 100).toFixed(1)}%
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Configure settings and test a message</p>
                  <p className="text-sm mt-1">See real-time policy decisions</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}