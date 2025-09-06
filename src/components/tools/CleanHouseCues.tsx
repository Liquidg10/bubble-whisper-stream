import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Home, 
  Clock, 
  AlertCircle,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Vibrate,
  Palette
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { SessionCelebration } from '@/components/SessionCelebration';
import { hapticsService } from '@/services/haptics';

export function CleanHouseCues() {
  const { settings, updateSettings } = useBubbleStore();
  const [showCelebration, setShowCelebration] = useState(false);
  const { toast } = useToast();

  // Get timer state from store
  const isEnabled = settings.cleaningCuesEnabled || false;
  const timerState = settings.cleanHouseTimer || {
    isActive: false,
    timeRemaining: 10 * 60,
    duration: 10 * 60,
    startTime: null
  };
  const customization = settings.cleanHouseCustomization || {
    duration: 10 * 60,
    celebrationSound: 'chime',
    celebrationMessage: 'Great job on your 10-minute reset! Every small step matters. 🎉',
    hapticEnabled: true,
    autoRestart: false
  };

  const gentlePrompts = [
    {
      text: "Ready for a gentle 10-minute reset? No pressure – just when you feel like it.",
      color: "border-l-blue-500"
    },
    {
      text: "Your space supports you best when it feels good. Care to do a quick tidy?",
      color: "border-l-green-500"
    },
    {
      text: "Small steps count. Even putting away one thing makes a difference.",
      color: "border-l-purple-500"
    },
    {
      text: "No judgment here – just a friendly reminder that your space can be a source of calm.",
      color: "border-l-orange-500"
    },
    {
      text: "Take it one corner at a time. Progress, not perfection.",
      color: "border-l-pink-500"
    }
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (timerState.isActive && timerState.startTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - timerState.startTime!) / 1000);
        const newTimeRemaining = Math.max(0, timerState.duration - elapsed);
        
        if (newTimeRemaining <= 0) {
          // Session complete
          updateSettings({
            cleanHouseTimer: {
              isActive: false,
              timeRemaining: customization.duration,
              duration: customization.duration,
              startTime: null
            }
          });
          setShowCelebration(true);
        } else if (newTimeRemaining !== timerState.timeRemaining) {
          // Update timer only if time has changed
          updateSettings({
            cleanHouseTimer: {
              ...timerState,
              timeRemaining: newTimeRemaining
            }
          });
        }
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [timerState.isActive, timerState.startTime, timerState.duration, customization.duration, updateSettings]);

  // Restore timer from localStorage on mount (backup persistence)
  useEffect(() => {
    const storedTimer = localStorage.getItem('cleanHouseTimer');
    if (storedTimer) {
      try {
        const parsed = JSON.parse(storedTimer);
        if (parsed.isActive && parsed.startTime) {
          const elapsed = Math.floor((Date.now() - parsed.startTime) / 1000);
          const remaining = Math.max(0, parsed.duration - elapsed);
          
          if (remaining > 0) {
            updateSettings({
              cleanHouseTimer: {
                ...parsed,
                timeRemaining: remaining
              }
            });
          } else {
            // Session would have completed
            localStorage.removeItem('cleanHouseTimer');
          }
        }
      } catch (error) {
        console.warn('Failed to restore timer state:', error);
        localStorage.removeItem('cleanHouseTimer');
      }
    }
  }, [updateSettings]);

  // Save to localStorage for backup persistence
  useEffect(() => {
    if (timerState.isActive) {
      localStorage.setItem('cleanHouseTimer', JSON.stringify(timerState));
    } else {
      localStorage.removeItem('cleanHouseTimer');
    }
  }, [timerState]);

  const handleToggleEnabled = (enabled: boolean) => {
    updateSettings({ cleaningCuesEnabled: enabled });
    if (enabled && hapticsService.isAvailable()) {
      hapticsService.gentle();
    }
  };

  const startSession = () => {
    const startTime = Date.now();
    console.log('🏠 Starting clean house session with duration:', customization.duration);
    updateSettings({
      cleanHouseTimer: {
        isActive: true,
        timeRemaining: customization.duration,
        duration: customization.duration,
        startTime
      }
    });
    console.log('🏠 Timer state updated:', { isActive: true, timeRemaining: customization.duration, startTime });
    toast({
      title: "Clean House Session Started",
      description: "Remember: progress, not perfection. You've got this!",
    });
    if (customization.hapticEnabled) {
      hapticsService.tap();
    }
  };

  const pauseSession = () => {
    updateSettings({
      cleanHouseTimer: {
        ...timerState,
        isActive: false,
        startTime: null
      }
    });
  };

  const resetSession = () => {
    updateSettings({
      cleanHouseTimer: {
        isActive: false,
        timeRemaining: customization.duration,
        duration: customization.duration,
        startTime: null
      }
    });
  };

  const handleCustomizationUpdate = (updates: Partial<typeof customization>) => {
    updateSettings({
      cleanHouseCustomization: {
        ...customization,
        ...updates
      }
    });
  };

  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    if (customization.autoRestart) {
      setTimeout(startSession, 1000);
    }
  };

  const handleCelebrationRestart = () => {
    setShowCelebration(false);
    startSession();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  if (showCelebration) {
    return (
      <div className="space-y-6">
        <SessionCelebration 
          sessionType="cleanhouse"
          onComplete={handleCelebrationComplete}
          onRestart={handleCelebrationRestart}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-accent-flow" />
            Clean House Cues
            <Badge variant="secondary">Gentle Support</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">Enable Gentle Cleaning Cues</div>
              <div className="text-sm text-muted-foreground">
                Persistent timer with header display and personalized celebrations
              </div>
            </div>
            <Switch 
              checked={isEnabled}
              onCheckedChange={handleToggleEnabled}
            />
          </div>

          {isEnabled && (
            <Tabs defaultValue="timer" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="timer">Timer</TabsTrigger>
                <TabsTrigger value="customize">Customize</TabsTrigger>
                <TabsTrigger value="prompts">Prompts</TabsTrigger>
              </TabsList>
              
              <TabsContent value="timer" className="space-y-4">
                {/* Timer Section */}
                <div className="p-6 bg-gradient-canvas rounded-lg border border-border/50">
                  <div className="text-center space-y-4">
                    <div className="text-3xl font-mono font-bold text-foreground">
                      {formatTime(timerState.timeRemaining)}
                    </div>
                    
                    <div className="flex items-center justify-center gap-2">
                      {!timerState.isActive ? (
                        <Button onClick={startSession} className="gap-2">
                          <Play className="h-4 w-4" />
                          Start {formatDuration(customization.duration)} Reset
                        </Button>
                      ) : (
                        <Button onClick={pauseSession} variant="outline" className="gap-2">
                          <Pause className="h-4 w-4" />
                          Pause
                        </Button>
                      )}
                      
                      <Button onClick={resetSession} variant="ghost" size="sm" className="gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Reset
                      </Button>
                    </div>
                    
                    {timerState.isActive && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Remember: Even one small action counts. You're doing great! 💙
                        </p>
                        <Badge variant="outline" className="bg-accent-flow/10 text-accent-flow">
                          Timer visible in header
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="customize" className="space-y-4">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Session Duration
                    </Label>
                    <Select 
                      value={customization.duration.toString()} 
                      onValueChange={(value) => handleCustomizationUpdate({ duration: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="300">5 minutes</SelectItem>
                        <SelectItem value="600">10 minutes</SelectItem>
                        <SelectItem value="900">15 minutes</SelectItem>
                        <SelectItem value="1200">20 minutes</SelectItem>
                        <SelectItem value="1800">30 minutes</SelectItem>
                        <SelectItem value="2700">45 minutes</SelectItem>
                        <SelectItem value="3600">1 hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Celebration Message
                    </Label>
                    <Textarea
                      value={customization.celebrationMessage}
                      onChange={(e) => handleCustomizationUpdate({ celebrationMessage: e.target.value })}
                      placeholder="Your personalized celebration message..."
                      className="min-h-20"
                    />
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <Vibrate className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium">Haptic Feedback</div>
                      <div className="text-sm text-muted-foreground">
                        Gentle vibrations for celebrations
                      </div>
                    </div>
                    <Switch 
                      checked={customization.hapticEnabled}
                      onCheckedChange={(checked) => handleCustomizationUpdate({ hapticEnabled: checked })}
                    />
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <RotateCcw className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium">Auto-Restart</div>
                      <div className="text-sm text-muted-foreground">
                        Automatically start a new session after completion
                      </div>
                    </div>
                    <Switch 
                      checked={customization.autoRestart}
                      onCheckedChange={(checked) => handleCustomizationUpdate({ autoRestart: checked })}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="prompts" className="space-y-4">
                {/* Sample Gentle Prompts */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-accent-flow" />
                    <span className="text-sm font-medium">Sample Gentle Prompts:</span>
                  </div>
                  
                  <div className="space-y-3">
                    {gentlePrompts.map((prompt, index) => (
                      <div key={index} className={`p-3 bg-background rounded border-l-4 ${prompt.color}`}>
                        <p className="text-sm">{prompt.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Anti-Shame Promise */}
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Anti-Shame Promise:</strong> These prompts will never make you feel guilty or inadequate. You can always postpone or dismiss them without judgment. Your worth isn't tied to your productivity.
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}