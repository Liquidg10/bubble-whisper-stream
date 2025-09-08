/**
 * Development page for testing Temporal Reasoning functionality
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { temporalReasoningService, TemporalAnalysisResult } from '@/services/temporalReasoningService';
import { useToast } from '@/hooks/use-toast';
import { Clock, Calendar, Globe, AlertTriangle, CheckCircle, Brain, Zap } from 'lucide-react';

const TRICKY_TEST_CASES = [
  {
    name: 'Timezone Ambiguity',
    text: 'Meeting tomorrow at 3pm EST',
    description: 'Should handle timezone parsing and conversion'
  },
  {
    name: 'Date Format Ambiguity (US vs EU)',
    text: 'Schedule for 10/11/2024 at noon',
    description: 'Should flag MM/DD vs DD/MM ambiguity'
  },
  {
    name: 'Relative Date + Natural Time',
    text: 'Next Friday evening around 6',
    description: 'Should parse relative date and natural time'
  },
  {
    name: 'Ambiguous Duration',
    text: 'Quick chat sometime this week maybe Thursday?',
    description: 'Should degrade due to low confidence'
  },
  {
    name: 'Business Hours Conflict',
    text: 'Team meeting tomorrow at 2am',
    description: 'Should detect unreasonable time'
  },
  {
    name: 'Weekend Scheduling',
    text: 'Client call this Saturday morning',
    description: 'Should warn about weekend scheduling'
  },
  {
    name: 'Very Long Duration',
    text: 'All-day workshop from 8am to 8pm next Monday',
    description: 'Should detect unusual duration'
  },
  {
    name: 'Multiple Time References',
    text: 'Meeting at 2pm or maybe 3pm tomorrow',
    description: 'Should flag temporal ambiguity'
  },
  {
    name: 'Natural Language Only',
    text: 'Lunch meeting sometime next week',
    description: 'Should have low confidence due to vagueness'
  },
  {
    name: 'Invalid Date Combination',
    text: 'Schedule for February 30th at 2pm',
    description: 'Should handle invalid dates gracefully'
  }
];

export default function DevTemporalReasoning() {
  const { toast } = useToast();
  
  const [testText, setTestText] = useState('Meeting tomorrow at 3pm in the conference room');
  const [userTimezone, setUserTimezone] = useState('America/New_York');
  const [userLocale, setUserLocale] = useState<'US' | 'EU' | 'ISO'>('US');
  const [analysisResult, setAnalysisResult] = useState<TemporalAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [existingEvents] = useState([
    {
      id: 'existing-1',
      title: 'Existing Meeting',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 14.5 * 60 * 60 * 1000), // Tomorrow 2:30pm
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 16 * 60 * 60 * 1000) // Tomorrow 4pm
    },
    {
      id: 'existing-2', 
      title: 'Weekly Standup',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000), // Tomorrow 9am
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000) // Tomorrow 10am
    }
  ]);

  useEffect(() => {
    // Update temporal reasoning service with user preferences
    temporalReasoningService.updatePreferences(userTimezone, userLocale);
  }, [userTimezone, userLocale]);

  const handleAnalyze = async () => {
    if (!testText.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter text to analyze.",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = temporalReasoningService.analyzeTemporalExpression(
        testText,
        existingEvents,
        { userPreferences: { timezone: userTimezone, locale: userLocale } }
      );
      
      setAnalysisResult(result);
      
      toast({
        title: "Analysis Complete",
        description: `Confidence: ${(result.confidence * 100).toFixed(1)}% • ${result.conflicts.length} conflicts found`,
      });
    } catch (error: any) {
      console.error('Temporal analysis error:', error);
      toast({
        title: "Analysis Error",
        description: error.message || "Failed to analyze temporal expression",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleQuickTest = (testCase: typeof TRICKY_TEST_CASES[0]) => {
    setTestText(testCase.text);
    toast({
      title: "Test Case Loaded",
      description: testCase.description,
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Temporal Reasoning Development</h1>
        <p className="text-muted-foreground">
          Test date/time parsing, ambiguity detection, and conflict analysis
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input & Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Temporal Analysis Input
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick Test Cases */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tricky Test Cases</Label>
              <div className="grid grid-cols-2 gap-2">
                {TRICKY_TEST_CASES.map((testCase, index) => (
                  <Button
                    key={index}
                    size="sm"
                    variant="outline"
                    onClick={() => handleQuickTest(testCase)}
                    className="text-xs h-auto p-2 text-left justify-start"
                  >
                    {testCase.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Text Input */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Text to Analyze
              </Label>
              <Textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Enter text containing date/time information..."
                rows={3}
              />
            </div>

            {/* User Preferences */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  Timezone
                </Label>
                <Select value={userTimezone} onValueChange={setUserTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern (EST/EDT)</SelectItem>
                    <SelectItem value="America/Chicago">Central (CST/CDT)</SelectItem>
                    <SelectItem value="America/Denver">Mountain (MST/MDT)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (PST/PDT)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                    <SelectItem value="Europe/Paris">Paris (CET/CEST)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date Format</Label>
                <Select value={userLocale} onValueChange={(value: 'US' | 'EU' | 'ISO') => setUserLocale(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">US (MM/DD/YYYY)</SelectItem>
                    <SelectItem value="EU">EU (DD/MM/YYYY)</SelectItem>
                    <SelectItem value="ISO">ISO (YYYY-MM-DD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full"
            >
              {isAnalyzing ? (
                <>Analyzing...</>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Analyze Temporal Expression
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Analysis Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analysisResult ? (
              <>
                {/* Overall Assessment */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Overall Confidence</span>
                    <Badge className={getConfidenceColor(analysisResult.confidence)}>
                      {(analysisResult.confidence * 100).toFixed(1)}%
                    </Badge>
                  </div>
                  
                  {analysisResult.shouldDegrade && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Will Degrade to Draft:</strong> {analysisResult.degradeReason}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Parsed Elements */}
                <div className="space-y-2">
                  <h4 className="font-medium">Parsed Elements</h4>
                  <div className="space-y-1 text-sm">
                    {analysisResult.parseResult.startTime && (
                      <div className="flex justify-between">
                        <span>Start Time:</span>
                        <span className="font-mono">
                          {analysisResult.parseResult.startTime.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {analysisResult.parseResult.endTime && (
                      <div className="flex justify-between">
                        <span>End Time:</span>
                        <span className="font-mono">
                          {analysisResult.parseResult.endTime.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {analysisResult.parseResult.timezone && (
                      <div className="flex justify-between">
                        <span>Timezone:</span>
                        <span>{analysisResult.parseResult.timezone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ambiguities */}
                {analysisResult.parseResult.ambiguities.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Ambiguities Detected</h4>
                    <div className="space-y-1">
                      {analysisResult.parseResult.ambiguities.map((ambiguity, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {ambiguity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {analysisResult.parseResult.warnings.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Warnings</h4>
                    <div className="space-y-1">
                      {analysisResult.parseResult.warnings.map((warning, index) => (
                        <div key={index} className="text-sm text-yellow-600">
                          • {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conflicts */}
                {analysisResult.conflicts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Conflicts Found</h4>
                    <div className="space-y-2">
                      {analysisResult.conflicts.map((conflict, index) => (
                        <Alert key={index}>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium capitalize">{conflict.type.replace('_', ' ')}</span>
                              <Badge className={getSeverityColor(conflict.severity)}>
                                {conflict.severity}
                              </Badge>
                            </div>
                            <div className="text-sm">{conflict.description}</div>
                            {conflict.suggestion && (
                              <div className="text-xs text-muted-foreground mt-1">
                                💡 {conflict.suggestion}
                              </div>
                            )}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw Parse Result */}
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">Raw Analysis Data</summary>
                  <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto">
                    {JSON.stringify(analysisResult, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Enter text and click "Analyze" to see temporal reasoning results
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Existing Events Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Mock Existing Events (for conflict testing)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {existingEvents.map((event, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span className="font-medium">{event.title}</span>
                <span className="text-sm text-muted-foreground">
                  {event.startTime.toLocaleString()} - {event.endTime.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
