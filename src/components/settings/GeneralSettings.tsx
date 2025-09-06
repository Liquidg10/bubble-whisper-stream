import React, { useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Volume2, 
  Eye, 
  Smartphone, 
  Clock
} from 'lucide-react';
import { hapticsService } from '@/services/haptics';
import { ttsService } from '@/services/tts';
import { VoiceSettings } from '@/components/VoiceSettings';

export const GeneralSettings: React.FC = () => {
  const { settings, updateSettings } = useBubbleStore();
  const [testingTTS, setTestingTTS] = useState(false);

  const handleTestTTS = async () => {
    setTestingTTS(true);
    try {
      await ttsService.speak('This is a test of the AI text-to-speech system. How does it sound?', {
        tone: 'gentle'
      });
      hapticsService.success();
    } catch (error) {
      console.error('TTS test failed:', error);
      hapticsService.error();
    } finally {
      setTestingTTS(false);
    }
  };

  const handleTestHaptics = () => {
    hapticsService.tap();
  };

  return (
    <div className="space-y-6">
      {/* Accessibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Accessibility
          </CardTitle>
          <CardDescription>
            Customize the interface for your needs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="high-contrast">High Contrast</Label>
              <p className="text-sm text-muted-foreground">
                Increase contrast for better visibility
              </p>
            </div>
            <Switch
              id="high-contrast"
              checked={settings.highContrast}
              onCheckedChange={(checked) => 
                updateSettings({ highContrast: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="reduced-motion">Reduced Motion</Label>
              <p className="text-sm text-muted-foreground">
                Minimize animations and transitions
              </p>
            </div>
            <Switch
              id="reduced-motion"
              checked={settings.reducedMotion}
              onCheckedChange={(checked) => 
                updateSettings({ reducedMotion: checked })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Bubble Density: {settings.bubbleDensity}</Label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as const).map((density) => (
                <Button
                  key={density}
                  variant={settings.bubbleDensity === density ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateSettings({ bubbleDensity: density })}
                  className="flex-1 capitalize"
                >
                  {density}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Controls how many bubbles appear on the canvas
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Voice Settings */}
      <VoiceSettings />

      {/* Audio & Haptics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Audio & Haptics
          </CardTitle>
          <CardDescription>
            Voice playback and vibration settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="tts-enabled">Text-to-Speech</Label>
              <p className="text-sm text-muted-foreground">
                Read bubble content aloud with AI voices
              </p>
            </div>
            <Switch
              id="tts-enabled"
              checked={settings.ttsEnabled}
              onCheckedChange={(checked) => 
                updateSettings({ ttsEnabled: checked })
              }
            />
          </div>

          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestTTS}
              disabled={testingTTS || !settings.ttsEnabled}
              className="w-full"
            >
              <Volume2 className="h-4 w-4 mr-2" />
              {testingTTS ? 'Testing...' : 'Test AI Voice Playback'}
            </Button>
            {!ttsService.isAvailable() && (
              <p className="text-xs text-muted-foreground">
                Text-to-speech not available on this device
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Haptic Feedback</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestHaptics}
              className="w-full"
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Test Vibration
            </Button>
            {!hapticsService.isAvailable() && (
              <p className="text-xs text-muted-foreground">
                Haptic feedback not available on this device
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Quiet Hours
          </CardTitle>
          <CardDescription>
            Limit notifications during specific times
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quiet-start">Start Time</Label>
              <Input
                id="quiet-start"
                type="time"
                value={settings.quietHours?.start || '22:00'}
                onChange={(e) => 
                  updateSettings({ 
                    quietHours: { 
                      ...settings.quietHours, 
                      start: e.target.value,
                      end: settings.quietHours?.end || '08:00'
                    } 
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiet-end">End Time</Label>
              <Input
                id="quiet-end"
                type="time"
                value={settings.quietHours?.end || '08:00'}
                onChange={(e) => 
                  updateSettings({ 
                    quietHours: { 
                      start: settings.quietHours?.start || '22:00',
                      end: e.target.value
                    } 
                  })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            During quiet hours, only gentle reminders will be shown
          </p>
        </CardContent>
      </Card>
    </div>
  );
};