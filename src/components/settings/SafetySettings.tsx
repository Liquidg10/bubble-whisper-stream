import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Shield, 
  Power, 
  Settings2, 
  Calendar, 
  Mail, 
  DollarSign, 
  Brain,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { isFeatureEnabled, toggleFeatureFlag, type FeatureFlag } from '@/config/flags';
import { useToast } from '@/hooks/use-toast';

export function SafetySettings() {
  const { toast } = useToast();
  const [killSwitch, setKillSwitch] = useState(isFeatureEnabled('autoWriteKillSwitch'));
  const [confidenceThreshold, setConfidenceThreshold] = useState(80);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('08:00');
  const [twoSignalRule, setTwoSignalRule] = useState(true);

  const autoWriteFlags: { flag: FeatureFlag; label: string; description: string; icon: React.ReactNode }[] = [
    {
      flag: 'autoWriteCalendar',
      label: 'Calendar Auto-Write',
      description: 'Automatically create calendar events from detected scheduling intent',
      icon: <Calendar className="h-4 w-4" />
    },
    {
      flag: 'autoWriteEmail',
      label: 'Email Drafts',
      description: 'Create email drafts from conversation context (never auto-send)',
      icon: <Mail className="h-4 w-4" />
    },
    {
      flag: 'autoFinanceRead',
      label: 'Financial Data Access',
      description: 'Read financial transaction data for insights and patterns',
      icon: <DollarSign className="h-4 w-4" />
    },
    {
      flag: 'autoFinanceInsights',
      label: 'Financial Insights',
      description: 'Generate spending insights and budget suggestions',
      icon: <DollarSign className="h-4 w-4" />
    },
    {
      flag: 'contextEngine',
      label: 'Context Engine',
      description: 'Use patterns and signals to provide intelligent suggestions',
      icon: <Brain className="h-4 w-4" />
    }
  ];

  const handleKillSwitchToggle = (enabled: boolean) => {
    toggleFeatureFlag('autoWriteKillSwitch', enabled);
    setKillSwitch(enabled);
    
    toast({
      title: enabled ? "Auto-Write Disabled" : "Auto-Write Enabled",
      description: enabled 
        ? "All auto-write features have been disabled immediately"
        : "Auto-write features can now be enabled individually",
      variant: enabled ? "destructive" : "default"
    });
  };

  const handleFeatureToggle = (flag: FeatureFlag, enabled: boolean) => {
    if (killSwitch && enabled) {
      toast({
        title: "Kill Switch Active",
        description: "Disable the kill switch first to enable individual features",
        variant: "destructive"
      });
      return;
    }

    toggleFeatureFlag(flag, enabled);
    toast({
      title: "Feature Updated",
      description: `${autoWriteFlags.find(f => f.flag === flag)?.label} is now ${enabled ? 'enabled' : 'disabled'}`,
    });
  };

  useEffect(() => {
    // Load settings from localStorage
    const threshold = localStorage.getItem('safety.confidenceThreshold');
    if (threshold) setConfidenceThreshold(parseInt(threshold));

    const quietEnabled = localStorage.getItem('safety.quietHoursEnabled');
    if (quietEnabled) setQuietHoursEnabled(quietEnabled === 'true');

    const start = localStorage.getItem('safety.quietStart');
    if (start) setQuietStart(start);

    const end = localStorage.getItem('safety.quietEnd');
    if (end) setQuietEnd(end);
  }, []);

  const saveConfidenceThreshold = (value: number[]) => {
    const threshold = value[0];
    setConfidenceThreshold(threshold);
    localStorage.setItem('safety.confidenceThreshold', threshold.toString());
  };

  const saveQuietHours = () => {
    localStorage.setItem('safety.quietHoursEnabled', quietHoursEnabled.toString());
    localStorage.setItem('safety.quietStart', quietStart);
    localStorage.setItem('safety.quietEnd', quietEnd);
    
    toast({
      title: "Quiet Hours Updated",
      description: quietHoursEnabled 
        ? `Set to ${quietStart} - ${quietEnd}` 
        : "Disabled"
    });
  };

  return (
    <div className="space-y-6">
      {/* Kill Switch */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Power className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Emergency Kill Switch</CardTitle>
          </div>
          <CardDescription>
            Immediately disable all auto-write features across the entire application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="kill-switch" className="text-base font-medium">
                Disable All Auto-Write Features
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, all automation is immediately stopped
              </p>
            </div>
            <Switch
              id="kill-switch"
              checked={killSwitch}
              onCheckedChange={handleKillSwitchToggle}
            />
          </div>
          {killSwitch && (
            <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive font-medium">
                All auto-write features are currently disabled
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Feature Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            <CardTitle>Auto-Write Features</CardTitle>
          </div>
          <CardDescription>
            Control which features can automatically take actions on your behalf
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {autoWriteFlags.map(({ flag, label, description, icon }) => {
            const isEnabled = isFeatureEnabled(flag);
            const isDisabledByKillSwitch = killSwitch && isEnabled;
            
            return (
              <div key={flag} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={flag} className="font-medium">
                        {label}
                      </Label>
                      {isDisabledByKillSwitch && (
                        <Badge variant="destructive" className="text-xs">
                          Disabled by Kill Switch
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {description}
                    </p>
                  </div>
                </div>
                <Switch
                  id={flag}
                  checked={isEnabled && !killSwitch}
                  onCheckedChange={(checked) => handleFeatureToggle(flag, checked)}
                  disabled={killSwitch}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Precision Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            <CardTitle>Precision Controls</CardTitle>
          </div>
          <CardDescription>
            Adjust how confident the system needs to be before taking actions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="confidence-slider">
                Confidence Threshold: {confidenceThreshold}%
              </Label>
              <Badge variant="outline">
                {confidenceThreshold >= 85 ? 'Auto-Write' : confidenceThreshold >= 60 ? 'Draft' : 'Suggest'}
              </Badge>
            </div>
            <Slider
              id="confidence-slider"
              min={40}
              max={95}
              step={5}
              value={[confidenceThreshold]}
              onValueChange={saveConfidenceThreshold}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>40% (Suggest Only)</span>
              <span>60% (Draft)</span>
              <span>85% (Auto-Write)</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="two-signal">Two-Signal Rule</Label>
                <p className="text-sm text-muted-foreground">
                  Require at least two corroborating signals before auto-writing
                </p>
              </div>
              <Switch
                id="two-signal"
                checked={twoSignalRule}
                onCheckedChange={setTwoSignalRule}
                disabled={true}
              />
            </div>
            <Badge variant="outline" className="text-xs">
              Locked ON for v1 - This ensures maximum safety
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <CardTitle>Quiet Hours</CardTitle>
          </div>
          <CardDescription>
            Disable all auto-write features during specified hours
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="quiet-hours">Enable Quiet Hours</Label>
            <Switch
              id="quiet-hours"
              checked={quietHoursEnabled}
              onCheckedChange={setQuietHoursEnabled}
            />
          </div>
          
          {quietHoursEnabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quiet-start">Start Time</Label>
                  <input
                    id="quiet-start"
                    type="time"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-md"
                  />
                </div>
                <div>
                  <Label htmlFor="quiet-end">End Time</Label>
                  <input
                    id="quiet-end"
                    type="time"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-md"
                  />
                </div>
              </div>
              <Button onClick={saveQuietHours} variant="outline" size="sm">
                Save Quiet Hours
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}