import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBubbleStore } from '@/stores/bubbleStore';
import { hapticsService } from '@/services/haptics';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Brain, Home, Coffee } from 'lucide-react';

interface SessionCelebrationProps {
  sessionType: 'pomodoro' | 'cleanhouse';
  onComplete: () => void;
  onRestart?: () => void;
  phase?: 'work' | 'break' | 'longBreak';
}

export function SessionCelebration({ sessionType, onComplete, onRestart, phase }: SessionCelebrationProps) {
  const { settings } = useBubbleStore();
  const { toast } = useToast();
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Get session-specific settings
    const sessionSettings = sessionType === 'pomodoro' 
      ? settings.pomodoroCustomization 
      : settings.cleanHouseCustomization;

    // Trigger haptic feedback if enabled
    if (sessionSettings?.hapticEnabled) {
      hapticsService.success();
      // Additional celebration haptics
      setTimeout(() => hapticsService.gentle(), 200);
      setTimeout(() => hapticsService.gentle(), 400);
    }

    // Play celebration sound/speak message
    if (settings.ttsEnabled && sessionSettings?.celebrationMessage) {
      const utterance = new SpeechSynthesisUtterance(sessionSettings.celebrationMessage);
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      speechSynthesis.speak(utterance);
    }

    // Hide confetti after 3 seconds
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, [settings, sessionType]);

  const getSessionInfo = () => {
    if (sessionType === 'pomodoro') {
      switch (phase) {
        case 'work':
          return {
            icon: Brain,
            title: 'Focus Session Complete! 🍅',
            gradient: 'from-accent-growth to-accent-growth/60',
            message: settings.pomodoroCustomization?.celebrationMessage || "Great focus session! Time for a well-deserved break.",
            buttonText: 'Amazing!'
          };
        case 'break':
          return {
            icon: Coffee,
            title: 'Break Complete! ☕',
            gradient: 'from-accent-joy to-accent-joy/60',
            message: "Break time's over! Ready to focus again?",
            buttonText: 'Let\'s Go!'
          };
        case 'longBreak':
          return {
            icon: Coffee,
            title: 'Long Break Complete! 🛌',
            gradient: 'from-accent-calm to-accent-calm/60',
            message: "Great work cycle complete! Ready for a fresh start?",
            buttonText: 'Ready!'
          };
        default:
          return {
            icon: Brain,
            title: 'Session Complete! 🍅',
            gradient: 'from-accent-growth to-accent-growth/60',
            message: settings.pomodoroCustomization?.celebrationMessage || "Great session!",
            buttonText: 'Amazing!'
          };
      }
    } else {
      return {
        icon: Home,
        title: 'Clean House Session Complete! 🎉',
        gradient: 'from-accent-flow to-accent-flow/60',
        message: settings.cleanHouseCustomization?.celebrationMessage || "Great job on your cleaning session!",
        buttonText: 'Amazing!'
      };
    }
  };

  const sessionInfo = getSessionInfo();
  const IconComponent = sessionInfo.icon;

  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br ${sessionInfo.gradient} border-accent-growth/30`}>
      <CardContent className="p-8 text-center space-y-6 relative">
        {/* Confetti Animation */}
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none">
            <Sparkles className="absolute top-4 left-4 h-6 w-6 text-accent-growth animate-pulse" />
            <Sparkles className="absolute top-12 right-8 h-4 w-4 text-accent-joy animate-pulse delay-300" />
            <Sparkles className="absolute bottom-8 left-8 h-5 w-5 text-accent-calm animate-pulse delay-500" />
            <Sparkles className="absolute bottom-4 right-4 h-6 w-6 text-accent-flow animate-pulse delay-700" />
          </div>
        )}

        <div className="space-y-4 relative z-10">
          <div className="flex justify-center">
            <IconComponent className="h-12 w-12 text-background" />
          </div>
          <h3 className="text-2xl font-bold text-background">
            {sessionInfo.title}
          </h3>
          <p className="text-background/90 text-lg">
            {sessionInfo.message}
          </p>
        </div>

        <div className="flex gap-3 justify-center relative z-10">
          <Button 
            onClick={onComplete}
            size="lg"
            variant="secondary"
            className="bg-background/90 text-foreground hover:bg-background"
          >
            {sessionInfo.buttonText}
          </Button>
          
          {onRestart && sessionType === 'pomodoro' && (
            <Button 
              onClick={onRestart}
              size="lg"
              variant="outline"
              className="border-background/50 text-background hover:bg-background/20"
            >
              Continue Session
            </Button>
          )}
          
          {onRestart && sessionType === 'cleanhouse' && (
            <Button 
              onClick={onRestart}
              size="lg"
              variant="outline"
              className="border-background/50 text-background hover:bg-background/20"
            >
              Another {Math.floor((settings.cleanHouseCustomization?.duration || 600) / 60)} Minutes?
            </Button>
          )}
          
          <Button 
            onClick={() => {
              onComplete();
              toast({
                title: "Progress Captured! 📝",
                description: "Your session has been logged for productivity insights.",
              });
            }}
            size="lg"
            variant="outline"
            className="border-background/50 text-background hover:bg-background/20"
          >
            Capture Progress
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}