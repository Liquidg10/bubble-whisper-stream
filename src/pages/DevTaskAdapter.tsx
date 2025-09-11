/**
 * Task Adapter Dev Route - Test round-trip conversion and data integrity
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useTaskStore } from '@/stores/taskStore';
import { bubbleToTask, taskToBubble, validateRoundTrip } from '@/adapters/taskAdapter';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Database, Zap } from 'lucide-react';

interface RoundTripResult {
  bubbleId: string;
  bubbleTitle: string;
  isValid: boolean;
  errors: string[];
  priorityDrift: number;
  metadata: {
    hasOutliner: boolean;
    hasFinance: boolean;
    hasFocus: boolean;
  };
}

export default function DevTaskAdapter() {
  const { bubbles } = useBubbleStore();
  const { getTasks, refreshFromBubbleStore } = useTaskStore();
  const [testResults, setTestResults] = useState<RoundTripResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  // Run round-trip tests on all bubbles
  const runRoundTripTests = () => {
    setIsRunning(true);
    
    try {
      const results: RoundTripResult[] = bubbles.map(bubble => {
        const validation = validateRoundTrip(bubble);
        
        // Calculate priority drift
        const originalPriority = bubble.size ? Math.round(bubble.size * 100) : 50;
        const convertedPriority = validation.convertedBubble.size ? 
          Math.round(validation.convertedBubble.size * 100) : 50;
        const priorityDrift = Math.abs(originalPriority - convertedPriority);
        
        return {
          bubbleId: bubble.id,
          bubbleTitle: bubble.content || bubble.id,
          isValid: validation.isValid,
          errors: validation.errors,
          priorityDrift,
          metadata: {
            hasOutliner: !!bubble.metadata?.outliner,
            hasFinance: !!bubble.metadata?.finance,
            hasFocus: !!bubble.metadata?.focus
          }
        };
      });
      
      setTestResults(results);
      setLastRun(new Date());
    } catch (error) {
      console.error('Round-trip test failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  // Auto-run tests when component mounts or bubbles change
  useEffect(() => {
    if (bubbles.length > 0) {
      runRoundTripTests();
    }
  }, [bubbles.length]);

  const validResults = testResults.filter(r => r.isValid);
  const invalidResults = testResults.filter(r => !r.isValid);
  const metadataPreserved = testResults.filter(r => 
    r.metadata.hasOutliner || r.metadata.hasFinance || r.metadata.hasFocus
  );

  const averagePriorityDrift = testResults.length > 0 ? 
    testResults.reduce((sum, r) => sum + r.priorityDrift, 0) / testResults.length : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2">Task Adapter Testing</h1>
        <p className="text-muted-foreground">
          Test bi-directional conversion between Bubble and Task interfaces
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4" />
              Total Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{testResults.length}</div>
            <p className="text-xs text-muted-foreground">
              {bubbles.length} bubbles tested
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Valid Round-trips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{validResults.length}</div>
            <p className="text-xs text-muted-foreground">
              {testResults.length > 0 ? Math.round(validResults.length / testResults.length * 100) : 0}% success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600" />
              Priority Drift
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {averagePriorityDrift.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average priority drift (±{averagePriorityDrift.toFixed(1)})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-purple-600" />
              Metadata Preserved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metadataPreserved.length}</div>
            <p className="text-xs text-muted-foreground">
              Rich metadata intact
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button 
          onClick={runRoundTripTests} 
          disabled={isRunning}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Running Tests...' : 'Run Round-trip Tests'}
        </Button>
        
        <Button 
          variant="outline" 
          onClick={refreshFromBubbleStore}
        >
          Refresh Task Store
        </Button>
      </div>

      {/* Results */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="failures">
            Failures 
            {invalidResults.length > 0 && (
              <Badge variant="destructive" className="ml-1">
                {invalidResults.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="details">Detailed Results</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {testResults.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No bubbles found to test. Create some bubbles first.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {averagePriorityDrift > 1 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    High priority drift detected ({averagePriorityDrift.toFixed(1)}). 
                    Priority mapping may need adjustment.
                  </AlertDescription>
                </Alert>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Test Summary</CardTitle>
                  <CardDescription>
                    Last run: {lastRun?.toLocaleTimeString() || 'Never'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span>Success rate:</span>
                    <Badge variant={validResults.length === testResults.length ? 'default' : 'secondary'}>
                      {testResults.length > 0 ? Math.round(validResults.length / testResults.length * 100) : 0}%
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Average priority drift:</span>
                    <Badge variant={averagePriorityDrift <= 1 ? 'default' : 'destructive'}>
                      ±{averagePriorityDrift.toFixed(1)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Metadata preservation:</span>
                    <span>{metadataPreserved.length} / {testResults.length} bubbles</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="failures" className="space-y-4">
          {invalidResults.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                No failures detected! All round-trip tests passed.
              </AlertDescription>
            </Alert>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-4">
                {invalidResults.map((result, index) => (
                  <Card key={index} className="border-destructive">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-destructive" />
                        {result.bubbleTitle || result.bubbleId}
                      </CardTitle>
                      <CardDescription>Priority drift: ±{result.priorityDrift}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {result.errors.map((error, errorIndex) => (
                          <div key={errorIndex} className="text-sm text-destructive">
                            • {error}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {testResults.map((result, index) => (
                <Card key={index} className={result.isValid ? '' : 'border-destructive'}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {result.isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <span className="font-medium">
                          {result.bubbleTitle || result.bubbleId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={result.priorityDrift <= 1 ? 'default' : 'destructive'}>
                          ±{result.priorityDrift}
                        </Badge>
                        {(result.metadata.hasOutliner || result.metadata.hasFinance || result.metadata.hasFocus) && (
                          <Badge variant="outline">Metadata</Badge>
                        )}
                      </div>
                    </div>
                    {result.errors.length > 0 && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {result.errors.join(', ')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}