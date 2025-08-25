import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { audioQueueService, AudioQueueState } from '@/services/audioQueue';
import { Play, Pause, SkipForward, X, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AudioQueueIndicatorProps {
  className?: string;
}

export const AudioQueueIndicator: React.FC<AudioQueueIndicatorProps> = ({ className }) => {
  const [queueState, setQueueState] = useState<AudioQueueState>(audioQueueService.getState());

  useEffect(() => {
    const unsubscribe = audioQueueService.subscribe(() => {
      setQueueState(audioQueueService.getState());
    });

    return unsubscribe;
  }, []);

  // Don't show if queue is empty and nothing is playing
  if (!queueState.isPlaying && !queueState.isProcessing && queueState.queue.length === 0) {
    return null;
  }

  const handlePlayPause = () => {
    if (queueState.isPlaying) {
      audioQueueService.pause();
    } else {
      audioQueueService.resume();
    }
  };

  const handleSkip = () => {
    audioQueueService.skipCurrent();
  };

  const handleClear = () => {
    audioQueueService.clearQueue();
    audioQueueService.stop();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'playing': return 'bg-primary';
      case 'loading': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      case 'ready': return 'bg-green-500';
      default: return 'bg-muted';
    }
  };

  const currentText = queueState.currentItem?.text || '';
  const displayText = currentText.length > 40 ? currentText.substring(0, 40) + '...' : currentText;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className={`fixed bottom-4 right-4 z-50 ${className}`}
      >
        <Card className="p-3 bg-background/95 backdrop-blur border-border/50 shadow-lg max-w-sm">
          <div className="flex items-center gap-3">
            {/* Play/Pause Button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePlayPause}
              disabled={!queueState.currentItem}
              className="h-8 w-8 p-0"
            >
              {queueState.isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            {/* Current Item Info */}
            <div className="flex-1 min-w-0">
              {queueState.currentItem && (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <Volume2 className="h-3 w-3 text-muted-foreground" />
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${getStatusColor(queueState.currentItem.status)} text-white`}
                    >
                      {queueState.currentItem.status}
                    </Badge>
                    {queueState.queue.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        +{queueState.queue.length}
                      </Badge>
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground truncate">
                    {displayText}
                  </p>

                  {/* Progress indicator for playing items */}
                  {queueState.currentItem.status === 'playing' && (
                    <div className="mt-2">
                      <Progress 
                        value={75} // Placeholder - you could add actual progress tracking
                        className="h-1"
                      />
                    </div>
                  )}
                </>
              )}

              {queueState.isProcessing && !queueState.currentItem && (
                <p className="text-xs text-muted-foreground">
                  Processing queue...
                </p>
              )}
            </div>

            {/* Control Buttons */}
            <div className="flex gap-1">
              {queueState.currentItem && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSkip}
                  className="h-6 w-6 p-0"
                  title="Skip current"
                >
                  <SkipForward className="h-3 w-3" />
                </Button>
              )}
              
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClear}
                className="h-6 w-6 p-0"
                title="Clear queue"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Queue Items Preview */}
          {queueState.queue.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mt-2 pt-2 border-t border-border/50"
            >
              <p className="text-xs text-muted-foreground mb-1">
                Queue ({queueState.queue.length}):
              </p>
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {queueState.queue.slice(0, 3).map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-xs">
                      {index + 1}
                    </Badge>
                    <span className="text-muted-foreground truncate">
                      {item.text.length > 25 ? item.text.substring(0, 25) + '...' : item.text}
                    </span>
                  </div>
                ))}
                {queueState.queue.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    ...and {queueState.queue.length - 3} more
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};