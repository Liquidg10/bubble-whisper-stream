import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, SkipForward, Info, Clock } from 'lucide-react';
import { MilestoneConfig } from '@/services/progressiveOnboardingService';
import { motion, AnimatePresence } from 'framer-motion';

interface ProgressiveMilestoneCardProps {
  milestone: MilestoneConfig;
  isVisible: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onRemindLater: () => void;
  className?: string;
}

export const ProgressiveMilestoneCard: React.FC<ProgressiveMilestoneCardProps> = ({
  milestone,
  isVisible,
  onComplete,
  onSkip,
  onRemindLater,
  className
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ 
            duration: 0.4, 
            ease: [0.23, 1, 0.32, 1],
            opacity: { duration: 0.3 }
          }}
          className={className}
        >
          <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/30 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-xs font-medium">
                    Day {milestone.day}
                  </Badge>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="h-6 w-6 p-0"
                >
                  <Info className="h-3 w-3" />
                </Button>
              </div>
              <CardTitle className="text-lg font-medium text-foreground">
                {milestone.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {milestone.description}
              </p>
            </CardHeader>

            <CardContent className="pt-0">
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mb-4 space-y-2"
                  >
                    <h4 className="text-sm font-medium text-foreground">Examples:</h4>
                    <ul className="space-y-1">
                      {milestone.examples.map((example, index) => (
                        <li key={index} className="text-xs text-muted-foreground ml-2">
                          • {example}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={onComplete}
                  className="flex-1 min-w-[100px] bg-primary hover:bg-primary/90"
                  size="sm"
                >
                  Try it now
                </Button>
                
                {milestone.canSkip && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRemindLater}
                      className="flex items-center gap-1"
                    >
                      <Clock className="h-3 w-3" />
                      Later
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onSkip}
                      className="flex items-center gap-1 text-muted-foreground"
                    >
                      <SkipForward className="h-3 w-3" />
                      Skip
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
};