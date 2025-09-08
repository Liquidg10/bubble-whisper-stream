/**
 * Calendar Auto-Write Panel
 * 
 * UI for managing auto-write calendar settings and viewing decision traces
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  Settings,
  RefreshCw,
  Undo,
  ZapOff,
  Zap,
  Brain,
  Shield
} from 'lucide-react';
import { autoWriteCalendarService, CalendarAutoWriteSettings } from '@/services/autoWriteCalendarService';
import { decisionTraceService } from '@/services/decisionTraceService';
import { THRESHOLD_LEVELS } from '@/services/thresholdLadderService';
import { useToast } from '@/hooks/use-toast';
import { BecausePill } from '@/components/BecausePill';

export function CalendarAutoWritePanel() {
  const { toast } = useToast();
  
  const [settings, setSettings] = useState<CalendarAutoWriteSettings>({
    enabled: false,
    autoWriteThreshold: THRESHOLD_LEVELS.HIGH,
    draftThreshold: THRESHOLD_LEVELS.MEDIUM,
    allowFirstTimeRecipients: false,
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00'
  });
  
  const [recentWrites, setRecentWrites] = useState<Array<{
    traceId: string;
    description: string;
    timestamp: number;
  }>>([]);
  
  const [isUndoing, setIsUndoing] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadRecentWrites();
  }, []);

  const loadSettings = () => {
    // This would load from the service
    setSettings(autoWriteCalendarService['getAutoWriteSettings']());
  };

  const loadRecentWrites = () => {
    const writes = autoWriteCalendarService.getRecentUndoableWrites();
    setRecentWrites(writes);
  };

  const updateSetting = <K extends keyof CalendarAutoWriteSettings>(
    key: K, 
    value: CalendarAutoWriteSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    autoWriteCalendarService.updateAutoWriteSettings({ [key]: value });
    
    toast({
      title: "Settings Updated",
      description: `Auto-write calendar ${key} has been updated.`,
    });
  };

  const handleUndo = async (traceId: string) => {
    setIsUndoing(traceId);
    try {
      const success = await autoWriteCalendarService.undoCalendarWrite(traceId);
      if (success) {
        toast({
          title: "Event Undone",
          description: "The calendar event has been removed and linked reminders restored.",
        });
        loadRecentWrites(); // Refresh the list
      } else {
        toast({
          title: "Undo Failed",
          description: "Unable to undo the calendar event. It may have been modified.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Undo error:', error);
      toast({
        title: "Undo Error",
        description: "An error occurred while undoing the calendar event.",
        variant: "destructive"
      });
    } finally {
      setIsUndoing(null);
    }
  };

  const getConfidenceColor = (threshold: number) => {
    if (threshold >= THRESHOLD_LEVELS.HIGH) return 'text-green-600';
    if (threshold >= THRESHOLD_LEVELS.MEDIUM) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (threshold: number) => {
    if (threshold >= THRESHOLD_LEVELS.HIGH) return 'High';
    if (threshold >= THRESHOLD_LEVELS.MEDIUM) return 'Medium';
    return 'Low';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Auto-Write Calendar
            <Badge variant={settings.enabled ? "default" : "secondary"}>
              {settings.enabled ? 'Active' : 'Inactive'}
            </Badge>
          </CardTitle>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(enabled) => updateSetting('enabled', enabled)}
          />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {!settings.enabled && (
          <Alert>
            <ZapOff className="h-4 w-4" />
            <AlertDescription>
              Auto-write is disabled. When enabled, high-confidence calendar intents will automatically create events with full undo support.
            </AlertDescription>
          </Alert>
        )}
        
        {settings.enabled && (
          <>
            {/* Threshold Configuration */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                <Label className="text-sm font-medium">Confidence Thresholds</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Auto-Write Threshold</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={settings.autoWriteThreshold}
                      onChange={(e) => updateSetting('autoWriteThreshold', parseFloat(e.target.value))}
                      min={0}
                      max={1}
                      step={0.05}
                      className="w-20"
                    />
                    <span className={`text-sm ${getConfidenceColor(settings.autoWriteThreshold)}`}>
                      {getConfidenceLabel(settings.autoWriteThreshold)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Events are auto-created above this threshold
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">Draft Threshold</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={settings.draftThreshold}
                      onChange={(e) => updateSetting('draftThreshold', parseFloat(e.target.value))}
                      min={0}
                      max={1}
                      step={0.05}
                      className="w-20"
                    />
                    <span className={`text-sm ${getConfidenceColor(settings.draftThreshold)}`}>
                      {getConfidenceLabel(settings.draftThreshold)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Events are drafted for review above this threshold
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Safety Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <Label className="text-sm font-medium">Safety Settings</Label>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Allow First-Time Recipients</Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-create events with new attendees
                    </p>
                  </div>
                  <Switch
                    checked={settings.allowFirstTimeRecipients}
                    onCheckedChange={(checked) => updateSetting('allowFirstTimeRecipients', checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Respect Quiet Hours</Label>
                    <p className="text-xs text-muted-foreground">
                      Reduce auto-write confidence during quiet hours
                    </p>
                  </div>
                  <Switch
                    checked={settings.quietHoursEnabled}
                    onCheckedChange={(checked) => updateSetting('quietHoursEnabled', checked)}
                  />
                </div>
                
                {settings.quietHoursEnabled && (
                  <div className="grid grid-cols-2 gap-4 pl-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Start Time</Label>
                      <Input
                        type="time"
                        value={settings.quietHoursStart}
                        onChange={(e) => updateSetting('quietHoursStart', e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">End Time</Label>
                      <Input
                        type="time"
                        value={settings.quietHoursEnd}
                        onChange={(e) => updateSetting('quietHoursEnd', e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Recent Auto-Writes with Undo */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <Label className="text-sm font-medium">Recent Auto-Writes</Label>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadRecentWrites}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>
              
              {recentWrites.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No recent auto-writes to display. Events will appear here after auto-creation.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {recentWrites.map((write) => (
                    <div key={write.traceId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{write.description}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(write.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <BecausePill
                          explanation="Auto-written based on context confidence"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUndo(write.traceId)}
                          disabled={isUndoing === write.traceId}
                        >
                          {isUndoing === write.traceId ? (
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Undo className="h-3 w-3 mr-1" />
                          )}
                          Undo
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}