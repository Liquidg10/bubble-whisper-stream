/**
 * Universal Task Editor - Single unified component for all task editing across views
 * Replaces multiple TaskCard components with one bulletproof implementation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { 
  Save, 
  X, 
  Trash2, 
  Calendar, 
  Mail, 
  Tag,
  Clock,
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  Sparkles
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { taskAwareAutoWriteService } from '@/services/taskAwareAutoWriteService';
import { autoWriteLadderService } from '@/services/autoWriteLadder';
import type { Task, TaskType, TaskViewMetadata } from '@/types/task';

interface ViewContext {
  view: 'bubble' | 'list' | 'kanban' | 'matrix' | 'atomic';
  constraints?: {
    maxTitle?: number;
    requiresPosition?: boolean;
    allowsTimeEstimate?: boolean;
  };
  defaults?: Partial<TaskViewMetadata>;
}

interface SmartSuggestion {
  id: string;
  type: 'priority' | 'calendar' | 'email' | 'breakdown' | 'timing';
  title: string;
  description: string;
  confidence: number;
  action: () => void;
  because: string;
}

interface UniversalTaskEditorProps {
  task?: Task;
  viewContext: ViewContext;
  onSave: (task: Omit<Task, 'id'> | Task) => Promise<void>;
  onCancel: () => void;
  onDelete?: (taskId: string) => Promise<void>;
  autoFocus?: boolean;
}

export const UniversalTaskEditor: React.FC<UniversalTaskEditorProps> = ({
  task,
  viewContext,
  onSave,
  onCancel,
  onDelete,
  autoFocus = false
}) => {
  const [formData, setFormData] = useState<Partial<Task>>({
    title: '',
    description: '',
    type: 'task' as TaskType,
    priority: 50,
    completed: false,
    tags: [],
    view: {},
    ...task
  });
  
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Auto-save effect
  useEffect(() => {
    if (!task?.id) return; // Don't auto-save new tasks
    
    const timeoutId = setTimeout(() => {
      handleSave(true); // Silent save
    }, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [formData.title, formData.description, formData.priority]);

  // Smart suggestions generation
  useEffect(() => {
    if (formData.title && formData.title.length > 3) {
      generateSmartSuggestions();
    }
  }, [formData.title, formData.description]);

  const generateSmartSuggestions = useCallback(async () => {
    const suggestions: SmartSuggestion[] = [];
    
    // Priority suggestion based on keywords
    const urgentKeywords = ['urgent', 'asap', 'deadline', 'important', 'critical'];
    const hasUrgentKeywords = urgentKeywords.some(keyword => 
      formData.title?.toLowerCase().includes(keyword) ||
      formData.description?.toLowerCase().includes(keyword)
    );
    
    if (hasUrgentKeywords && formData.priority < 80) {
      suggestions.push({
        id: 'priority-high',
        type: 'priority',
        title: 'Set High Priority',
        description: 'This task seems urgent based on the language used',
        confidence: 85,
        action: () => setFormData(prev => ({ ...prev, priority: 85 })),
        because: 'Detected urgency keywords in task content'
      });
    }
    
    // Calendar suggestion for time-bound tasks
    const timeKeywords = ['meeting', 'appointment', 'call', 'deadline', 'due'];
    const hasTimeKeywords = timeKeywords.some(keyword => 
      formData.title?.toLowerCase().includes(keyword)
    );
    
    if (hasTimeKeywords && !formData.due) {
      suggestions.push({
        id: 'calendar-event',
        type: 'calendar',
        title: 'Add to Calendar',
        description: 'This looks like a time-bound task',
        confidence: 75,
        action: () => {
          // Trigger auto-write evaluation
          if (task?.id) {
            taskAwareAutoWriteService.evaluateTask(formData as Task);
          }
        },
        because: 'Time-related keywords suggest this needs scheduling'
      });
    }
    
    // Email suggestion for communication tasks
    const emailKeywords = ['email', 'send', 'reply', 'contact', 'reach out'];
    const hasEmailKeywords = emailKeywords.some(keyword => 
      formData.title?.toLowerCase().includes(keyword)
    );
    
    if (hasEmailKeywords) {
      suggestions.push({
        id: 'email-draft',
        type: 'email',
        title: 'Draft Email',
        description: 'Create an email draft for this task',
        confidence: 70,
        action: () => {
          // Trigger email draft generation
          toast({
            title: "Email Draft",
            description: "Email draft generation coming soon!",
          });
        },
        because: 'Communication keywords detected'
      });
    }
    
    // Task breakdown for complex tasks
    if (formData.title && formData.title.length > 50 && !formData.description) {
      suggestions.push({
        id: 'breakdown',
        type: 'breakdown',
        title: 'Break Down Task',
        description: 'This seems like a complex task that could be broken down',
        confidence: 60,
        action: () => {
          const breakdown = `Suggested breakdown:\n• Step 1: [Define requirements]\n• Step 2: [Implementation]\n• Step 3: [Review and testing]`;
          setFormData(prev => ({ ...prev, description: breakdown }));
        },
        because: 'Long task title suggests complexity'
      });
    }
    
    setSmartSuggestions(suggestions);
  }, [formData.title, formData.description, formData.priority, formData.due, task?.id]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.title?.trim()) {
      newErrors.title = 'Title is required';
    }
    
    if (viewContext.constraints?.maxTitle && 
        formData.title && 
        formData.title.length > viewContext.constraints.maxTitle) {
      newErrors.title = `Title must be under ${viewContext.constraints.maxTitle} characters`;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (silent = false) => {
    if (!validateForm()) return;
    
    setSaving(true);
    
    try {
      // Apply view-specific metadata
      const taskData = {
        ...formData,
        view: {
          ...formData.view,
          ...viewContext.defaults
        }
      } as Task;
      
      await onSave(taskData);
      
      if (!silent) {
        toast({
          title: task?.id ? "Task Updated" : "Task Created",
          description: "Your changes have been saved.",
        });
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save task. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task?.id || !onDelete) return;
    
    try {
      await onDelete(task.id);
      toast({
        title: "Task Deleted",
        description: "Task has been removed.",
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Failed to delete task.",
        variant: "destructive"
      });
    }
  };

  const applySuggestion = (suggestion: SmartSuggestion) => {
    suggestion.action();
    toast({
      title: "Suggestion Applied",
      description: suggestion.because,
    });
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 80) return 'text-red-600';
    if (priority >= 60) return 'text-yellow-600';
    if (priority >= 40) return 'text-blue-600';
    return 'text-gray-600';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'border-green-200 bg-green-50';
    if (confidence >= 60) return 'border-yellow-200 bg-yellow-50';
    return 'border-gray-200 bg-gray-50';
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {task?.id ? 'Edit Task' : 'Create Task'}
          </h2>
          <div className="flex items-center gap-2">
            <Badge variant={viewContext.view === 'bubble' ? 'default' : 'secondary'}>
              {viewContext.view}
            </Badge>
            {formData.completed && (
              <Badge variant="default">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Completed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
            <TabsTrigger value="ai">AI Suggestions</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="What needs to be done?"
                className={errors.title ? 'border-red-500' : ''}
                autoFocus={autoFocus}
              />
              {errors.title && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.title}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Add more details..."
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Priority: {formData.priority}%</Label>
              <Slider
                value={[formData.priority || 50]}
                onValueChange={([value]) => setFormData(prev => ({ ...prev, priority: value }))}
                max={100}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Low</span>
                <span className={getPriorityColor(formData.priority || 50)}>
                  {formData.priority >= 80 ? 'Urgent' :
                   formData.priority >= 60 ? 'High' :
                   formData.priority >= 40 ? 'Medium' : 'Low'}
                </span>
                <span>High</span>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="advanced" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="due">Due Date</Label>
                <Input
                  id="due"
                  type="datetime-local"
                  value={formData.due ? new Date(formData.due).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    due: e.target.value ? new Date(e.target.value).getTime() : undefined 
                  }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  value={formData.type || 'task'}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as TaskType }))}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="task">Task</option>
                  <option value="thought">Thought</option>
                  <option value="memory">Memory</option>
                  <option value="reminder">Reminder</option>
                  <option value="event">Event</option>
                </select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {formData.tags?.map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="gap-1">
                    {tag.emoji} {tag.name}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        tags: prev.tags?.filter(t => t.id !== tag.id) || []
                      }))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
                <Button size="sm" variant="outline" className="gap-1">
                  <Tag className="h-3 w-3" />
                  Add Tag
                </Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="ai" className="space-y-4">
            {smartSuggestions.length === 0 ? (
              <div className="text-center py-8">
                <Lightbulb className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No AI suggestions available</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add more details to get intelligent suggestions
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {smartSuggestions.map((suggestion) => (
                  <Card key={suggestion.id} className={`p-3 ${getConfidenceColor(suggestion.confidence)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="p-2 rounded-full bg-primary/10">
                          {suggestion.type === 'calendar' && <Calendar className="h-4 w-4" />}
                          {suggestion.type === 'email' && <Mail className="h-4 w-4" />}
                          {suggestion.type === 'priority' && <AlertCircle className="h-4 w-4" />}
                          {suggestion.type === 'breakdown' && <Sparkles className="h-4 w-4" />}
                          {suggestion.type === 'timing' && <Clock className="h-4 w-4" />}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm">{suggestion.title}</h4>
                            <Badge variant="outline" className="text-xs">
                              {suggestion.confidence}%
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {suggestion.description}
                          </p>
                          <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                            <strong>Because:</strong> {suggestion.because}
                          </p>
                        </div>
                      </div>
                      
                      <Button
                        size="sm"
                        onClick={() => applySuggestion(suggestion)}
                        className="shrink-0"
                      >
                        Apply
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 border-t">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            
            {task?.id && onDelete && (
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
          
          <Button onClick={() => handleSave()} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Saving...' : task?.id ? 'Update' : 'Create'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};