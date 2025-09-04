import React, { useState } from 'react';
import { Bubble } from '@/types/bubble';
import { outline, TaskStep, estimateTotalTime } from '@/services/outliner';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, Circle, ArrowDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TaskOutlinerProps {
  bubble: Bubble;
  isOpen: boolean;
  onClose: () => void;
}

export const TaskOutliner: React.FC<TaskOutlinerProps> = ({
  bubble,
  isOpen,
  onClose,
}) => {
  const { addBubble } = useBubbleStore();
  const { toast } = useToast();
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  const handleBreakDown = async () => {
    if (!bubble.content) return;
    
    setIsLoading(true);
    try {
      const generatedSteps = await outline(bubble.content);
      setSteps(generatedSteps);
      setHasGenerated(true);
    } catch (error) {
      console.error('Failed to generate outline:', error);
      toast({
        title: "Error",
        description: "Failed to break down task. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    if (steps.length === 0) return;
    
    try {
      // Create subtask bubbles near the original task
      const baseX = bubble.x + 100;
      const baseY = bubble.y;
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const subtaskBubble: Bubble = {
          id: crypto.randomUUID(),
          type: 'Task',
          content: step.title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          x: baseX + (i % 3) * 120,
          y: baseY + Math.floor(i / 3) * 80,
          size: 0.7, // Smaller than main task
          tags: [...bubble.tags, { 
            id: crypto.randomUUID(), 
            name: `${step.estMins}min`, 
            emoji: '⏱️' 
          }],
          metadata: {
            ...bubble.metadata,
            outliner: {
              parentTaskId: bubble.id,
              stepId: step.id,
              estimatedMinutes: step.estMins,
              dependsOn: step.dependsOn,
            }
          }
        };
        
        await addBubble(subtaskBubble);
      }
      
      toast({
        title: "Task Broken Down",
        description: `Created ${steps.length} subtasks`,
      });
      
      onClose();
    } catch (error) {
      console.error('Failed to create subtasks:', error);
      toast({
        title: "Error",
        description: "Failed to create subtasks. Please try again.",
        variant: "destructive",
      });
    }
  };

  const totalTime = steps.length > 0 ? estimateTotalTime(steps) : 0;
  const totalHours = Math.floor(totalTime / 60);
  const totalMinutes = totalTime % 60;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Circle className="h-5 w-5 text-primary" />
            Break Down Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original Task */}
          <div className="p-3 rounded-lg bg-muted/50">
            <h3 className="font-medium text-sm text-muted-foreground mb-1">Original Task</h3>
            <p className="text-sm">{bubble.content}</p>
          </div>

          {/* Generate Button */}
          {!hasGenerated && (
            <div className="text-center">
              <Button 
                onClick={handleBreakDown}
                disabled={isLoading}
                className="bg-primary hover:bg-primary/90"
              >
                {isLoading ? 'Breaking down...' : 'Break this down'}
              </Button>
            </div>
          )}

          {/* Steps Preview */}
          {hasGenerated && steps.length > 0 && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Proposed Steps</h3>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {totalHours > 0 && `${totalHours}h `}{totalMinutes}m total
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div key={step.id} className="flex items-start gap-3 p-2 rounded border">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium mt-0.5">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{step.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {step.estMins}min
                          </Badge>
                          {step.dependsOn && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <ArrowDown className="h-3 w-3" />
                              After step {steps.findIndex(s => s.id === step.dependsOn) + 1}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handleCommit}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  Create Subtasks
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};