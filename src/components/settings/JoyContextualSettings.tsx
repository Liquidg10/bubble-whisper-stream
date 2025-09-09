import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Heart, 
  MapPin, 
  Calendar, 
  Mail, 
  Camera, 
  Clock, 
  Shield, 
  Car,
  Moon,
  Zap,
  Settings
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface JoyContextualSettingsProps {
  className?: string;
}

interface JoySettings {
  enabled: boolean;
  sources: {
    calendar: boolean;
    email: boolean;
    location: boolean;
    conversation: boolean;
  };
  nudging: {
    enabled: boolean;
    frequency: 'low' | 'medium' | 'high';
    photoNudges: boolean;
    quietHours: {
      enabled: boolean;
      start: string;
      end: string;
    };
  };
  safety: {
    vehicleDetection: boolean;
    unsafeLocations: boolean;
    respectLocation: boolean;
  };
  patterns: {
    celebrations: boolean;
    milestones: boolean;
    experiences: boolean;
    memories: boolean;
    accomplishments: boolean;
  };
}

const defaultSettings: JoySettings = {
  enabled: true,
  sources: {
    calendar: true,
    email: true,
    location: true,
    conversation: true
  },
  nudging: {
    enabled: true,
    frequency: 'medium',
    photoNudges: true,
    quietHours: {
      enabled: true,
      start: '22:00',
      end: '07:00'
    }
  },
  safety: {
    vehicleDetection: true,
    unsafeLocations: true,
    respectLocation: true
  },
  patterns: {
    celebrations: true,
    milestones: true,
    experiences: true,
    memories: true,
    accomplishments: true
  }
};

export const JoyContextualSettings: React.FC<JoyContextualSettingsProps> = ({ 
  className = "" 
}) => {
  const [settings, setSettings] = useState<JoySettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    try {
      const stored = localStorage.getItem('joy_contextual_settings');
      if (stored) {
        const loadedSettings = { ...defaultSettings, ...JSON.parse(stored) };
        setSettings(loadedSettings);
      }
    } catch (error) {
      console.warn('Failed to load joy contextual settings:', error);
    }
  };

  const saveSettings = () => {
    try {
      localStorage.setItem('joy_contextual_settings', JSON.stringify(settings));
      setHasChanges(false);
      toast({
        title: "Settings saved",
        description: "Joy contextual intelligence settings have been updated.",
        duration: 3000,
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: "Save failed",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const updateSettings = (updates: Partial<JoySettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const updateNestedSettings = (section: keyof JoySettings, updates: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...(prev[section] as any), ...updates }
    }));
    setHasChanges(true);
  };

  const getFrequencyDescription = (frequency: string) => {
    switch (frequency) {
      case 'low': return 'Minimal nudges, only for high-confidence joy moments';
      case 'medium': return 'Balanced nudging for good joy opportunities';
      case 'high': return 'Active nudging for all detected joy moments';
      default: return '';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            Joy Contextual Intelligence
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure how the system detects and suggests joy moments based on your calendar, location, and activities.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="joy-enabled" className="text-sm font-medium">
                Enable Joy Intelligence
              </Label>
              <p className="text-xs text-muted-foreground">
                Detect and suggest joy moments from your activities
              </p>
            </div>
            <Switch
              id="joy-enabled"
              checked={settings.enabled}
              onCheckedChange={(enabled) => updateSettings({ enabled })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Sources */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Joy Detection Sources
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose which data sources to analyze for joy moments
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                <Label className="text-sm">Calendar Events</Label>
              </div>
              <Switch
                checked={settings.sources.calendar}
                onCheckedChange={(calendar) => 
                  updateNestedSettings('sources', { calendar })
                }
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-green-500" />
                <Label className="text-sm">Email Intents</Label>
              </div>
              <Switch
                checked={settings.sources.email}
                onCheckedChange={(email) => 
                  updateNestedSettings('sources', { email })
                }
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-red-500" />
                <Label className="text-sm">Location Context</Label>
              </div>
              <Switch
                checked={settings.sources.location}
                onCheckedChange={(location) => 
                  updateNestedSettings('sources', { location })
                }
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-pink-500" />
                <Label className="text-sm">Conversations</Label>
              </div>
              <Switch
                checked={settings.sources.conversation}
                onCheckedChange={(conversation) => 
                  updateNestedSettings('sources', { conversation })
                }
                disabled={!settings.enabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Joy Patterns */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Joy Pattern Detection
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Types of joy moments to detect and highlight
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(settings.patterns).map(([pattern, enabled]) => (
              <div key={pattern} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {pattern}
                  </Badge>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(value) => 
                    updateNestedSettings('patterns', { [pattern]: value })
                  }
                  disabled={!settings.enabled}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Nudging Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" />
            Smart Nudging
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Control when and how often to receive joy moment suggestions
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable Nudging</Label>
              <p className="text-xs text-muted-foreground">
                Receive suggestions to capture or reflect on joy moments
              </p>
            </div>
            <Switch
              checked={settings.nudging.enabled}
              onCheckedChange={(enabled) => 
                updateNestedSettings('nudging', { enabled })
              }
              disabled={!settings.enabled}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Nudge Frequency</Label>
            <Select
              value={settings.nudging.frequency}
              onValueChange={(frequency) => 
                updateNestedSettings('nudging', { frequency })
              }
              disabled={!settings.enabled || !settings.nudging.enabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {getFrequencyDescription(settings.nudging.frequency)}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Photo Nudges</Label>
              <p className="text-xs text-muted-foreground">
                Suggest photo opportunities during joy moments
              </p>
            </div>
            <Switch
              checked={settings.nudging.photoNudges}
              onCheckedChange={(photoNudges) => 
                updateNestedSettings('nudging', { photoNudges })
              }
              disabled={!settings.enabled || !settings.nudging.enabled}
            />
          </div>

          {/* Quiet Hours */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4" />
                <Label className="text-sm font-medium">Quiet Hours</Label>
              </div>
              <Switch
                checked={settings.nudging.quietHours.enabled}
                onCheckedChange={(enabled) => 
                  updateNestedSettings('nudging', { 
                    quietHours: { ...settings.nudging.quietHours, enabled }
                  })
                }
                disabled={!settings.enabled || !settings.nudging.enabled}
              />
            </div>
            
            {settings.nudging.quietHours.enabled && (
              <div className="grid grid-cols-2 gap-4 ml-6">
                <div className="space-y-2">
                  <Label className="text-xs">Start Time</Label>
                  <input
                    type="time"
                    value={settings.nudging.quietHours.start}
                    onChange={(e) => 
                      updateNestedSettings('nudging', {
                        quietHours: { 
                          ...settings.nudging.quietHours, 
                          start: e.target.value 
                        }
                      })
                    }
                    className="w-full px-2 py-1 text-xs border rounded"
                    disabled={!settings.enabled || !settings.nudging.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">End Time</Label>
                  <input
                    type="time"
                    value={settings.nudging.quietHours.end}
                    onChange={(e) => 
                      updateNestedSettings('nudging', {
                        quietHours: { 
                          ...settings.nudging.quietHours, 
                          end: e.target.value 
                        }
                      })
                    }
                    className="w-full px-2 py-1 text-xs border rounded"
                    disabled={!settings.enabled || !settings.nudging.enabled}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Safety Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Safety & Context Awareness
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Prevent inappropriate nudging based on safety and context
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Vehicle Detection</Label>
                <p className="text-xs text-muted-foreground">
                  Don't nudge while moving in a vehicle
                </p>
              </div>
            </div>
            <Switch
              checked={settings.safety.vehicleDetection}
              onCheckedChange={(vehicleDetection) => 
                updateNestedSettings('safety', { vehicleDetection })
              }
              disabled={!settings.enabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Unsafe Location Filter</Label>
                <p className="text-xs text-muted-foreground">
                  Avoid nudging in hospitals, cemeteries, etc.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.safety.unsafeLocations}
              onCheckedChange={(unsafeLocations) => 
                updateNestedSettings('safety', { unsafeLocations })
              }
              disabled={!settings.enabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Respect Location Privacy</Label>
                <p className="text-xs text-muted-foreground">
                  Honor location-based privacy settings
                </p>
              </div>
            </div>
            <Switch
              checked={settings.safety.respectLocation}
              onCheckedChange={(respectLocation) => 
                updateNestedSettings('safety', { respectLocation })
              }
              disabled={!settings.enabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      {hasChanges && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-foreground">
                You have unsaved changes to your joy settings.
              </p>
              <Button onClick={saveSettings}>
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};