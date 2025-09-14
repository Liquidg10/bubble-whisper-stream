/**
 * P15 - Celebration Settings Panel
 * User controls for micro-celebration preferences
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart, Volume2, VolumeX, BarChart3 } from 'lucide-react';
import { useMicroCelebrations } from '@/hooks/useMicroCelebrations';
import type { GlimmerTone } from '@/types/glimmer';

const TONE_COLORS = {
  'Friend': 'bg-orange-100 text-orange-800 border-orange-200',
  'Coach': 'bg-blue-100 text-blue-800 border-blue-200',
  'Scientist': 'bg-green-100 text-green-800 border-green-200',
  'Future You': 'bg-purple-100 text-purple-800 border-purple-200'
} as const;

export function CelebrationSettingsPanel() {
  const {
    getSettings,
    updateSettings,
    muteTone,
    unmuteTone,
    getDailyStats
  } = useMicroCelebrations();

  const settings = getSettings();
  const stats = getDailyStats();

  const handleToggleEnabled = (enabled: boolean) => {
    updateSettings({ enabled });
  };

  const handleDailyLimitChange = (value: number[]) => {
    updateSettings({ dailyLimit: value[0] });
  };

  const handleToggleTone = (tone: GlimmerTone, muted: boolean) => {
    if (muted) {
      muteTone(tone);
    } else {
      unmuteTone(tone);
    }
  };

  const tones: GlimmerTone[] = ['supportive', 'motivational', 'analytical', 'inspiring'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary" />
          Celebration Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Micro-celebrations</p>
            <p className="text-xs text-muted-foreground">
              Brief encouraging messages when you make progress
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={handleToggleEnabled}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Daily Limit Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Daily limit</p>
                <Badge variant="outline" className="text-xs">
                  {settings.dailyLimit} per day
                </Badge>
              </div>
              <Slider
                value={[settings.dailyLimit]}
                onValueChange={handleDailyLimitChange}
                max={5}
                min={0}
                step={1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Maximum celebrations you'll see each day (0 = unlimited)
              </p>
            </div>

            {/* Tone Controls */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Celebration tones</p>
              <div className="grid grid-cols-2 gap-2">
                {tones.map((tone) => {
                  const isMuted = settings.mutedTones.includes(tone);
                  return (
                    <Button
                      key={tone}
                      variant={isMuted ? "outline" : "secondary"}
                      size="sm"
                      onClick={() => handleToggleTone(tone, !isMuted)}
                      className="justify-between h-auto p-3"
                    >
                      <div className="flex items-center gap-2">
                        {isMuted ? (
                          <VolumeX className="h-3 w-3" />
                        ) : (
                          <Volume2 className="h-3 w-3" />
                        )}
                        <span className="text-xs">{tone}</span>
                      </div>
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Choose which celebration styles you'd like to see
              </p>
            </div>

            {/* Usage Statistics */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Today's celebrations</p>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm">{stats.shown} of {stats.limit || '∞'}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.remaining > 0 
                      ? `${stats.remaining} remaining`
                      : stats.limit 
                        ? 'Daily limit reached'
                        : 'No limit set'
                    }
                  </p>
                </div>
                {stats.limit > 0 && (
                  <div className="w-16 h-2 bg-background rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(stats.shown / stats.limit) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Quiet Hours */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Quiet hours</p>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm">10:00 PM - 8:00 AM</p>
                  <p className="text-xs text-muted-foreground">
                    No celebrations during these hours
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Active
                </Badge>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}