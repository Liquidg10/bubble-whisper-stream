import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MapPin, Clock, TrendingUp, Bell, Settings, Calendar, Target } from 'lucide-react';
import { 
  locationIntelligenceService, 
  LocationPattern, 
  LocationPrediction, 
  LocationReminder 
} from '@/services/locationIntelligenceService';
import { BecausePill } from '@/components/BecausePill';
import { useBubbleStore } from '@/stores/bubbleStore';

interface LocationIntelligencePanelProps {
  onCreateReminder?: () => void;
  onViewSettings?: () => void;
}

export const LocationIntelligencePanel: React.FC<LocationIntelligencePanelProps> = ({
  onCreateReminder,
  onViewSettings
}) => {
  const { settings } = useBubbleStore();
  const [patterns, setPatterns] = useState<LocationPattern[]>([]);
  const [predictions, setPredictions] = useState<LocationPrediction[]>([]);
  const [reminders, setReminders] = useState<LocationReminder[]>([]);
  const [toolSuggestions, setToolSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (settings.locationIntelligenceEnabled) {
      loadLocationData();
    } else {
      setIsLoading(false);
    }
  }, [settings.locationIntelligenceEnabled]);

  const loadLocationData = async () => {
    setIsLoading(true);
    try {
      const [patternsData, predictionsData, remindersData, toolsData] = await Promise.all([
        locationIntelligenceService.getLocationPatterns(),
        locationIntelligenceService.generateLocationPredictions(),
        locationIntelligenceService.getLocationReminders(),
        locationIntelligenceService.getLocationBasedToolSuggestions()
      ]);

      setPatterns(patternsData.slice(0, 5)); // Top 5 patterns
      setPredictions(predictionsData);
      setReminders(remindersData.slice(0, 3)); // Recent 3 reminders
      setToolSuggestions(toolsData);
    } catch (error) {
      console.warn('Failed to load location intelligence data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatConfidence = (confidence: number) => {
    return `${(confidence * 100).toFixed(0)}%`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-orange-600 bg-orange-50';
  };

  if (!settings.locationIntelligenceEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Intelligence
            <Badge variant="outline">Disabled</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Location Intelligence helps you by learning your patterns
            </p>
            <p className="text-xs text-muted-foreground">
              • Suggests relevant tools based on where you are<br />
              • Creates location-based reminders<br />
              • All data stays on your device
            </p>
          </div>
          <Button 
            onClick={onViewSettings}
            variant="outline"
            size="sm"
            className="mt-4"
          >
            Enable in Settings
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2 animate-pulse" />
          <p className="text-muted-foreground">Analyzing location patterns...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Location Intelligence</h2>
        </div>
        <div className="flex gap-2">
          {onCreateReminder && (
            <Button variant="outline" size="sm" onClick={onCreateReminder}>
              <Bell className="h-4 w-4 mr-2" />
              Add Reminder
            </Button>
          )}
          {onViewSettings && (
            <Button variant="outline" size="sm" onClick={onViewSettings}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Predictions */}
      {predictions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Location Predictions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {predictions.map((prediction, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{prediction.location.placeName}</div>
                    <div className="text-xs text-muted-foreground">{prediction.reasoning}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Suggested: {prediction.suggestedTime}
                    </div>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className={`text-xs ${getConfidenceColor(prediction.probability)}`}
                  >
                    {formatConfidence(prediction.probability)}
                  </Badge>
                </div>
                
                {prediction.actionSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {prediction.actionSuggestions.map((suggestion, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {suggestion}
                      </Badge>
                    ))}
                  </div>
                )}
                
                {index < predictions.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Location Patterns */}
      {patterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              Learned Patterns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {patterns.map((pattern, index) => (
              <div key={pattern.id} className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{pattern.placeName}</div>
                    <div className="text-xs text-muted-foreground">
                      {pattern.visitFrequency} visits • Last: {new Date(pattern.lastVisit).toLocaleDateString()}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pattern.preferredTimeOfDay.slice(0, 3).map((time, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {time.replace('-', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getConfidenceColor(pattern.confidence)}`}
                  >
                    {formatConfidence(pattern.confidence)}
                  </Badge>
                </div>
                
                {pattern.associatedActivities.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Activities:</div>
                    <div className="flex flex-wrap gap-1">
                      {pattern.associatedActivities.map((activity, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {activity.replace('-', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {index < patterns.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active Reminders */}
      {reminders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" />
              Active Location Reminders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reminders.map((reminder, index) => (
              <div key={reminder.id} className="space-y-1">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{reminder.title}</div>
                    <div className="text-xs text-muted-foreground">{reminder.description}</div>
                    <div className="text-xs text-muted-foreground">
                      📍 {reminder.targetLocation.name} • {reminder.triggerRadius}m radius
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {reminder.triggeredCount} triggers
                  </Badge>
                </div>
                {index < reminders.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tool Suggestions */}
      {toolSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Suggested Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <BecausePill 
                explanation="Based on your current location and patterns"
                variant="pill"
                compact
              />
              <div className="flex flex-wrap gap-2">
                {toolSuggestions.map((suggestion, index) => (
                  <Button key={index} variant="outline" size="sm">
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {patterns.length === 0 && predictions.length === 0 && reminders.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Building Location Intelligence</h3>
            <p className="text-muted-foreground">
              Enable location tracking to start learning your patterns and receive intelligent suggestions.
            </p>
            <Button className="mt-4" onClick={loadLocationData}>
              <Settings className="h-4 w-4 mr-2" />
              Enable Location Features
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};