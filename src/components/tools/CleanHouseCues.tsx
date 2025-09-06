import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Home, 
  Clock, 
  AlertCircle,
  Settings,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/components/ui/use-toast';

export function CleanHouseCues() {
  const { settings, updateSettings } = useBubbleStore();
  const [isEnabled, setIsEnabled] = useState(settings.cleaningCuesEnabled || false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(10 * 60); // 10 minutes in seconds
  const { toast } = useToast();

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
    
    if (isSessionActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setIsSessionActive(false);
            toast({
              title: "Session Complete! 🎉",
              description: "Great job on your 10-minute reset. Every small step matters.",
            });
            return 10 * 60;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isSessionActive, timeRemaining, toast]);

  const handleToggleEnabled = (enabled: boolean) => {
    setIsEnabled(enabled);
    updateSettings({ cleaningCuesEnabled: enabled });
  };

  const startSession = () => {
    setIsSessionActive(true);
    setTimeRemaining(10 * 60);
    toast({
      title: "10-Minute Reset Started",
      description: "Remember: progress, not perfection. You've got this!",
    });
  };

  const pauseSession = () => {
    setIsSessionActive(false);
  };

  const resetSession = () => {
    setIsSessionActive(false);
    setTimeRemaining(10 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-blue-600" />
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
                10-minute reset prompts with compassionate, anti-shame language
              </div>
            </div>
            <Switch 
              checked={isEnabled}
              onCheckedChange={handleToggleEnabled}
            />
          </div>

          {isEnabled && (
            <>
              {/* Timer Section */}
              <div className="p-6 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/50 dark:to-green-950/50 rounded-lg border">
                <div className="text-center space-y-4">
                  <div className="text-3xl font-mono font-bold text-foreground">
                    {formatTime(timeRemaining)}
                  </div>
                  
                  <div className="flex items-center justify-center gap-2">
                    {!isSessionActive ? (
                      <Button onClick={startSession} className="gap-2">
                        <Play className="h-4 w-4" />
                        Start 10-Minute Reset
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
                  
                  {isSessionActive && (
                    <p className="text-sm text-muted-foreground">
                      Remember: Even one small action counts. You're doing great! 💙
                    </p>
                  )}
                </div>
              </div>

              {/* Sample Gentle Prompts */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}