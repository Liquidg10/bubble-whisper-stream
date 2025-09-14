/**
 * Phase 3: Final Integration Test Page
 * Comprehensive validation of calendar-AI integration with real data
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Brain, 
  Zap, 
  Calendar,
  BarChart3,
  Settings,
  RefreshCw
} from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';
import { useCalendarAI } from '@/hooks/useCalendarAI';
import { GradualRolloutDashboard } from '@/components/dev/GradualRolloutDashboard';
import { CalendarDensityMonitor } from '@/components/calendar/CalendarDensityMonitor';
import { SpacingSuggestionPanel } from '@/components/calendar/SpacingSuggestionPanel';
import { shouldShowFeature, getRolloutStatus } from '@/utils/gradualRollout';
import { behavioralScienceEngine } from '@/services/behavioralScienceEngine';
import { calendarSpacingService } from '@/services/calendarSpacingService';
import { taskAwareAutoWriteService } from '@/services/taskAwareAutoWriteService';

interface ValidationResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

export default function Phase3Integration() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  
  const { tasks, addTask } = useTaskStore();
  const aiState = useCalendarAI(selectedDate);

  const runValidation = async () => {
    setIsValidating(true);
    const results: ValidationResult[] = [];

    // Test 1: Feature Flag Integration
    try {
      const calendarAIEnabled = shouldShowFeature('calendarAI');
      results.push({
        name: 'Feature Flag Integration',
        status: 'pass',
        message: `Calendar AI ${calendarAIEnabled ? 'enabled' : 'disabled'} via gradual rollout`
      });
    } catch (error) {
      results.push({
        name: 'Feature Flag Integration',
        status: 'fail',
        message: `Feature flag error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // Test 2: Real Data Integration
    try {
      const testTaskCount = tasks.length;
      const calendarEvents = aiState.dateEvents.length;
      results.push({
        name: 'Real Data Integration',
        status: testTaskCount > 0 ? 'pass' : 'warning',
        message: `${testTaskCount} tasks, ${calendarEvents} calendar events for selected date`,
        details: testTaskCount === 0 ? 'Add some tasks to test AI features' : undefined
      });
    } catch (error) {
      results.push({
        name: 'Real Data Integration',
        status: 'fail',
        message: `Data integration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // Test 3: AI Suggestions Generation
    try {
      const suggestions = aiState.suggestions;
      const hasActiveSuggestions = suggestions.length > 0;
      results.push({
        name: 'AI Suggestions Generation',
        status: hasActiveSuggestions ? 'pass' : 'warning',
        message: `${suggestions.length} AI suggestions generated`,
        details: !hasActiveSuggestions ? 'No suggestions (may be due to low calendar density)' : undefined
      });
    } catch (error) {
      results.push({
        name: 'AI Suggestions Generation',
        status: 'fail',
        message: `Suggestion generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // Test 4: Stress Level Detection
    try {
      const stressLevel = behavioralScienceEngine.detectStressLevel();
      const densityMetrics = aiState.densityMetrics;
      results.push({
        name: 'Stress Level Detection',
        status: 'pass',
        message: `Stress level: ${Math.round(stressLevel * 100)}%, Calendar density: ${densityMetrics.totalHours.toFixed(1)}h`,
        details: `${densityMetrics.eventCount} events, ${densityMetrics.isPacked ? 'packed' : 'normal'} day`
      });
    } catch (error) {
      results.push({
        name: 'Stress Level Detection',
        status: 'fail',
        message: `Stress detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // Test 5: Auto-Write Service Integration
    try {
      const mappings = taskAwareAutoWriteService.getAllMappings();
      results.push({
        name: 'Auto-Write Service Integration',
        status: 'pass',
        message: `${mappings.size} calendar mappings tracked`,
        details: 'Auto-write service operational'
      });
    } catch (error) {
      results.push({
        name: 'Auto-Write Service Integration',
        status: 'fail',
        message: `Auto-write service error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // Test 6: Gradual Rollout Status
    try {
      const rolloutStatus = getRolloutStatus();
      const activeFeatures = Object.values(rolloutStatus).filter(s => s.enabled).length;
      results.push({
        name: 'Gradual Rollout Status',
        status: 'pass',
        message: `${activeFeatures}/${Object.keys(rolloutStatus).length} features active`,
        details: 'Rollout controls operational'
      });
    } catch (error) {
      results.push({
        name: 'Gradual Rollout Status',
        status: 'fail',
        message: `Rollout status error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    setValidationResults(results);
    setIsValidating(false);
  };

  const createTestTask = async () => {
    const now = new Date();
    const testTask = {
      title: `Test Calendar Task - ${now.toLocaleTimeString()}`,
      type: 'task' as const,
      priority: 75,
      completed: false,
      tags: [{ id: 'test', name: 'test', emoji: '🧪' }],
      due: selectedDate.getTime(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      view: {
        calendar: {
          startTime: new Date(selectedDate.getTime() + 9 * 60 * 60 * 1000).toISOString(), // 9 AM
          durationMin: 60,
          location: 'Test Location'
        }
      }
    };
    
    await addTask(testTask);
  };

  useEffect(() => {
    runValidation();
  }, [selectedDate, tasks, aiState]);

  const overallStatus = validationResults.every(r => r.status === 'pass') ? 'pass' :
                       validationResults.some(r => r.status === 'fail') ? 'fail' : 'warning';

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="h-8 w-8" />
            Phase 3: Final Integration
          </h1>
          <p className="text-muted-foreground">
            Comprehensive validation of calendar-AI integration with real data
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant={
            overallStatus === 'pass' ? 'default' : 
            overallStatus === 'fail' ? 'destructive' : 'secondary'
          }>
            {overallStatus === 'pass' ? '✓ All Systems Operational' :
             overallStatus === 'fail' ? '✗ Issues Detected' : '⚠ Warnings Present'}
          </Badge>
          <Button onClick={runValidation} disabled={isValidating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isValidating ? 'animate-spin' : ''}`} />
            Validate
          </Button>
        </div>
      </div>

      <Tabs defaultValue="validation" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="validation">Integration Validation</TabsTrigger>
          <TabsTrigger value="ai-features">AI Features Demo</TabsTrigger>
          <TabsTrigger value="rollout">Gradual Rollout</TabsTrigger>
          <TabsTrigger value="metrics">Live Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Validation Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {validationResults.map((result, index) => (
                <div key={index} className="flex items-start gap-3 p-3 border rounded">
                  {result.status === 'pass' && <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />}
                  {result.status === 'fail' && <XCircle className="h-5 w-5 text-red-500 mt-0.5" />}
                  {result.status === 'warning' && <Clock className="h-5 w-5 text-yellow-500 mt-0.5" />}
                  
                  <div className="flex-1">
                    <div className="font-medium">{result.name}</div>
                    <div className="text-sm text-muted-foreground">{result.message}</div>
                    {result.details && (
                      <div className="text-xs text-muted-foreground mt-1">{result.details}</div>
                    )}
                  </div>
                </div>
              ))}
              
              {validationResults.length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  Run validation to see results
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-features" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Date Selection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <input
                  type="date"
                  value={selectedDate.toISOString().split('T')[0]}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  className="w-full p-2 border rounded"
                />
                <Button onClick={createTestTask} className="w-full mt-2">
                  Add Test Task for Selected Date
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  AI State
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>AI Enabled: {aiState.isEnabled ? '✅' : '❌'}</div>
                <div>Calendar Events: {aiState.dateEvents.length}</div>
                <div>AI Suggestions: {aiState.suggestions.length}</div>
                <div>Stress Level: {Math.round(aiState.stressLevel * 100)}%</div>
                <div>Total Hours: {aiState.densityMetrics.totalHours.toFixed(1)}h</div>
                <div>Day Status: {aiState.densityMetrics.isPacked ? 'Packed' : 'Normal'}</div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <CalendarDensityMonitor
              date={selectedDate}
              events={aiState.dateEvents}
            />
            
            <SpacingSuggestionPanel
              date={selectedDate}
              events={aiState.dateEvents}
              onApplySuggestion={(suggestion) => {
                console.log('Applied suggestion:', suggestion);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="rollout">
          <GradualRolloutDashboard />
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tasks.length}</div>
                <div className="text-xs text-muted-foreground">Total tasks</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Calendar Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{aiState.dateEvents.length}</div>
                <div className="text-xs text-muted-foreground">For selected date</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">AI Suggestions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{aiState.suggestions.length}</div>
                <div className="text-xs text-muted-foreground">Active suggestions</div>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Brain className="h-4 w-4" />
            <AlertDescription>
              All metrics are live and update automatically as you interact with the calendar and tasks.
              Add tasks with calendar information to see AI features in action.
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>
    </div>
  );
}