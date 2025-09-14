/**
 * Universal Task Card Component
 * The P3-P5 unified editor that works across all views (List, Kanban, Matrix, Bubble)
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, Tag, Zap, Brain, Calendar as CalendarIcon, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { becauseExplanationService } from '@/services/becauseExplanationService';
import { taskAwareAutoWriteService } from '@/services/taskAwareAutoWriteService';
import { BecauseExplanation } from '@/components/privacy/BecauseExplanation';
import type { Task } from '@/types/task';

interface UniversalTaskCardProps {
  task?: Partial<Task>;
  viewContext: {
    viewId: string;
    mode: 'bubble' | 'list' | 'kanban' | 'matrix';
    position?: { x?: number; y?: number; column?: string; quadrant?: number };
  };
  onSave: (task: Task) => void;
  onCancel: () => void;
  onDelete?: (taskId: string) => void;
}

interface SmartSuggestion {
  type: 'priority' | 'timing' | 'tags' | 'calendar' | 'email';
  suggestion: string;
  confidence: number;
  reason: string;
}

export function UniversalTaskCard({ 
  task, 
  viewContext, 
  onSave, 
  onCancel, 
  onDelete 
}: UniversalTaskCardProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<Task>>({
    id: task?.id || '',
    title: task?.title || '',
    description: task?.description || '',
    completed: task?.completed || false,
    priority: task?.priority || 50,
    tags: task?.tags || [],
    type: task?.type || 'task',
    due: task?.due,
    start: task?.start,
    end: task?.end,
    view: task?.view || {},
    createdAt: task?.createdAt || Date.now(),
    updatedAt: Date.now()
  });

  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const [showPlanningMode, setShowPlanningMode] = useState(false);
  const [planningData, setPlanningData] = useState({
    wish: '',
    outcome: '',
    obstacle: '',
    plan: ''
  });

  // Generate smart suggestions when title changes
  useEffect(() => {
    if (formData.title && formData.title.length > 5) {
      generateSmartSuggestions();
    }
  }, [formData.title]);

  const generateSmartSuggestions = async () => {
    try {
      const suggestions: SmartSuggestion[] = [];

      // Priority suggestion based on keywords
      if (formData.title?.toLowerCase().includes('urgent') || 
          formData.title?.toLowerCase().includes('asap')) {
        suggestions.push({
          type: 'priority',
          suggestion: 'High priority (80)',
          confidence: 0.8,
          reason: 'Urgency keywords detected'
        });
      }

      // Calendar suggestion for time-related tasks
      if (formData.title?.toLowerCase().includes('meeting') ||
          formData.title?.toLowerCase().includes('call') ||
          formData.title?.toLowerCase().includes('appointment')) {
        suggestions.push({
          type: 'calendar',
          suggestion: 'Add to calendar',
          confidence: 0.9,
          reason: 'Time-based activity detected'
        });
      }

      // Email suggestion for communication tasks
      if (formData.title?.toLowerCase().includes('email') ||
          formData.title?.toLowerCase().includes('follow up') ||
          formData.title?.toLowerCase().includes('reply')) {
        suggestions.push({
          type: 'email',
          suggestion: 'Create email draft',
          confidence: 0.7,
          reason: 'Communication action detected'
        });
      }

      setSmartSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
    }
  };

  const applySuggestion = async (suggestion: SmartSuggestion) => {
    try {
      switch (suggestion.type) {
        case 'priority':
          setFormData(prev => ({ ...prev, priority: 80 }));
          break;
          
        case 'calendar':
          // Set up calendar view metadata
          setFormData(prev => ({
            ...prev,
            view: {
              ...prev.view,
              calendar: {
                startTime: new Date(Date.now() + 24*60*60*1000).toISOString(), // Tomorrow
                durationMin: 60
              }
            }
          }));
          break;
          
        case 'email':
          // Could integrate with email draft service
          toast({
            title: 'Email integration ready',
            description: 'Save task first, then use Auto-Write for email drafts'
          });
          break;
      }

      // Generate "Because..." explanation
      const explanation = becauseExplanationService.generateNudgeExplanation(
        'planning',
        { recentActivity: [], patterns: [], currentLoad: suggestion.confidence }
      );

      toast({
        title: `Applied: ${suggestion.suggestion}`,
        description: explanation.shortText,
        duration: 4000
      });

    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    }
  };

  const handleSave = async () => {
    if (!formData.title?.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a title for your task',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Apply view-specific metadata based on context
      const viewMetadata = { ...formData.view };
      
      switch (viewContext.mode) {
        case 'bubble':
          if (viewContext.position?.x !== undefined) {
            viewMetadata.bubble = {
              x: viewContext.position.x,
              y: viewContext.position.y || 0,
              size: Math.max(20, formData.priority || 50)
            };
          }
          break;
          
        case 'kanban':
          if (viewContext.position?.column) {
            viewMetadata.kanban = {
              boardId: 'default',
              columnId: viewContext.position.column,
              pos: Date.now()
            };
          }
          break;
          
        case 'matrix':
          if (viewContext.position?.quadrant) {
            const quadrant = viewContext.position.quadrant;
            const urgency = (quadrant <= 2 ? 3 : 1) as 1|2|3;
            const importance = (quadrant % 2 === 1 ? 3 : 1) as 1|2|3;
            viewMetadata.matrix = {
              urgency,
              importance,
              quadrant: quadrant as 1|2|3|4
            };
          }
          break;
      }

      const finalTask: Task = {
        ...formData,
        id: formData.id || `task-${Date.now()}`,
        title: formData.title,
        completed: formData.completed || false,
        priority: formData.priority || 50,
        tags: formData.tags || [],
        type: formData.type || 'task',
        view: viewMetadata,
        createdAt: formData.createdAt || Date.now(),
        updatedAt: Date.now()
      } as Task;

      onSave(finalTask);

      toast({
        title: 'Task saved',
        description: `Created in ${viewContext.mode} view`,
        duration: 3000
      });

    } catch (error) {
      console.error('Failed to save task:', error);
      toast({
        title: 'Save failed',
        description: 'Please try again',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = () => {
    if (formData.id && onDelete) {
      onDelete(formData.id);
      toast({
        title: 'Task deleted',
        description: 'Task removed from all views',
        duration: 3000
      });
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            {viewContext.mode} view • {formData.id ? 'Edit' : 'Create'}
          </Badge>
          <Switch
            checked={formData.completed}
            onCheckedChange={(completed) => setFormData(prev => ({ ...prev, completed }))}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Input
            placeholder="What needs to be done?"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className="text-lg font-medium"
          />
        </div>

        {/* Smart Suggestions */}
        {smartSuggestions.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Smart Suggestions
            </div>
            <div className="flex flex-wrap gap-2">
              {smartSuggestions.map((suggestion, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => applySuggestion(suggestion)}
                  className="text-xs"
                >
                  {suggestion.suggestion}
                  <BecauseExplanation 
                    drivers={[suggestion.reason]} 
                    compact 
                    className="ml-2"
                  />
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <Textarea
          placeholder="Add details, notes, or context..."
          value={formData.description || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          className="min-h-[80px]"
        />

        {/* Priority */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Priority</div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                priority: parseInt(e.target.value) 
              }))}
              className="flex-1"
            />
            <Badge variant="outline" className="w-12 text-center">
              {formData.priority}
            </Badge>
          </div>
        </div>

        {/* Planning Mode Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Quick Planning (MCII-lite)</div>
            <Switch
              checked={showPlanningMode}
              onCheckedChange={setShowPlanningMode}
            />
          </div>
          
          {showPlanningMode && (
            <div className="space-y-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <Input
                placeholder="Wish: What do you want to achieve? (1 sentence)"
                value={planningData.wish}
                onChange={(e) => setPlanningData(prev => ({ ...prev, wish: e.target.value }))}
              />
              <Input
                placeholder="Outcome: Why does this matter? (1 sentence)"
                value={planningData.outcome}
                onChange={(e) => setPlanningData(prev => ({ ...prev, outcome: e.target.value }))}
              />
              <Input
                placeholder="Obstacle: What might get in the way? (1 phrase)"
                value={planningData.obstacle}
                onChange={(e) => setPlanningData(prev => ({ ...prev, obstacle: e.target.value }))}
              />
              <Input
                placeholder="Plan: If [obstacle], then I will... (implementation intention)"
                value={planningData.plan}
                onChange={(e) => setPlanningData(prev => ({ ...prev, plan: e.target.value }))}
              />
              {planningData.plan && (
                <Button size="sm" variant="outline" className="text-xs">
                  Convert to Calendar Reminder
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            {formData.id && onDelete && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                Delete
              </Button>
            )}
          </div>
          <Button onClick={handleSave}>
            {formData.id ? 'Update Task' : 'Create Task'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}