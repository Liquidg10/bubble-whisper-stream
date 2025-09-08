/**
 * Development page for testing Auto-Write Calendar functionality
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CalendarAutoWritePanel } from '@/components/CalendarAutoWritePanel';
import { autoWriteCalendarService, CalendarIntent } from '@/services/autoWriteCalendarService';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, MapPin, Users, Brain, Zap } from 'lucide-react';

export default function DevAutoWriteCalendar() {
  const { toast } = useToast();
  
  const [testIntent, setTestIntent] = useState<Partial<CalendarIntent>>({
    title: 'Team Standup',
    description: 'Daily standup meeting with the development team',
    location: 'Conference Room A',
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // +30 min
    attendees: ['john@example.com', 'jane@example.com'],
    source: 'text' as const,
    originalContent: 'Let\'s schedule our daily standup for tomorrow at 9am in Conference Room A'
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const handleProcessIntent = async () => {
    if (!testIntent.title || !testIntent.startTime) {
      toast({
        title: "Validation Error",
        description: "Title and start time are required.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    try {
      const fullIntent: CalendarIntent = {
        title: testIntent.title,
        description: testIntent.description || '',
        location: testIntent.location || '',
        startTime: testIntent.startTime,
        endTime: testIntent.endTime || new Date(testIntent.startTime.getTime() + 60 * 60 * 1000),
        attendees: testIntent.attendees || [],
        confidence: 0.9, // Mock high confidence for testing
        source: testIntent.source || 'text',
        originalContent: testIntent.originalContent || testIntent.title
      };

      const result = await autoWriteCalendarService.processCalendarIntent(fullIntent);
      setLastResult(result);
      
      toast({
        title: "Intent Processed",
        description: `Result: ${result.decision} (confidence: ${result.confidence.toFixed(2)})`,
      });
    } catch (error: any) {
      console.error('Intent processing error:', error);
      toast({
        title: "Processing Error",
        description: error.message || "Failed to process calendar intent",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickTest = (scenario: string) => {
    switch (scenario) {
      case 'high-confidence':
        setTestIntent({
          title: 'Important Client Meeting',
          description: 'Quarterly business review with Acme Corp',
          location: 'Boardroom',
          startTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          attendees: ['client@acme.com', 'sales@company.com'],
          source: 'email',
          originalContent: 'Please schedule our quarterly business review for Wednesday at 2pm in the boardroom with the Acme Corp team.'
        });
        break;
        
      case 'medium-confidence':
        setTestIntent({
          title: 'Maybe lunch meeting?',
          description: 'Possible lunch discussion',
          location: 'TBD',
          startTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          attendees: ['colleague@company.com'],
          source: 'text',
          originalContent: 'Want to grab lunch sometime this week to discuss the project? Maybe Thursday?'
        });
        break;
        
      case 'low-confidence':
        setTestIntent({
          title: 'Unclear meeting',
          description: 'Something about the thing',
          location: '',
          startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          attendees: [],
          source: 'voice',
          originalContent: 'We should probably meet about that thing we discussed, you know, sometime next week or something.'
        });
        break;
    }
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'auto-write': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'suggest': return 'bg-blue-100 text-blue-800';
      case 'skip': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Auto-Write Calendar Development</h1>
        <p className="text-muted-foreground">
          Test Context Engine gates, decision traces, and undo compensation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Intent Builder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Test Intent Builder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick Test Scenarios */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Quick Test Scenarios</Label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickTest('high-confidence')}
                >
                  High Confidence
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickTest('medium-confidence')}
                >
                  Medium Confidence
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickTest('low-confidence')}
                >
                  Low Confidence
                </Button>
              </div>
            </div>

            {/* Intent Fields */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Title *
                </Label>
                <Input
                  value={testIntent.title || ''}
                  onChange={(e) => setTestIntent(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Meeting title..."
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={testIntent.description || ''}
                  onChange={(e) => setTestIntent(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Meeting description..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Start Time *
                  </Label>
                  <Input
                    type="datetime-local"
                    value={testIntent.startTime?.toISOString().slice(0, 16) || ''}
                    onChange={(e) => setTestIntent(prev => ({ 
                      ...prev, 
                      startTime: e.target.value ? new Date(e.target.value) : undefined 
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="datetime-local"
                    value={testIntent.endTime?.toISOString().slice(0, 16) || ''}
                    onChange={(e) => setTestIntent(prev => ({ 
                      ...prev, 
                      endTime: e.target.value ? new Date(e.target.value) : undefined 
                    }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Location
                </Label>
                <Input
                  value={testIntent.location || ''}
                  onChange={(e) => setTestIntent(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Meeting location..."
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Attendees
                </Label>
                <Input
                  value={testIntent.attendees?.join(', ') || ''}
                  onChange={(e) => setTestIntent(prev => ({ 
                    ...prev, 
                    attendees: e.target.value.split(',').map(email => email.trim()).filter(Boolean)
                  }))}
                  placeholder="email1@example.com, email2@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Source</Label>
                <Select
                  value={testIntent.source || 'text'}
                  onValueChange={(value: 'text' | 'email' | 'voice') => 
                    setTestIntent(prev => ({ ...prev, source: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text Input</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="voice">Voice</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Original Content</Label>
                <Textarea
                  value={testIntent.originalContent || ''}
                  onChange={(e) => setTestIntent(prev => ({ ...prev, originalContent: e.target.value }))}
                  placeholder="Original text that triggered this intent..."
                  rows={3}
                />
              </div>
            </div>

            <Button
              onClick={handleProcessIntent}
              disabled={isProcessing}
              className="w-full"
            >
              {isProcessing ? (
                <>Processing Intent...</>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Process Intent
                </>
              )}
            </Button>

            {/* Result Display */}
            {lastResult && (
              <Alert>
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <strong>Decision:</strong>
                      <Badge className={getDecisionColor(lastResult.decision)}>
                        {lastResult.decision}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        (confidence: {(lastResult.confidence * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div>
                      <strong>Because:</strong> {lastResult.becauseText}
                    </div>
                    {lastResult.eventId && (
                      <div>
                        <strong>Event ID:</strong> {lastResult.eventId}
                      </div>
                    )}
                    {lastResult.draftId && (
                      <div>
                        <strong>Draft ID:</strong> {lastResult.draftId}
                      </div>
                    )}
                    <div>
                      <strong>Trace ID:</strong> {lastResult.traceId}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Auto-Write Settings Panel */}
        <CalendarAutoWritePanel />
      </div>
    </div>
  );
}