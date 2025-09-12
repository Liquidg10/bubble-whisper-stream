import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useMicroCelebrations } from '@/hooks/useMicroCelebrations';
import type { GlimmerTone } from '@/types/glimmer';
import { Sparkles, Heart, Brain, Rocket } from 'lucide-react';

const TONE_CONFIG = {
  Friend: { icon: Heart, label: 'Supportive', description: 'Warm and supportive' },
  Coach: { icon: Rocket, label: 'Motivational', description: 'Energizing and encouraging' },
  Scientist: { icon: Brain, label: 'Analytical', description: 'Data-driven and precise' },
  'Future You': { icon: Sparkles, label: 'Inspiring', description: 'Wise and aspirational' }
} as const;

export function CelebrationSettings() {
  const { 
    getSettings, 
    updateSettings, 
    muteTone, 
    unmuteTone, 
    getDailyStats 
  } = useMicroCelebrations();
  
  const settings = getSettings();
  const dailyStats = getDailyStats();

  const handleToggleTone = (tone: GlimmerTone, enabled: boolean) => {
    if (enabled) {
      unmuteTone(tone);
    } else {
      muteTone(tone);
    }
  };

  const handleDailyLimitChange = (value: number[]) => {
    updateSettings({ dailyLimit: value[0] });
  };

  const handleThresholdChange = (value: number[]) => {
    updateSettings({ minimumMomentumThreshold: value[0] / 100 });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Micro-Celebrations</CardTitle>
        </div>
        <CardDescription>
          Brief, optional toasts after momentum bursts (max {settings.dailyLimit}/day)
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Today: {dailyStats.shown}/{dailyStats.limit}
            </Badge>
            {dailyStats.remaining > 0 && (
              <Badge variant="outline" className="text-xs">
                {dailyStats.remaining} remaining
              </Badge>
            )}
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable micro-celebrations</Label>
            <p className="text-sm text-muted-foreground">
              Show brief celebration toasts for momentum bursts
            </p>
          </div>
          <Switch 
            checked={settings.enabled}
            onCheckedChange={(enabled) => updateSettings({ enabled })}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Daily Limit */}
            <div className="space-y-3">
              <Label>Daily celebration limit</Label>
              <div className="space-y-2">
                <Slider
                  value={[settings.dailyLimit]}
                  onValueChange={handleDailyLimitChange}
                  max={3}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Off</span>
                  <span>1 per day</span>
                  <span>2 per day</span>
                  <span>3 per day</span>
                </div>
              </div>
            </div>

            {/* Momentum Threshold */}
            <div className="space-y-3">
              <Label>Momentum sensitivity</Label>
              <div className="space-y-2">
                <Slider
                  value={[settings.minimumMomentumThreshold * 100]}
                  onValueChange={handleThresholdChange}
                  max={100}
                  min={50}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>More sensitive</span>
                  <span>Balanced</span>
                  <span>Less sensitive</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Higher sensitivity means celebrations for smaller accomplishments
              </p>
            </div>

            {/* Tone Preferences */}
            <div className="space-y-3">
              <Label>Celebration tones</Label>
              <p className="text-sm text-muted-foreground">
                Choose which tone styles you'd like to receive
              </p>
              <div className="grid grid-cols-1 gap-3">
                {(Object.keys(TONE_CONFIG) as GlimmerTone[]).map(tone => {
                  const config = TONE_CONFIG[tone];
                  const Icon = config.icon;
                  const isEnabled = !settings.mutedTones.includes(tone);
                  
                  return (
                    <div key={tone} className="flex items-center space-x-3 p-3 rounded-lg bg-muted/50">
                      <Checkbox 
                        checked={isEnabled}
                        onCheckedChange={(checked) => handleToggleTone(tone, !!checked)}
                      />
                      <Icon className="h-4 w-4 text-primary" />
                      <div className="flex-1 space-y-1">
                        <div className="font-medium text-sm">{config.label}</div>
                        <div className="text-xs text-muted-foreground">{config.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quiet Hours */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Respect quiet hours</Label>
                <p className="text-sm text-muted-foreground">
                  No celebrations between 11 PM - 7 AM
                </p>
              </div>
              <Switch 
                checked={settings.quietHoursRespected}
                onCheckedChange={(quietHoursRespected) => updateSettings({ quietHoursRespected })}
              />
            </div>
          </>
        )}

        {/* Info */}
        <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/30 rounded-lg">
          <p>• Celebrations are brief (&lt;90 characters) and dismissible</p>
          <p>• 2-hour cooldown between celebrations of the same tone</p>
          <p>• "Less of this" button mutes that specific tone</p>
          <p>• Only triggered by genuine momentum bursts</p>
        </div>
      </CardContent>
    </Card>
  );
}