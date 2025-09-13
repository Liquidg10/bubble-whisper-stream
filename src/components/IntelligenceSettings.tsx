import React from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, 
  Sparkles, 
  Shield, 
  AlertTriangle,
  Heart,
  Lightbulb
} from 'lucide-react';
import { consentService } from '@/services/consentService';
import { CelebrationSettings } from '@/components/CelebrationSettings';

export const IntelligenceSettings: React.FC = () => {
  const { 
    settings, 
    updateSettings, 
    cbtEntries,
    glimmers,
    patternHints
  } = useBubbleStore();

  const handleConsentToggle = async (feature: string, enabled: boolean) => {
    if (enabled) {
      await consentService.grantConsent(feature);
    } else {
      await consentService.revokeConsent(feature);
    }
  };

  return (
    <div className="space-y-6">
      {/* Master Intelligence Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Intelligence Layer
            <Badge variant="secondary">Phase 2</Badge>
          </CardTitle>
          <CardDescription>
            Add gentle, explainable intelligence to your Bubble Universe
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="intelligence-enabled">Enable Intelligence Features</Label>
              <p className="text-sm text-muted-foreground">
                Turn on CBT support, glimmers, and adaptive reminders
              </p>
            </div>
            <Switch
              id="intelligence-enabled"
              checked={settings.intelligenceEnabled || false}
              onCheckedChange={(checked) => updateSettings({ intelligenceEnabled: checked })}
            />
          </div>

          {settings.intelligenceEnabled && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span>All intelligence features remain local-first and explainable</span>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{cbtEntries.length}</div>
                    <div className="text-xs text-muted-foreground">CBT Entries</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{glimmers.length}</div>
                    <div className="text-xs text-muted-foreground">Glimmers</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{patternHints.length}</div>
                    <div className="text-xs text-muted-foreground">Patterns</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {settings.intelligenceEnabled && (
        <>
          {/* CBT Thought Check */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                CBT Thought Check
              </CardTitle>
              <CardDescription>
                Guided journaling to challenge spirals (not therapy)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>CBT Support</Label>
                  <p className="text-sm text-muted-foreground">
                    Ready when you are - never forced or judgemental
                  </p>
                </div>
                <Badge variant="outline">Always Available</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Self-Compassion Glimmers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Self-Compassion Glimmers
              </CardTitle>
              <CardDescription>
                Brief, kind nudges in text/TTS when you need encouragement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="glimmers-enabled">Enable Glimmers</Label>
                  <p className="text-sm text-muted-foreground">
                    Respectful encouragement based on patterns
                  </p>
                </div>
                <Switch
                  id="glimmers-enabled"
                  checked={settings.glimmersEnabled || false}
                  onCheckedChange={(checked) => {
                    updateSettings({ glimmersEnabled: checked });
                    handleConsentToggle('glimmers', checked);
                  }}
                />
              </div>
              
              {settings.glimmersEnabled && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Respects your quiet hours ({settings.quietHours?.start} - {settings.quietHours?.end})</p>
                  <p>• Maximum 3 glimmers per day</p>
                  <p>• Always dismissible, never intrusive</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Adaptive Reminders 2.0 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Adaptive Reminders 2.0
              </CardTitle>
              <CardDescription>
                Learns from your snooze patterns to reduce notification fatigue
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="adaptive-reminders">Enable Adaptive Learning</Label>
                  <p className="text-sm text-muted-foreground">
                    Shows "Because..." explanations for timing changes
                  </p>
                </div>
                <Switch
                  id="adaptive-reminders"
                  checked={settings.adaptiveReminders || false}
                  onCheckedChange={(checked) => {
                    updateSettings({ adaptiveReminders: checked });
                    handleConsentToggle('adaptive_reminders', checked);
                  }}
                />
              </div>
              
              {settings.adaptiveReminders && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Learns from snooze reasons like "Overwhelmed" or "With Pepper"</p>
                  <p>• Adjusts timing and escalation levels</p>
                  <p>• Always explainable - you'll see why changes are made</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Location Intelligence */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Location Intelligence
              </CardTitle>
              <CardDescription>
                Learn from your location patterns to provide contextual insights
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="location-intelligence">Enable Location Learning</Label>
                  <p className="text-sm text-muted-foreground">
                    Analyzes location patterns for personalized suggestions
                  </p>
                </div>
                <Switch
                  id="location-intelligence"
                  checked={settings.locationIntelligenceEnabled || false}
                  onCheckedChange={async (checked) => {
                    if (checked) {
                      // Request location permission first
                      const { locationService } = await import('@/services/locationService');
                      const hasPermission = await locationService.requestLocationPermission();
                      if (hasPermission) {
                        updateSettings({ locationIntelligenceEnabled: checked });
                        handleConsentToggle('location_intelligence', checked);
                        
                        // Start the location intelligence service
                        const { locationIntelligenceService } = await import('@/services/locationIntelligenceService');
                        locationIntelligenceService.startTracking();
                      }
                    } else {
                      updateSettings({ locationIntelligenceEnabled: checked });
                      handleConsentToggle('location_intelligence', checked);
                      
                      // Stop tracking and optionally clear data
                      const { locationIntelligenceService } = await import('@/services/locationIntelligenceService');
                      locationIntelligenceService.stopTracking();
                    }
                  }}
                />
              </div>
              
              {settings.locationIntelligenceEnabled && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Learns from places you visit frequently</p>
                  <p>• Provides location-based tool suggestions</p>
                  <p>• All data stays on your device</p>
                  <p>• Can be disabled anytime with data cleared</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Micro-Celebrations */}
          <CelebrationSettings />

          {/* Privacy Notice */}
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="space-y-2">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">
                    Privacy & Transparency
                  </h4>
                  <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                    <p>• All intelligence features remain 100% local to your device</p>
                    <p>• No data is sent to external services or AI companies</p>
                    <p>• Every adaptive decision shows a "Because..." explanation</p>
                    <p>• You can disable any feature at any time</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};