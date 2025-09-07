/**
 * Dev Route 1: CBT Observer Testing
 * Paste text, see annotations & confidence in real-time
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Clock, Download, RefreshCw, AlertTriangle, Zap } from 'lucide-react';
import { annotate } from '@/ai/cbt/observer';
import { goldenSampleLoader, type GoldenSample } from '@/services/goldenSampleLoader';
import { cbtPerformanceTracker } from '@/services/cbtPerformanceTracker';
import type { CBTAnnotation } from '@/ai/cbt/types';

export default function DevCBTObserver() {
  const [inputText, setInputText] = useState('');
  const [annotation, setAnnotation] = useState<CBTAnnotation | null>(null);
  const [processingTime, setProcessingTime] = useState<number>(0);
  const [selectedSample, setSelectedSample] = useState<GoldenSample | null>(null);
  const [validationResult, setValidationResult] = useState<any>(null);

  // Get golden samples by category
  const sampleCategories = useMemo(() => ({
    distortion: goldenSampleLoader.getDistortionSamples(),
    crisis: goldenSampleLoader.getCrisisSamples(),
    neutral: goldenSampleLoader.getNeutralSamples(),
    sarcasm: goldenSampleLoader.getSarcasmSamples(),
    mixed: goldenSampleLoader.getSamplesByCategory('mixed')
  }), []);

  // Process text annotation
  const processAnnotation = (text: string) => {
    if (!text.trim()) {
      setAnnotation(null);
      setProcessingTime(0);
      return;
    }

    const start = performance.now();
    const result = annotate(text, {
      messageId: `observer_test_${Date.now()}`,
      timestamp: Date.now(),
      userSettings: { assistLevel: 'standard' }
    });
    const duration = performance.now() - start;

    setAnnotation(result);
    setProcessingTime(duration);

    // Record performance metrics
    if (result) {
      cbtPerformanceTracker.recordMetrics({
        observerTime: duration,
        policyTime: 0, // No policy in observer testing
        renderTime: 0, // No render in observer testing
        totalTime: duration,
        messageLength: text.length,
        distortionCount: result.distortions.length,
        crisisCount: result.crisisFlags.length
      });
    }
  };

  // Real-time processing as user types
  useEffect(() => {
    const timer = setTimeout(() => {
      processAnnotation(inputText);
    }, 300); // Debounce

    return () => clearTimeout(timer);
  }, [inputText]);

  // Load golden sample
  const loadSample = (sample: GoldenSample) => {
    setInputText(sample.message);
    setSelectedSample(sample);
    
    // Validate against expected results
    setTimeout(() => {
      if (annotation && sample.expectedAnnotations) {
        const validation = goldenSampleLoader.validateSample(sample, annotation, null);
        setValidationResult(validation);
      }
    }, 100);
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.9) return 'text-red-600 dark:text-red-400';
    if (confidence >= 0.8) return 'text-orange-600 dark:text-orange-400';
    if (confidence >= 0.7) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-blue-600 dark:text-blue-400';
  };

  // Export results
  const exportResults = () => {
    const data = {
      inputText,
      annotation,
      processingTime,
      selectedSample,
      validationResult,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cbt-observer-test-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" />
            CBT Observer Testing
          </h1>
          <p className="text-muted-foreground">
            Real-time annotation testing with golden samples and performance monitoring
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setInputText('')}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={exportResults}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Performance Indicator */}
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>
            Processing Time: <strong>{processingTime.toFixed(2)}ms</strong>
            {processingTime > 50 && (
              <Badge variant="destructive" className="ml-2">
                Over Target (50ms)
              </Badge>
            )}
          </span>
          <Badge variant={processingTime <= 20 ? 'default' : processingTime <= 50 ? 'secondary' : 'destructive'}>
            {processingTime <= 20 ? 'Excellent' : processingTime <= 50 ? 'Good' : 'Slow'}
          </Badge>
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Input Message</CardTitle>
              <CardDescription>
                Type or select a golden sample to test annotation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="input-text">Message Text</Label>
                <Textarea
                  id="input-text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Enter message to analyze..."
                  className="min-h-[120px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {inputText.length} characters • Real-time processing
                </p>
              </div>

              {/* Sample Validation */}
              {selectedSample && (
                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{selectedSample.category}</Badge>
                    <Badge variant="secondary">{selectedSample.id}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedSample.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedSample.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Results */}
              {validationResult && (
                <Alert className={validationResult.annotationMatch ? 'border-green-500' : 'border-red-500'}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-1">
                      Validation: {validationResult.annotationMatch ? 'PASS' : 'FAIL'}
                    </div>
                    {validationResult.details.length > 0 && (
                      <ul className="text-sm space-y-1">
                        {validationResult.details.map((detail: string, idx: number) => (
                          <li key={idx}>• {detail}</li>
                        ))}
                      </ul>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Golden Samples */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Golden Samples</CardTitle>
              <CardDescription>
                Pre-defined test cases for validation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-4">
                  {Object.entries(sampleCategories).map(([category, samples]) => (
                    <div key={category}>
                      <h4 className="font-medium capitalize mb-2 flex items-center gap-2">
                        {category}
                        <Badge variant="outline">{samples.length}</Badge>
                      </h4>
                      <div className="grid grid-cols-1 gap-2">
                        {samples.map(sample => (
                          <Button
                            key={sample.id}
                            variant="outline"
                            size="sm"
                            className="justify-start h-auto p-3 text-left"
                            onClick={() => loadSample(sample)}
                          >
                            <div className="w-full">
                              <div className="font-mono text-xs text-muted-foreground mb-1">
                                {sample.id}
                              </div>
                              <div className="text-sm">
                                {sample.message.substring(0, 80)}
                                {sample.message.length > 80 ? '...' : ''}
                              </div>
                            </div>
                          </Button>
                        ))}
                      </div>
                      {category !== 'mixed' && <Separator className="mt-4" />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {annotation ? (
            <>
              {/* Distortions */}
              {annotation.distortions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Detected Distortions
                      <Badge variant="secondary">{annotation.distortions.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {annotation.distortions.map((distortion, idx) => (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium capitalize">
                              {distortion.type.replace('_', ' ')}
                            </h4>
                            <Badge 
                              variant="outline" 
                              className={getConfidenceColor(distortion.confidence)}
                            >
                              {(distortion.confidence * 100).toFixed(1)}%
                            </Badge>
                          </div>
                          {distortion.keywords.length > 0 && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Keywords: </span>
                              {distortion.keywords.map((keyword, i) => (
                                <Badge key={i} variant="outline" className="mr-1 text-xs">
                                  {keyword}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Crisis Flags */}
              {annotation.crisisFlags.length > 0 && (
                <Card className="border-red-200 dark:border-red-800">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-5 w-5" />
                      Crisis Flags
                      <Badge variant="destructive">{annotation.crisisFlags.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {annotation.crisisFlags.map((flag, idx) => (
                        <div key={idx} className="p-3 border border-red-200 dark:border-red-800 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium capitalize text-red-700 dark:text-red-300">
                              {flag.type.replace('_', ' ')}
                            </h4>
                            <div className="flex gap-2">
                              <Badge variant="destructive">
                                {flag.severity}
                              </Badge>
                              <Badge variant="outline" className="text-red-600">
                                {(flag.confidence * 100).toFixed(1)}%
                              </Badge>
                            </div>
                          </div>
                          {flag.keywords.length > 0 && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Keywords: </span>
                              {flag.keywords.map((keyword, i) => (
                                <Badge key={i} variant="destructive" className="mr-1 text-xs">
                                  {keyword}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sentiment Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Sentiment Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Score</Label>
                      <div className="text-2xl font-bold">
                        {annotation.sentiment.score.toFixed(2)}
                        <Badge 
                          variant={annotation.sentiment.score > 0.2 ? 'default' : 
                                  annotation.sentiment.score < -0.2 ? 'destructive' : 'secondary'}
                          className="ml-2"
                        >
                          {annotation.sentiment.score > 0.2 ? 'Positive' :
                           annotation.sentiment.score < -0.2 ? 'Negative' : 'Neutral'}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Magnitude</Label>
                      <div className="text-2xl font-bold">
                        {annotation.sentiment.magnitude.toFixed(2)}
                        <Badge variant="outline" className="ml-2">
                          {annotation.sentiment.magnitude > 0.5 ? 'Strong' : 'Mild'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Context Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Context Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Message Length</Label>
                      <p className="font-mono">{annotation.context.messageLength} chars</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Time of Day</Label>
                      <p className="font-mono">{annotation.context.timeOfDay}:00</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Conversation Depth</Label>
                      <p className="font-mono">{annotation.context.conversationDepth}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Recent Mood</Label>
                      <p className="font-mono">{annotation.context.recentMood || 'Unknown'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter text to see real-time annotations</p>
                  <p className="text-sm mt-1">Or select a golden sample</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}