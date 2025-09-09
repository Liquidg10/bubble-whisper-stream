import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Clock, 
  Plus, 
  Trash2, 
  GripVertical, 
  Edit3, 
  CheckCircle,
  AlertCircle,
  Play
} from 'lucide-react';
import { GeneratedPlan, PlanStep } from '@/services/planGenerationService';

interface PlanEditorProps {
  plan: GeneratedPlan;
  onPlanUpdate: (updatedPlan: GeneratedPlan) => void;
  onImplement: () => void;
  className?: string;
}

export const PlanEditor: React.FC<PlanEditorProps> = ({
  plan,
  onPlanUpdate,
  onImplement,
  className = ''
}) => {
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);

  const updatePlan = (updates: Partial<GeneratedPlan>) => {
    onPlanUpdate({ ...plan, ...updates });
  };

  const updateStep = (stepId: string, updates: Partial<PlanStep>) => {
    const updatedSteps = plan.steps.map(step =>
      step.id === stepId ? { ...step, ...updates } : step
    );
    updatePlan({ 
      steps: updatedSteps,
      totalEstimatedMinutes: updatedSteps.reduce((total, step) => total + step.estimatedMinutes, 0)
    });
  };

  const addStep = (afterIndex?: number) => {
    const newStep: PlanStep = {
      id: `step-${crypto.randomUUID().slice(0, 8)}`,
      title: 'New Step',
      description: '',
      estimatedMinutes: 15,
      priority: 'medium',
      category: 'action',
      flexible: true
    };

    const insertIndex = afterIndex !== undefined ? afterIndex + 1 : plan.steps.length;
    const updatedSteps = [
      ...plan.steps.slice(0, insertIndex),
      newStep,
      ...plan.steps.slice(insertIndex)
    ];

    updatePlan({ 
      steps: updatedSteps,
      totalEstimatedMinutes: updatedSteps.reduce((total, step) => total + step.estimatedMinutes, 0)
    });
    setEditingStep(newStep.id);
  };

  const removeStep = (stepId: string) => {
    const updatedSteps = plan.steps.filter(step => step.id !== stepId);
    updatePlan({ 
      steps: updatedSteps,
      totalEstimatedMinutes: updatedSteps.reduce((total, step) => total + step.estimatedMinutes, 0)
    });
  };

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    const currentIndex = plan.steps.findIndex(step => step.id === stepId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= plan.steps.length) return;

    const updatedSteps = [...plan.steps];
    [updatedSteps[currentIndex], updatedSteps[newIndex]] = [updatedSteps[newIndex], updatedSteps[currentIndex]];
    
    updatePlan({ steps: updatedSteps });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'preparation': return <AlertCircle className="h-3 w-3" />;
      case 'action': return <Play className="h-3 w-3" />;
      case 'review': return <CheckCircle className="h-3 w-3" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          {editingPlan ? (
            <div className="flex-1 space-y-2">
              <Input
                value={plan.title}
                onChange={(e) => updatePlan({ title: e.target.value })}
                className="font-semibold"
                placeholder="Plan title"
              />
              <Textarea
                value={plan.description}
                onChange={(e) => updatePlan({ description: e.target.value })}
                placeholder="Plan description"
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setEditingPlan(false)}>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{plan.title}</CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setEditingPlan(true)}
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
              <div className="flex items-center gap-4 mt-2">
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {Math.round(plan.totalEstimatedMinutes)} min total
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {plan.steps.length} steps
                </Badge>
                <Badge variant="outline" className="text-xs capitalize">
                  {plan.category}
                </Badge>
              </div>
            </div>
          )}
          
          <Button onClick={onImplement} className="ml-4">
            <CheckCircle className="h-4 w-4 mr-2" />
            Implement Plan
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {plan.steps.map((step, index) => (
          <div key={step.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
              <span className="text-sm font-medium text-muted-foreground">
                {index + 1}.
              </span>
              
              {editingStep === step.id ? (
                <div className="flex-1 space-y-2">
                  <Input
                    value={step.title}
                    onChange={(e) => updateStep(step.id, { title: e.target.value })}
                    placeholder="Step title"
                    className="font-medium"
                  />
                  <Textarea
                    value={step.description || ''}
                    onChange={(e) => updateStep(step.id, { description: e.target.value })}
                    placeholder="Step description (optional)"
                    className="text-sm"
                  />
                </div>
              ) : (
                <div className="flex-1">
                  <h4 className="font-medium">{step.title}</h4>
                  {step.description && (
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${getPriorityColor(step.priority)}`}>
                  {getCategoryIcon(step.category)}
                  <span className="ml-1">{step.priority}</span>
                </Badge>
                
                <div className="flex items-center gap-1 text-sm">
                  <Clock className="h-3 w-3" />
                  <span>{step.estimatedMinutes}m</span>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingStep(editingStep === step.id ? null : step.id)}
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeStep(step.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {editingStep === step.id && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Duration (minutes)</label>
                  <Slider
                    value={[step.estimatedMinutes]}
                    onValueChange={([value]) => updateStep(step.id, { estimatedMinutes: value })}
                    min={5}
                    max={120}
                    step={5}
                    className="w-full"
                  />
                  <div className="text-xs text-center">{step.estimatedMinutes} min</div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-medium">Priority</label>
                  <Select 
                    value={step.priority} 
                    onValueChange={(value: 'low' | 'medium' | 'high') => 
                      updateStep(step.id, { priority: value })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-medium">Category</label>
                  <Select 
                    value={step.category} 
                    onValueChange={(value: 'preparation' | 'action' | 'review' | 'followup') => 
                      updateStep(step.id, { category: value })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preparation">Preparation</SelectItem>
                      <SelectItem value="action">Action</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="followup">Follow-up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 md:col-span-3">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => addStep(index)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Step After
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => setEditingStep(null)}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Done Editing
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        <Button
          variant="outline"
          onClick={() => addStep()}
          className="w-full border-dashed border-2 h-12"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Step
        </Button>
      </CardContent>
    </Card>
  );
};