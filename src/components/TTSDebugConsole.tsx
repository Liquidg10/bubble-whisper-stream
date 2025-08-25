import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { runTTSDiagnostic, TTSDiagnosticResult } from '@/test/tts-diagnostic';

interface DiagnosticResults {
  results: TTSDiagnosticResult[];
  overallConfidence: number;
  recommendation: string;
}

export function TTSDebugConsole() {
  const [results, setResults] = useState<DiagnosticResults | null>(null);
  const [running, setRunning] = useState(false);

  const runDiagnostic = async () => {
    setRunning(true);
    try {
      const diagnostic = await runTTSDiagnostic();
      setResults(diagnostic);
    } catch (error) {
      console.error('Diagnostic failed:', error);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">TTS Diagnostic Console</h3>
          <Button 
            onClick={runDiagnostic} 
            disabled={running}
            variant="outline"
          >
            {running ? 'Running Tests...' : 'Run Diagnostic'}
          </Button>
        </div>

        {results && (
          <div className="space-y-4">
            <div className="grid gap-2">
              {results.results.map((result, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={result.passed ? "default" : "destructive"}>
                      {result.passed ? '✅' : '❌'}
                    </Badge>
                    <div>
                      <div className="font-medium">{result.test}</div>
                      <div className="text-sm text-muted-foreground">
                        {result.details}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {result.confidence}% confidence
                  </Badge>
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-lg">
                    Overall Confidence: {results.overallConfidence}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {results.recommendation}
                  </div>
                </div>
                <Badge 
                  variant={results.overallConfidence > 80 ? "default" : "secondary"}
                  className="text-lg p-2"
                >
                  {results.overallConfidence > 80 ? 'High' : 
                   results.overallConfidence > 60 ? 'Medium' : 'Low'} Confidence
                </Badge>
              </div>
            </div>

            {results.overallConfidence > 85 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="font-medium text-orange-800">
                  🎯 High Confidence Fix Needed
                </div>
                <div className="text-sm text-orange-700 mt-1">
                  Base64 encoding in the ai-tts-generate edge function is corrupting audio data.
                  Replace lines 107-110 with proper binary-to-base64 conversion.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}