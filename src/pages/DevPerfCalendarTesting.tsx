/**
 * Dev Performance Calendar Testing Route
 * Missing dev route for perf-calendar testing
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Calendar, Zap, AlertTriangle } from 'lucide-react';
import { CalendarDensityMonitor } from '@/components/calendar/CalendarDensityMonitor';
import { SpacingSuggestionPanel } from '@/components/calendar/SpacingSuggestionPanel';
import { AISchedulingSuggestions } from '@/components/AISchedulingSuggestions';
import { useMobileCalendarPerformance } from '@/hooks/useMobileCalendarPerformance';

export default function DevPerfCalendarTesting() {
  const [testDate] = React.useState(new Date());
  const [mockDensityEvents] = React.useState([
    { title: 'Team Meeting', start: new Date(2024, 0, 1, 9, 0), end: new Date(2024, 0, 1, 10, 0) },
    { title: 'Focus Time', start: new Date(2024, 0, 1, 10, 30), end: new Date(2024, 0, 1, 12, 0) },
    { title: 'Lunch', start: new Date(2024, 0, 1, 12, 0), end: new Date(2024, 0, 1, 13, 0) },
    { title: 'Client Call', start: new Date(2024, 0, 1, 14, 0), end: new Date(2024, 0, 1, 15, 30) },
  ]);

  const [mockSpacingEvents] = React.useState([
    { id: '1', title: 'Team Meeting', start: new Date(2024, 0, 1, 9, 0), end: new Date(2024, 0, 1, 10, 0), priority: 5 },
    { id: '2', title: 'Focus Time', start: new Date(2024, 0, 1, 10, 30), end: new Date(2024, 0, 1, 12, 0), priority: 3, isFlexible: true },
    { id: '3', title: 'Lunch', start: new Date(2024, 0, 1, 12, 0), end: new Date(2024, 0, 1, 13, 0), priority: 2 },
    { id: '4', title: 'Client Call', start: new Date(2024, 0, 1, 14, 0), end: new Date(2024, 0, 1, 15, 30), priority: 5 },
  ]);

  const {
    getAdaptiveStyles,
    getPerformanceStatus,
    isMobile,
    currentFPS,
    lodLevel,
    triggerHaptic,
  } = useMobileCalendarPerformance();

  const performanceStatus = getPerformanceStatus();
  const adaptiveStyles = getAdaptiveStyles();

  return (
    <div className="container mx-auto p-6 space-y-6" style={adaptiveStyles}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Calendar Performance Testing
          </h1>
          <p className="text-muted-foreground">
            Test calendar AI integration and performance monitoring
          </p>
        </div>
        <Badge variant={performanceStatus.isOptimal ? 'default' : 'destructive'}>
          {performanceStatus.isOptimal ? 'Performing Well' : 'Performance Issues'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Current FPS</label>
                <div className="text-2xl font-bold text-primary">{currentFPS}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">LOD Level</label>
                <div className="text-2xl font-bold text-secondary">{lodLevel}</div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Device</label>
              <Badge variant={isMobile ? 'secondary' : 'outline'}>
                {isMobile ? 'Mobile' : 'Desktop'}
              </Badge>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <p className="text-sm text-muted-foreground">
                {performanceStatus.recommendation}
              </p>
            </div>

            {isMobile && (
              <Button 
                onClick={() => triggerHaptic('medium')}
                variant="outline"
                className="w-full"
              >
                Test Haptic Feedback
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Calendar Density Monitor Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendar Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CalendarDensityMonitor
              date={testDate}
              events={mockDensityEvents}
            />
          </CardContent>
        </Card>

        {/* Spacing Suggestions Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Spacing Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SpacingSuggestionPanel
              date={testDate}
              events={mockSpacingEvents}
              onApplySuggestion={(suggestion) => {
                console.log('Applied suggestion:', suggestion);
                if (isMobile) triggerHaptic('light');
              }}
            />
          </CardContent>
        </Card>

        {/* AI Scheduling Suggestions Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              AI Scheduling
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AISchedulingSuggestions 
              maxSuggestions={3}
              onSuggestionAccepted={(suggestion, task) => {
                console.log('AI Suggestion accepted:', { suggestion, task });
                if (isMobile) triggerHaptic('medium');
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Debug Information */}
      {process.env.NODE_ENV === 'development' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Debug Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-md overflow-auto">
              {JSON.stringify({
                performance: performanceStatus,
                mobile: isMobile,
                fps: currentFPS,
                lod: lodLevel,
                adaptiveStyles,
                timestamp: new Date().toISOString()
              }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}