/**
 * Development page for testing Context Engine
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Brain, Play, RotateCcw } from 'lucide-react';
import { ContextEnginePanel } from '@/components/ContextEnginePanel';
import { ContextInput } from '@/services/contextEngineService';

// Test scenarios
const TEST_SCENARIOS = {
  'high-confidence': {
    name: 'High Confidence',
    description: 'Clear scheduling with trusted sender and deadline',
    input: {
      content: "Meeting with Sarah at 3:00 PM tomorrow in Conference Room B to finalize Q4 budget presentation",
      sender: "sarah.manager@company.com",
      deadline: new Date(Date.now() + 20 * 60 * 60 * 1000), // 20 hours
      eventType: 'calendar' as const,
      recipientCount: 3
    }
  },
  'medium-confidence': {
    name: 'Medium Confidence', 
    description: 'Some ambiguity but reasonable details',
    input: {
      content: "Maybe we could schedule a call sometime next week to discuss the project timeline",
      sender: "colleague@gmail.com",
      eventType: 'email' as const
    }
  },
  'low-confidence': {
    name: 'Low Confidence',
    description: 'High ambiguity, unknown sender, quiet hours',
    input: {
      content: "Not sure when we can connect, possibly sometime or maybe later, unclear about location",
      sender: "unknown@randomdomain.com", 
      eventType: 'email' as const,
      currentTime: new Date('2024-01-15T23:30:00Z') // Late night
    }
  },
  'urgent': {
    name: 'Urgent Scenario',
    description: 'Multiple urgency signals',
    input: {
      content: "URGENT: Emergency board meeting ASAP - critical security breach requires immediate action",
      sender: "ceo@company.com",
      deadline: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour
      eventType: 'calendar' as const,
      recipientCount: 8
    }
  },
  'ambiguous': {
    name: 'Highly Ambiguous',
    description: 'Conflicting information and uncertain language',
    input: {
      content: "We could meet either Monday or Tuesday, maybe at 2 PM or 3 PM, possibly in Room A or alternatively Room B, or perhaps virtually",
      sender: "team@company.com",
      eventType: 'calendar' as const
    }
  }
};

export const DevContextEngine: React.FC = () => {
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [customInput, setCustomInput] = useState<ContextInput>({
    content: '',
    sender: '',
    eventType: 'email'
  });
  const [useCustom, setUseCustom] = useState(false);
  const [currentInput, setCurrentInput] = useState<ContextInput | undefined>();

  const loadScenario = (scenarioKey: string) => {
    const scenario = TEST_SCENARIOS[scenarioKey as keyof typeof TEST_SCENARIOS];
    if (scenario) {
      setSelectedScenario(scenarioKey);
      setCurrentInput(scenario.input);
      setUseCustom(false);
    }
  };

  const runCustomAnalysis = () => {
    setCurrentInput({ ...customInput });
    setUseCustom(true);
    setSelectedScenario('');
  };

  const resetAll = () => {
    setSelectedScenario('');
    setCurrentInput(undefined);
    setUseCustom(false);
    setCustomInput({
      content: '',
      sender: '',
      eventType: 'email'
    });
  };

  const updateCustomInput = (field: keyof ContextInput, value: any) => {
    setCustomInput(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Context Engine Development</h1>
          <p className="text-muted-foreground">Test signal processing and confidence scoring</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Controls */}
        <div className="space-y-6">
          {/* Scenario Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Scenarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                {Object.entries(TEST_SCENARIOS).map(([key, scenario]) => (
                  <Button
                    key={key}
                    variant={selectedScenario === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => loadScenario(key)}
                    className="justify-start h-auto p-3"
                  >
                    <div className="text-left">
                      <div className="font-medium">{scenario.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {scenario.description}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={resetAll}
                className="w-full"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset All
              </Button>
            </CardContent>
          </Card>

          {/* Custom Input */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Custom Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  placeholder="Enter content to analyze..."
                  value={customInput.content}
                  onChange={(e) => updateCustomInput('content', e.target.value)}
                  className="min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sender">Sender</Label>
                  <Input
                    id="sender"
                    placeholder="sender@example.com"
                    value={customInput.sender}
                    onChange={(e) => updateCustomInput('sender', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="eventType">Event Type</Label>
                  <Select
                    value={customInput.eventType}
                    onValueChange={(value) => updateCustomInput('eventType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="calendar">Calendar</SelectItem>
                      <SelectItem value="task">Task</SelectItem>
                      <SelectItem value="reminder">Reminder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline (Hours from now)</Label>
                  <Input
                    id="deadline"
                    type="number"
                    placeholder="24"
                    onChange={(e) => {
                      const hours = parseInt(e.target.value);
                      if (!isNaN(hours)) {
                        updateCustomInput('deadline', new Date(Date.now() + hours * 60 * 60 * 1000));
                      } else {
                        updateCustomInput('deadline', undefined);
                      }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recipients">Recipient Count</Label>
                  <Input
                    id="recipients"
                    type="number"
                    placeholder="1"
                    onChange={(e) => {
                      const count = parseInt(e.target.value);
                      updateCustomInput('recipientCount', isNaN(count) ? undefined : count);
                    }}
                  />
                </div>
              </div>

              <Button
                onClick={runCustomAnalysis}
                disabled={!customInput.content}
                className="w-full"
              >
                <Play className="h-3 w-3 mr-1" />
                Analyze Custom Input
              </Button>
            </CardContent>
          </Card>

          {/* Current Input Display */}
          {currentInput && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  Current Input
                  {useCustom ? (
                    <Badge variant="secondary">Custom</Badge>
                  ) : (
                    <Badge variant="outline">{selectedScenario}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Content:</span>
                    <div className="text-muted-foreground mt-1 p-2 bg-muted rounded text-xs">
                      {currentInput.content || 'None'}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium">Sender:</span>
                      <div className="text-muted-foreground">{currentInput.sender || 'None'}</div>
                    </div>
                    <div>
                      <span className="font-medium">Type:</span>
                      <div className="text-muted-foreground">{currentInput.eventType}</div>
                    </div>
                  </div>

                  {currentInput.deadline && (
                    <div>
                      <span className="font-medium">Deadline:</span>
                      <div className="text-muted-foreground">
                        {currentInput.deadline.toLocaleString()}
                      </div>
                    </div>
                  )}

                  {currentInput.recipientCount && (
                    <div>
                      <span className="font-medium">Recipients:</span>
                      <div className="text-muted-foreground">{currentInput.recipientCount}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Context Engine Panel */}
        <div>
          <ContextEnginePanel input={currentInput} />
        </div>
      </div>
    </div>
  );
};