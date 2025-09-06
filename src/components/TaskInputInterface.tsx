import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  Brain, 
  Plus, 
  Send, 
  Lightbulb, 
  Target, 
  Clock,
  MapPin,
  Sparkles,
  BookOpen,
  CheckCircle,
  Play
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { aiService } from '@/services/aiService';

interface TaskSuggestion {
  text: string;
  category: 'work' | 'personal' | 'health' | 'creative' | 'learning';
  estimatedDuration: number; // in minutes
  confidence: number;
}

interface SessionContext {
  currentTask?: string;
  startTime?: number;
  taskType?: string;
  location?: string;
  mood?: string;
}

export function TaskInputInterface() {
  const { settings, updateSettings, addBubble } = useBubbleStore();
  const { toast } = useToast();
  const [currentTask, setCurrentTask] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [sessionContext, setSessionContext] = useState<SessionContext>({});
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load session context on mount
  useEffect(() => {
    const saved = localStorage.getItem('sessionContext');
    if (saved) {
      try {
        setSessionContext(JSON.parse(saved));
      } catch (error) {
        console.warn('Failed to load session context:', error);
      }
    }
  }, []);

  // Save session context when it changes
  useEffect(() => {
    if (Object.keys(sessionContext).length > 0) {
      localStorage.setItem('sessionContext', JSON.stringify(sessionContext));
    }
  }, [sessionContext]);

  // Generate smart suggestions based on context
  useEffect(() => {
    if (currentTask.length > 3) {
      generateSuggestions(currentTask);
    } else {
      setSuggestions([]);
    }
  }, [currentTask]);

  const generateSuggestions = async (input: string) => {
    if (!aiService.isAIAvailable()) {
      // Fallback to static suggestions
      const staticSuggestions: TaskSuggestion[] = [
        {
          text: "Focus on " + input + " for 25 minutes",
          category: 'work',
          estimatedDuration: 25,
          confidence: 0.8
        },
        {
          text: "Break down " + input + " into smaller steps",
          category: 'work',
          estimatedDuration: 15,
          confidence: 0.7
        }
      ];
      setSuggestions(staticSuggestions);
      return;
    }

    setIsAnalyzing(true);
    try {
      // Use AI to categorize and estimate duration
      const prompt = `Analyze this task: "${input}". Return a JSON array with suggestions including category, estimated duration, and confidence. Context: ${JSON.stringify(sessionContext)}`;
      
      // For now, use static suggestions with AI enhancement later
      const enhanced: TaskSuggestion[] = [
        {
          text: `Focus session: ${input}`,
          category: 'work',
          estimatedDuration: 25,
          confidence: 0.9
        },
        {
          text: `Quick check: ${input}`,
          category: 'work',
          estimatedDuration: 10,
          confidence: 0.8
        },
        {
          text: `Deep work: ${input}`,
          category: 'work',
          estimatedDuration: 45,
          confidence: 0.7
        }
      ];
      
      setSuggestions(enhanced);
    } catch (error) {
      console.warn('Failed to generate AI suggestions:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickInput.trim()) return;

    const bubble = {
      id: `task-${Date.now()}`,
      x: Math.random() * 300 + 100,
      y: Math.random() * 300 + 100,
      type: 'Task' as const,
      content: quickInput.trim(),
      tags: [{ id: 'ai-added', name: 'ai-added', colorHex: '#3b82f6' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      size: 40
    };

    addBubble(bubble);
    
    // Try to auto-categorize and add to appropriate lists
    await categorizeBubble(bubble);
    
    setQuickInput('');
    toast({
      title: "Task Added! 📝",
      description: "AI is categorizing your task...",
    });
  };

  const categorizeBubble = async (bubble: any) => {
    if (!aiService.isAIAvailable()) return;

    try {
      // AI categorization logic would go here
      // For now, just add some smart tags based on keywords
      const content = bubble.content.toLowerCase();
      const smartTags = [];
      
      if (content.includes('grocery') || content.includes('milk') || content.includes('bread')) {
        smartTags.push('groceries');
      }
      if (content.includes('clean') || content.includes('tidy') || content.includes('organize')) {
        smartTags.push('cleaning');
      }
      if (content.includes('work') || content.includes('meeting') || content.includes('project')) {
        smartTags.push('work');
      }
      
      if (smartTags.length > 0) {
        // Update bubble with smart tags
        // This would integrate with the bubble store
        toast({
          title: "Smart categorization complete! 🧠",
          description: `Added to: ${smartTags.join(', ')}`,
        });
      }
    } catch (error) {
      console.warn('Failed to categorize bubble:', error);
    }
  };

  const startSession = (task: string, duration: number) => {
    setSessionContext({
      currentTask: task,
      startTime: Date.now(),
      taskType: 'focus'
    });

    // Start appropriate timer based on duration
    if (duration >= 25) {
      // Start Pomodoro
      updateSettings({
        pomodoroTimer: {
          isActive: true,
          timeRemaining: duration * 60,
          duration: duration * 60,
          startTime: Date.now(),
          currentPhase: 'work',
          cycleCount: 0
        }
      });
    } else {
      // Start clean house timer for shorter tasks
      updateSettings({
        cleanHouseTimer: {
          isActive: true,
          timeRemaining: duration * 60,
          duration: duration * 60,
          startTime: Date.now()
        }
      });
    }

    setCurrentTask('');
    toast({
      title: `${duration}-minute session started! 🍅`,
      description: `Focusing on: ${task}`,
    });
  };

  const completeCurrent = () => {
    if (sessionContext.currentTask) {
      const duration = sessionContext.startTime 
        ? Math.floor((Date.now() - sessionContext.startTime) / 1000 / 60)
        : 0;
      
      // Log completion for AI learning
      const completion = {
        task: sessionContext.currentTask,
        actualDuration: duration,
        timestamp: Date.now(),
        context: sessionContext
      };
      
      // Store in bubble as completed task
      addBubble({
        id: `completed-${Date.now()}`,
        x: Math.random() * 300 + 100,
        y: Math.random() * 300 + 100,
        type: 'Memory' as const,
        content: `✅ Completed: ${sessionContext.currentTask} (${duration}m)`,
        tags: [
          { id: 'completed', name: 'completed', colorHex: '#10b981' },
          { id: 'ai-tracked', name: 'ai-tracked', colorHex: '#3b82f6' }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: 40
      });

      setSessionContext({});
      toast({
        title: "Task completed! 🎉",
        description: `Great job on "${sessionContext.currentTask}"`,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Session Display */}
      {sessionContext.currentTask && (
        <Card className="bg-gradient-to-r from-accent-growth/10 to-accent-joy/10 border-accent-growth/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-accent-growth" />
                <span className="font-medium">Currently focusing on:</span>
              </div>
              <Button onClick={completeCurrent} size="sm" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Complete
              </Button>
            </div>
            <p className="text-lg mt-2">{sessionContext.currentTask}</p>
            {sessionContext.startTime && (
              <p className="text-sm text-muted-foreground mt-1">
                Started {Math.floor((Date.now() - sessionContext.startTime) / 1000 / 60)} minutes ago
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Task Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-accent-growth" />
            Smart Task Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick Add */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="Add anything: groceries, tasks, ideas..."
              onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
              className="flex-1"
            />
            <Button onClick={handleQuickAdd} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {/* Focus Session Input */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent-growth" />
              <span className="font-medium">What are you working on?</span>
            </div>
            <Textarea
              value={currentTask}
              onChange={(e) => setCurrentTask(e.target.value)}
              placeholder="Describe your task or project..."
              className="min-h-16"
            />
            
            {/* AI Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent-joy" />
                  <span className="text-sm font-medium">Smart suggestions:</span>
                </div>
                <div className="space-y-2">
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm">{suggestion.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {suggestion.category}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {suggestion.estimatedDuration}m
                          </div>
                        </div>
                      </div>
                      <Button 
                        onClick={() => startSession(suggestion.text, suggestion.estimatedDuration)}
                        size="sm"
                        className="gap-1"
                      >
                        <Play className="h-3 w-3" />
                        Start
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Start */}
            {currentTask.trim() && suggestions.length === 0 && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => startSession(currentTask, 25)}
                  className="gap-2"
                >
                  <Brain className="h-4 w-4" />
                  25min Focus
                </Button>
                <Button 
                  onClick={() => startSession(currentTask, 10)}
                  variant="outline"
                  className="gap-2"
                >
                  <Clock className="h-4 w-4" />
                  Quick 10m
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}