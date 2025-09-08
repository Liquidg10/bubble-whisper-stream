/**
 * Dev Page for Voice-First Capture Testing
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Mic, 
  Volume2, 
  Zap, 
  Settings,
  TestTube,
  Brain,
  Clock,
  MessageSquare
} from 'lucide-react';
import { VoiceFirstCapture } from '@/components/VoiceFirstCapture';
import { voiceRouter } from '@/intent/voiceRouter';
import { decisionTraceService } from '@/services/decisionTraceService';
import { ttsService } from '@/services/tts';
import { useBubbleStore } from '@/stores/bubbleStore';

export const DevVoiceFirst: React.FC = () => {
  const { bubbles } = useBubbleStore();
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isTestingLatency, setIsTestingLatency] = useState(false);

  // Test phrases for confidence gate testing
  const testPhrases = [
    { text: "Remind me to buy milk tomorrow", expectedType: 'ReminderNote', expectedGate: 'high' },
    { text: "I have an idea for the project", expectedType: 'Thought', expectedGate: 'high' },
    { text: "Take note about the meeting", expectedType: 'Thought', expectedGate: 'high' },
    { text: "Buy groceries this weekend", expectedType: 'Task', expectedGate: 'high' },
    { text: "Schedule dentist appointment", expectedType: 'Event', expectedGate: 'medium' },
    { text: "Something about work stuff", expectedType: 'Thought', expectedGate: 'low' },
    { text: "Hmm maybe later", expectedType: 'Thought', expectedGate: 'low' },
  ];

  const runIntentTests = () => {
    const results = testPhrases.map(test => {
      const result = voiceRouter.route(test.text);
      return {
        ...test,
        actualType: result.type,
        actualGate: result.confidenceGate,
        confidence: result.confidence,
        autoCommit: result.autoCommitRecommended,
        passed: result.type === test.expectedType && result.confidenceGate === test.expectedGate
      };
    });
    
    setTestResults(results);
    console.log('🧪 Intent test results:', results);
  };

  const testLatency = async () => {
    setIsTestingLatency(true);
    const startTime = performance.now();
    
    try {
      // Simulate voice processing pipeline
      await new Promise(resolve => setTimeout(resolve, 50)); // Audio processing
      
      const result = voiceRouter.route("Remind me to call mom tonight");
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Intent processing
      
      if (result.autoCommitRecommended) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Bubble creation
      } else {
        await ttsService.speak("Medium confidence - confirming...", { tone: 'neutral' });
      }
      
      const endTime = performance.now();
      const latency = endTime - startTime;
      
      console.log(`⚡ Voice pipeline latency: ${latency.toFixed(2)}ms`);
      
    } finally {
      setIsTestingLatency(false);
    }
  };

  const getRecentTraces = () => {
    return decisionTraceService.getTraces({ 
      feature: 'voice-capture' as any, 
      limit: 5 
    });
  };

  const handleBubbleCreated = (bubble: any) => {
    console.log('✅ Voice bubble created in dev test:', bubble);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Mic className="h-8 w-8" />
          Voice-First Capture Dev
        </h1>
        <p className="text-muted-foreground">
          Test and debug voice capture, confidence gates, and auto-commit functionality
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Voice Capture Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Live Voice Test
            </CardTitle>
            <CardDescription>
              Test voice capture with real audio input
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VoiceFirstCapture 
              onBubbleCreated={handleBubbleCreated}
              className="max-w-sm mx-auto"
            />
          </CardContent>
        </Card>

        {/* Intent Router Tests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Intent Router Tests
            </CardTitle>
            <CardDescription>
              Test confidence gates and intent classification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runIntentTests} className="w-full">
              Run Intent Tests
            </Button>
            
            {testResults.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Test Results:</h4>
                {testResults.map((result, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border">
                    <div className="flex-1">
                      <p className="text-sm font-mono">{result.text}</p>
                      <div className="flex gap-1 mt-1">
                        <Badge variant={result.passed ? 'default' : 'destructive'} className="text-xs">
                          {result.actualType}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {result.actualGate}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {Math.round(result.confidence * 100)}%
                        </Badge>
                        {result.autoCommit && (
                          <Badge variant="default" className="text-xs bg-green-600">
                            Auto
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Latency Testing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Latency Testing
            </CardTitle>
            <CardDescription>
              Measure "near-instant" processing pipeline
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={testLatency} 
              disabled={isTestingLatency}
              className="w-full"
            >
              <Zap className="h-4 w-4 mr-2" />
              {isTestingLatency ? 'Testing...' : 'Test Latency'}
            </Button>
            
            <div className="text-sm text-muted-foreground">
              <p>Target: &lt;500ms for high confidence auto-commit</p>
              <p>Target: &lt;800ms for medium confidence confirmation</p>
            </div>
          </CardContent>
        </Card>

        {/* Decision Traces */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Recent Decision Traces
            </CardTitle>
            <CardDescription>
              View voice capture decision traces
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {getRecentTraces().map((trace, i) => (
                <div key={trace.id} className="p-2 rounded border text-sm">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium">{trace.action}</p>
                      <p className="text-muted-foreground text-xs">{trace.becauseText}</p>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs">
                        {trace.decision}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {Math.round(trace.finalConfidence * 100)}%
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(trace.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ))}
              
              {getRecentTraces().length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No voice traces yet - try the voice capture above
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Voice Settings Debug */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Current Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">Confidence Thresholds</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>High: ≥80% (auto-commit)</li>
                  <li>Medium: 50-79% (confirm)</li>
                  <li>Low: &lt;50% (clarify)</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Intent Patterns</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>"Remind me..." → ReminderNote</li>
                  <li>"Take note..." → Thought</li>
                  <li>"Buy/Get..." → Task (shopping)</li>
                  <li>"I have an idea..." → Thought (idea)</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Recent Bubbles</h4>
                <p className="text-muted-foreground">
                  {bubbles.length} total bubbles created
                </p>
                {bubbles.slice(0, 3).map((bubble, i) => (
                  <div key={bubble.id} className="text-xs text-muted-foreground">
                    {bubble.type}: {bubble.content.substring(0, 30)}...
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};