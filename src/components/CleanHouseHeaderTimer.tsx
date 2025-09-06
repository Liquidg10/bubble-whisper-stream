import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Home, Play, Pause, Settings } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';

export function CleanHouseHeaderTimer() {
  const { settings } = useBubbleStore();
  const [showModal, setShowModal] = useState(false);

  if (!settings.cleanHouseTimer?.isActive) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((settings.cleanHouseCustomization.duration - settings.cleanHouseTimer.timeRemaining) / settings.cleanHouseCustomization.duration) * 100;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowModal(true)}
        className="h-8 px-2 gap-1.5 bg-accent-flow/10 hover:bg-accent-flow/20 border border-accent-flow/30"
      >
        <Home className="h-3 w-3 text-accent-flow" />
        <span className="text-xs font-mono text-accent-flow">
          {formatTime(settings.cleanHouseTimer.timeRemaining)}
        </span>
        <div className="w-12 h-1 bg-background rounded-full overflow-hidden">
          <div 
            className="h-full bg-accent-flow transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-accent-flow" />
              Clean House Timer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-mono font-bold text-foreground mb-2">
                {formatTime(settings.cleanHouseTimer.timeRemaining)}
              </div>
              <Badge variant="secondary" className="bg-accent-flow/10 text-accent-flow">
                10-Minute Reset Active
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              You're doing great! Every small action counts. 💙
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                onClick={() => setShowModal(false)}
                variant="outline"
                size="sm"
              >
                Continue
              </Button>
              <Button
                onClick={() => {
                  setShowModal(false);
                  window.location.href = '/tools';
                }}
                size="sm"
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Full Controls
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}