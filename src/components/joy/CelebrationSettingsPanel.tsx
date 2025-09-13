/**
 * Celebration Settings Panel - User controls for joy system
 * "Less of this" toggles and celebration frequency controls
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Volume2, VolumeX, Clock, BarChart3 } from 'lucide-react';
import { useCelebrationSettings } from './MicroCelebrationEngine';
import type { GlimmerTone } from '@/types/glimmer';

const TONE_DESCRIPTIONS: Record<GlimmerTone, string> = {
  'Friend': 'Warm, personal encouragement',
  'Coach': 'Motivating, progress-focused',
  'Scientist': 'Analytical, pattern-based',
  'Future You': 'Aspirational, vision-focused',
  'friend': 'Warm, personal encouragement',
  'coach': 'Motivating, progress-focused', 
  'scientist': 'Analytical, pattern-based',
  'future-you': 'Aspirational, vision-focused'
};

const FREQUENCY_DESCRIPTIONS = {
  minimal: 'Only major milestones',
  balanced: 'Natural celebration rhythm',
  enthusiastic: 'Every little win counts'
};

export const CelebrationSettingsPanel: React.FC = () => {
  const { settings, updateSettings, getDailyStats } = useCelebrationSettings();
  const dailyStats = getDailyStats();

  const handleToneToggle = (tone: GlimmerTone, enabled: boolean) => {
    updateSettings({
      tones: {
        ...settings.tones,
        [tone]: enabled
      }
    });
  };

  const handleFrequencyChange = (frequency: string) => {
    const maxPerDay = frequency === 'minimal' ? 2 : frequency === 'balanced' ? 5 : 8;
    updateSettings({
      frequency: frequency as any,
      maxPerDay
    });
  };

  const handleQuietHoursToggle = (enabled: boolean) => {
    if (enabled) {
      updateSettings({
        quietHours: { start: '22:00', end: '08:00' }
      });
    } else {
      updateSettings({
        quietHours: null
      });
    }
  };

  const resetDailyStats = () => {
    const today = new Date().toDateString();
    localStorage.removeItem(`celebrations_${today}`);
    window.location.reload(); // Simple refresh to update stats
  };

  const enabledTones = Object.entries(settings.tones).filter(([_, enabled]) => enabled);

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Micro-Celebrations</CardTitle>
                <CardDescription>
                  Gentle recognition of your progress and effort
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(enabled) => updateSettings({ enabled })}
            />
          </div>
        </CardHeader>
        
        {settings.enabled && (
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Today's celebrations</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {dailyStats.todayCount} / {dailyStats.maxPerDay}
                </Badge>
                {dailyStats.remaining > 0 && (
                  <span className="text-primary">{dailyStats.remaining} remaining</span>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{enabledTones.length}</div>
                <div className="text-xs text-muted-foreground">Active tones</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{settings.frequency}</div>
                <div className="text-xs text-muted-foreground">Frequency</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {settings.quietHours ? '🌙' : '⏰'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {settings.quietHours ? 'Quiet hours' : 'Always on'}
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {settings.enabled && (
        <>
          {/* Celebration Frequency */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Celebration Frequency
              </CardTitle>
              <CardDescription>
                How often would you like to be celebrated?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={settings.frequency} onValueChange={handleFrequencyChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_DESCRIPTIONS).map(([freq, desc]) => (
                    <SelectItem key={freq} value={freq}>
                      <div>
                        <div className="font-medium capitalize">{freq}</div>
                        <div className="text-sm text-muted-foreground">{desc}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Celebration Tones */}
          <Card>
            <CardHeader>
              <CardTitle>Celebration Tones</CardTitle>
              <CardDescription>
                Choose which voices you'd like to hear from. You can mute any tone anytime.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(TONE_DESCRIPTIONS).map(([tone, description]) => (
                <div key={tone} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {settings.tones[tone as GlimmerTone] ? (
                      <Volume2 className="h-4 w-4 text-primary" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <div className="font-medium">{tone}</div>
                      <div className="text-sm text-muted-foreground">{description}</div>
                    </div>
                  </div>
                  <Switch
                    checked={settings.tones[tone as GlimmerTone]}
                    onCheckedChange={(enabled) => handleToneToggle(tone as GlimmerTone, enabled)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quiet Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Quiet Hours
              </CardTitle>
              <CardDescription>
                Pause celebrations during your rest time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {settings.quietHours ? '10:00 PM - 8:00 AM' : 'Disabled'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {settings.quietHours 
                      ? 'No celebrations during these hours'
                      : 'Celebrations can happen anytime'
                    }
                  </div>
                </div>
                <Switch
                  checked={!!settings.quietHours}
                  onCheckedChange={handleQuietHoursToggle}
                />
              </div>
            </CardContent>
          </Card>

          {/* Reset & Debug */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Reset</CardTitle>
              <CardDescription>
                Reset today's celebration count for testing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                variant="outline" 
                onClick={resetDailyStats}
                className="w-full"
              >
                Reset Today's Count
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};