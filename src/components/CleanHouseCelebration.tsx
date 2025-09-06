import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Camera, RotateCcw } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { hapticsService } from '@/services/haptics';
import { useToast } from '@/hooks/use-toast';

interface CleanHouseCelebrationProps {
  onComplete: () => void;
  onRestart?: () => void;
}

export function CleanHouseCelebration({ onComplete, onRestart }: CleanHouseCelebrationProps) {
  const { settings } = useBubbleStore();
  const { toast } = useToast();
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Trigger haptic feedback if enabled
    if (settings.cleanHouseCustomization?.hapticEnabled) {
      hapticsService.success();
      // Additional celebration haptics
      setTimeout(() => hapticsService.gentle(), 200);
      setTimeout(() => hapticsService.gentle(), 400);
    }

    // Play celebration sound/speak message
    if (settings.ttsEnabled && settings.cleanHouseCustomization?.celebrationMessage) {
      const utterance = new SpeechSynthesisUtterance(settings.cleanHouseCustomization.celebrationMessage);
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      speechSynthesis.speak(utterance);
    }

    // Auto-hide confetti after animation
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, [settings]);

  return (
    <Card className="bg-gradient-gentle border-accent-growth/30">
      <CardContent className="p-6 text-center space-y-4">
        {showConfetti && (
          <div className="relative">
            <Sparkles className="h-16 w-16 mx-auto text-accent-growth animate-pulse" />
            <div className="absolute inset-0 animate-ping">
              <Sparkles className="h-16 w-16 mx-auto text-accent-growth opacity-30" />
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">
            Session Complete! 🎉
          </h3>
          <p className="text-muted-foreground">
            {settings.cleanHouseCustomization?.celebrationMessage || "Great job on your cleaning session!"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={onComplete}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Amazing!
          </Button>
          
          {onRestart && (
            <Button
              onClick={onRestart}
              variant="outline"
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Another 10 Minutes?
            </Button>
          )}
          
          <Button
            onClick={() => {
              toast({
                title: "Photo Prompt",
                description: "Would you like to capture a quick before/after photo of your progress?",
              });
            }}
            variant="ghost"
            size="sm"
            className="gap-2"
          >
            <Camera className="h-4 w-4" />
            Capture Progress
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}