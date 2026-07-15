import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Brain, Shield, Trash2, Plus, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { isFeatureEnabled } from '@/config/flags';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

export interface CBTSettings {
  cbtAssistEnabled: boolean; // Global kill switch
  assistLevel: 'off' | 'subtle' | 'standard';
  privacyLayer: 'surface' | 'context' | 'deep';
  autoLogMode: 'ask' | 'off' | 'on';
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  topicExclusions: string[];
  neverInterveneOn: string[];
  isUnder18: boolean;
  showExplainability: boolean;
}

const DEFAULT_CBT_SETTINGS: CBTSettings = {
  cbtAssistEnabled: false,
  assistLevel: 'subtle',
  privacyLayer: 'context',
  autoLogMode: 'ask',
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
  },
  topicExclusions: ['finance', 'health'], // Pre-populate with sensitive topics
  neverInterveneOn: [],
  isUnder18: false,
  showExplainability: true,
};

export function ThoughtSupportSettings() {
  const { settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  const [cbtSettings, setCbtSettings] = useState<CBTSettings>(() => {
    const baseSettings = settings.cbtSettings || {};
    return {
      ...DEFAULT_CBT_SETTINGS,
      ...baseSettings
    };
  });
  const [newExclusion, setNewExclusion] = useState('');
  const [newNeverIntervene, setNewNeverIntervene] = useState('');

  // Check if CBT features are available
  const cbtAssistFlag = isFeatureEnabled('cbtAssist');
  const cbtSilentObserve = isFeatureEnabled('cbtSilentObserve');

  useEffect(() => {
    if (settings.cbtSettings) {
      // Ensure all properties are present with defaults
      const completeSettings = {
        ...DEFAULT_CBT_SETTINGS,
        ...settings.cbtSettings
      };
      setCbtSettings(completeSettings);
    }
  }, [settings.cbtSettings]);

  const handleSettingChange = (key: keyof CBTSettings, value: any) => {
    let newSettings = { ...cbtSettings, [key]: value };
    
    // Age gate logic: if under 18, force stricter defaults
    if (key === 'isUnder18' && value === true) {
      newSettings = {
        ...newSettings,
        autoLogMode: 'off',
        privacyLayer: 'deep'
      };
    }
    
    setCbtSettings(newSettings);
    updateSettings({ cbtSettings: newSettings });
  };

  const handleQuietHoursChange = (key: keyof CBTSettings['quietHours'], value: any) => {
    const newSettings = {
      ...cbtSettings,
      quietHours: { ...cbtSettings.quietHours, [key]: value }
    };
    setCbtSettings(newSettings);
    updateSettings({ cbtSettings: newSettings });
  };

  const addTopicExclusion = () => {
    if (newExclusion.trim()) {
      const newSettings = {
        ...cbtSettings,
        topicExclusions: [...cbtSettings.topicExclusions, newExclusion.trim()]
      };
      setCbtSettings(newSettings);
      updateSettings({ cbtSettings: newSettings });
      setNewExclusion('');
    }
  };

  const removeTopicExclusion = (index: number) => {
    const newSettings = {
      ...cbtSettings,
      topicExclusions: cbtSettings.topicExclusions.filter((_, i) => i !== index)
    };
    setCbtSettings(newSettings);
    updateSettings({ cbtSettings: newSettings });
  };

  const addNeverIntervene = () => {
    if (newNeverIntervene.trim()) {
      const newSettings = {
        ...cbtSettings,
        neverInterveneOn: [...cbtSettings.neverInterveneOn, newNeverIntervene.trim()]
      };
      setCbtSettings(newSettings);
      updateSettings({ cbtSettings: newSettings });
      setNewNeverIntervene('');
    }
  };

  const removeNeverIntervene = (index: number) => {
    const newSettings = {
      ...cbtSettings,
      neverInterveneOn: cbtSettings.neverInterveneOn.filter((_, i) => i !== index)
    };
    setCbtSettings(newSettings);
    updateSettings({ cbtSettings: newSettings });
  };

  const handleDeleteAllCBTData = async () => {
    if (confirm('This will permanently delete all CBT data and cannot be undone. Continue?')) {
      try {
        // Clear CBT settings
        const resetSettings = { ...DEFAULT_CBT_SETTINGS, cbtAssistEnabled: false };
        setCbtSettings(resetSettings);
        updateSettings({ cbtSettings: resetSettings });

        // Clear CBT entries from storage
        if (typeof window !== 'undefined' && window.indexedDB) {
          const request = indexedDB.deleteDatabase('cbt-entries');
          request.onsuccess = () => {
            toast({
              title: "CBT Data Deleted",
              description: "All thought support data has been permanently removed.",
            });
          };
        }

        // Clear any CBT-related localStorage
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('cbt-') || key.includes('thought-support')) {
            localStorage.removeItem(key);
          }
        });

      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete CBT data. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // If CBT features are not enabled, show disabled state
  if (!cbtAssistFlag && !cbtSilentObserve) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Thought Support
          </CardTitle>
          <CardDescription>
            Intelligent support for processing thoughts and emotions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Thought Support features are currently disabled. Enable them in developer settings to access these options.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Toggle & Kill Switch */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Thought Support
            {cbtSettings.cbtAssistEnabled && (
              <Badge variant="outline" className="text-xs">Active</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Intelligent support for processing thoughts and emotions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="cbt-master-toggle" className="text-sm font-medium">
                Enable Thought Support
              </Label>
              <p className="text-xs text-muted-foreground">
                Master switch for all thought support features
              </p>
            </div>
            <Switch
              id="cbt-master-toggle"
              checked={cbtSettings.cbtAssistEnabled}
              onCheckedChange={(checked) => handleSettingChange('cbtAssistEnabled', checked)}
            />
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Important:</strong> This is not therapy or medical advice. 
              For mental health support, please consult with qualified professionals.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Detailed Settings - Only show if master toggle is enabled */}
      {cbtSettings.cbtAssistEnabled && (
        <>
          {/* Assist Level */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assistance Level</CardTitle>
              <CardDescription>
                How actively should the app provide thought support?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={cbtSettings.assistLevel}
                onValueChange={(value: 'off' | 'subtle' | 'standard') => 
                  handleSettingChange('assistLevel', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off - No automatic support</SelectItem>
                  <SelectItem value="subtle">Subtle - Gentle, natural guidance</SelectItem>
                  <SelectItem value="standard">Standard - More active support</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Privacy Layer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Privacy Level</CardTitle>
              <CardDescription>
                How much context should be used for personalization?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={cbtSettings.privacyLayer}
                onValueChange={(value: 'surface' | 'context' | 'deep') => 
                  handleSettingChange('privacyLayer', value)
                }
                disabled={cbtSettings.isUnder18}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="surface">Surface - Basic patterns only</SelectItem>
                  <SelectItem value="context">Context - Include conversation history</SelectItem>
                  <SelectItem value="deep">Deep - Full personalization (more data)</SelectItem>
                </SelectContent>
              </Select>
              {cbtSettings.isUnder18 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Privacy layer is locked to "Deep" for users under 18
                </p>
              )}
            </CardContent>
          </Card>

          {/* Age Gate */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Age Verification</CardTitle>
              <CardDescription>
                Age-appropriate privacy and safety settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="under-18-toggle" className="text-sm font-medium">
                    I am under 18 years old
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically applies stricter privacy and logging settings
                  </p>
                </div>
                <Switch
                  id="under-18-toggle"
                  checked={cbtSettings.isUnder18}
                  onCheckedChange={(checked) => handleSettingChange('isUnder18', checked)}
                />
              </div>
              {cbtSettings.isUnder18 && (
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Enhanced Privacy Mode:</strong> Auto-logging disabled, deep privacy layer active. 
                    Remember: This is not medical advice. Talk to a trusted adult, counselor, or healthcare provider for support.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Auto-Log Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reflection Logging</CardTitle>
              <CardDescription>
                How should thought reflections be saved?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={cbtSettings.autoLogMode}
                onValueChange={(value: 'ask' | 'off' | 'on') => 
                  handleSettingChange('autoLogMode', value)
                }
                disabled={cbtSettings.isUnder18}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ask">Ask - Prompt before saving (not yet built; currently behaves like Off)</SelectItem>
                  <SelectItem value="off">Off - Never auto-save</SelectItem>
                  <SelectItem value="on">On - Auto-save all reflections</SelectItem>
                </SelectContent>
              </Select>
              {cbtSettings.isUnder18 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Auto-logging is disabled for users under 18 for enhanced privacy
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quiet Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quiet Hours</CardTitle>
              <CardDescription>
                Times when thought support should be less active
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="quiet-hours-toggle">Enable quiet hours</Label>
                <Switch
                  id="quiet-hours-toggle"
                  checked={cbtSettings.quietHours.enabled}
                  onCheckedChange={(checked) => handleQuietHoursChange('enabled', checked)}
                />
              </div>
              {cbtSettings.quietHours.enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="quiet-start" className="text-sm">Start time</Label>
                    <Input
                      id="quiet-start"
                      type="time"
                      value={cbtSettings.quietHours.start}
                      onChange={(e) => handleQuietHoursChange('start', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="quiet-end" className="text-sm">End time</Label>
                    <Input
                      id="quiet-end"
                      type="time"
                      value={cbtSettings.quietHours.end}
                      onChange={(e) => handleQuietHoursChange('end', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Explainability Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Explainability</CardTitle>
              <CardDescription>
                Control how much detail is shown about why support is offered
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="explainability-toggle" className="text-sm font-medium">
                    Show "Why?" badge
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Display explanations for why thought support was triggered
                  </p>
                </div>
                <Switch
                  id="explainability-toggle"
                  checked={cbtSettings.showExplainability}
                  onCheckedChange={(checked) => handleSettingChange('showExplainability', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Topic Exclusions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Topic Exclusions</CardTitle>
              <CardDescription>
                Topics where thought support should not activate (Finance & Health pre-selected for safety)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Finance and Health topics are excluded by default to avoid sensitive false-positives. 
                  You can remove these if you'd like support on these topics.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Input
                  placeholder="Add topic to exclude..."
                  value={newExclusion}
                  onChange={(e) => setNewExclusion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addTopicExclusion()}
                />
                <Button size="sm" onClick={addTopicExclusion}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {cbtSettings.topicExclusions.map((topic, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {topic}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-auto w-auto p-0 ml-1"
                      onClick={() => removeTopicExclusion(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Never Intervene List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Never Intervene On</CardTitle>
              <CardDescription>
                Specific phrases that should never trigger support
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add phrase to never intervene on..."
                  value={newNeverIntervene}
                  onChange={(e) => setNewNeverIntervene(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addNeverIntervene()}
                />
                <Button size="sm" onClick={addNeverIntervene}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {cbtSettings.neverInterveneOn.map((phrase, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {phrase}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-auto w-auto p-0 ml-1"
                      onClick={() => removeNeverIntervene(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Delete All Data */}
          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions that permanently delete data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={handleDeleteAllCBTData}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All CBT Traces (Irreversible)
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}