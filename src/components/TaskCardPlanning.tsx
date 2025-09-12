import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Target, 
  Heart, 
  AlertTriangle, 
  Lightbulb,
  Calendar,
  CheckSquare,
  X,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task, updateTask } from '@/types/task';
import { calendarWriteService } from '@/services/calendarWriteService';
import { usePrecisionGateUndo } from '@/hooks/usePrecisionGateUndo';

interface PlanningMetadata {
  wish?: string;
  outcome?: string;
  obstacle?: string;
  plan?: string;
  createdAt?: number;
  skippedAt?: number;
}

interface TaskCardPlanningProps {
  task: Task;
  onUpdate: (task: Task) => void;
  onClose: () => void;
  className?: string;
}

const WISH_CHIPS = [
  'Finish this completely',
  'Make real progress',
  'Complete successfully', 
  'Get it done well'
];

const OUTCOME_CHIPS = [
  'Reduce stress',
  'Feel accomplished',
  'Move forward',
  'Help others',
  'Learn something',
  'Clear my mind'
];

const OBSTACLE_CHIPS = [
  'Lack of time',
  'Too many distractions',
  'Low energy',
  'Unclear next steps',
  'Missing information',
  'Other priorities'
];

const PLAN_CHIPS = [
  'If distracted, then take a 5-min break',
  'If stuck, then ask for help',
  'If tired, then do easier parts first',
  'If overwhelmed, then break into smaller steps',
  'If interrupted, then write down where I left off'
];

type PlanningStep = 'wish' | 'outcome' | 'obstacle' | 'plan';

export const TaskCardPlanning: React.FC<TaskCardPlanningProps> = ({
  task,
  onUpdate,
  onClose,
  className
}) => {
  const [currentStep, setCurrentStep] = useState<PlanningStep>('wish');
  const [planning, setPlanningData] = useState<PlanningMetadata>(
    task.metadata?.planning || {}
  );
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showUndoToast } = usePrecisionGateUndo();

  useEffect(() => {
    if (showCustomInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCustomInput]);

  const steps: Array<{
    key: PlanningStep;
    title: string;
    icon: React.ReactNode;
    description: string;
    chips: string[];
  }> = [
    {
      key: 'wish',
      title: 'Wish',
      icon: <Target className="w-4 h-4" />,
      description: 'What outcome do you want?',
      chips: WISH_CHIPS
    },
    {
      key: 'outcome',
      title: 'Outcome',
      icon: <Heart className="w-4 h-4" />,
      description: 'Why does this matter to you?',
      chips: OUTCOME_CHIPS
    },
    {
      key: 'obstacle',
      title: 'Obstacle',
      icon: <AlertTriangle className="w-4 h-4" />,
      description: 'What might get in the way?',
      chips: OBSTACLE_CHIPS
    },
    {
      key: 'plan',
      title: 'Plan',
      icon: <Lightbulb className="w-4 h-4" />,
      description: 'If that happens, then I will...',
      chips: PLAN_CHIPS
    }
  ];

  const currentStepIndex = steps.findIndex(s => s.key === currentStep);
  const currentStepData = steps[currentStepIndex];

  const handleChipSelect = (value: string) => {
    const newPlanning = { ...planning, [currentStep]: value };
    setPlanningData(newPlanning);
    advanceToNextStep();
  };

  const handleCustomSubmit = () => {
    if (!customInput.trim()) return;
    
    const newPlanning = { ...planning, [currentStep]: customInput.trim() };
    setPlanningData(newPlanning);
    setCustomInput('');
    setShowCustomInput(false);
    advanceToNextStep();
  };

  const advanceToNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1].key);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    const updatedTask = updateTask(task, {
      metadata: {
        ...task.metadata,
        planning: {
          ...planning,
          createdAt: Date.now()
        }
      }
    });

    onUpdate(updatedTask);
    
    showUndoToast({
      traceId: `planning-${task.id}-${Date.now()}`,
      feature: 'planning',
      action: 'Created planning session',
      undoHandler: async () => {
        const revertedTask = updateTask(task, {
          metadata: {
            ...task.metadata,
            planning: undefined
          }
        });
        onUpdate(revertedTask);
      }
    });

    onClose();
  };

  const handleSkip = () => {
    const skippedTask = updateTask(task, {
      metadata: {
        ...task.metadata,
        planning: {
          skippedAt: Date.now()
        }
      }
    });
    onUpdate(skippedTask);
    onClose();
  };

  const handleCreateStarterBlock = async () => {
    try {
      const startTime = new Date();
      startTime.setMinutes(startTime.getMinutes() + 5); // 5 minutes from now
      
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 10); // 10-minute block

      const draft = await calendarWriteService.createEventDraft('default', {
        title: `Starter: ${task.title}`,
        description: planning.plan || 'Work session for planning task',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        confidence: 0.8
      });

      showUndoToast({
        traceId: `calendar-starter-${task.id}`,
        feature: 'calendar',
        action: 'Created 10-min starter block',
        undoHandler: async () => {
          // Remove draft from localStorage
          const drafts = calendarWriteService.getDrafts();
          const filtered = drafts.filter(d => d.id !== draft.id);
          localStorage.setItem('calendar_drafts', JSON.stringify(filtered));
        }
      });
    } catch (error) {
      console.error('Failed to create starter block:', error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', className)}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Planning Card */}
      <Card className="relative w-full max-w-md bg-card border shadow-lg">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <h3 className="font-semibold text-foreground">Quick Planning</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
              aria-label="Close planning"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Task Title */}
          <div className="mb-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground truncate">
              {task.title}
            </p>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-2 mb-6">
            {steps.map((step, index) => (
              <div
                key={step.key}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium',
                  {
                    'bg-accent-flow text-accent-contrast': index <= currentStepIndex,
                    'bg-muted text-muted-foreground': index > currentStepIndex
                  }
                )}
              >
                {index < currentStepIndex ? '✓' : index + 1}
              </div>
            ))}
          </div>

          {/* Current Step */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent-flow/10 text-accent-flow">
                {currentStepData.icon}
              </div>
              <div>
                <h4 className="font-medium text-foreground">{currentStepData.title}</h4>
                <p className="text-sm text-muted-foreground">{currentStepData.description}</p>
              </div>
            </div>

            {/* Chip Options */}
            {!showCustomInput && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2">
                  {currentStepData.chips.map((chip, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="h-auto p-3 text-left justify-start text-wrap"
                      onClick={() => handleChipSelect(chip)}
                    >
                      {chip}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCustomInput(true)}
                  className="w-full text-muted-foreground"
                >
                  Custom answer...
                </Button>
              </div>
            )}

            {/* Custom Input */}
            {showCustomInput && (
              <div className="space-y-3">
                <Input
                  ref={inputRef}
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder={`Enter your ${currentStepData.title.toLowerCase()}...`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCustomSubmit();
                    } else if (e.key === 'Escape') {
                      setShowCustomInput(false);
                      setCustomInput('');
                    }
                  }}
                  className="w-full"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCustomSubmit}
                    disabled={!customInput.trim()}
                  >
                    Continue
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowCustomInput(false);
                      setCustomInput('');
                    }}
                  >
                    Back to options
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Separator className="my-4" />

          {/* Actions */}
          <div className="flex justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-muted-foreground"
            >
              Not now
            </Button>

            {/* Show actions after planning is complete */}
            {currentStep === 'plan' && planning.plan && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateStarterBlock}
                  className="flex items-center gap-2"
                >
                  <Calendar className="w-3 h-3" />
                  10-min starter
                </Button>
              </div>
            )}
          </div>

          {/* Summary (show when complete) */}
          {Object.keys(planning).length === 4 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-3 bg-accent-flow/5 rounded-lg border border-accent-flow/20"
            >
              <div className="space-y-2 text-xs text-muted-foreground">
                <p><strong>Wish:</strong> {planning.wish}</p>
                <p><strong>Outcome:</strong> {planning.outcome}</p>
                <p><strong>Obstacle:</strong> {planning.obstacle}</p>
                <p><strong>Plan:</strong> {planning.plan}</p>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};