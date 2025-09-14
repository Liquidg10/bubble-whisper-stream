/**
 * Personal Eisenhower Matrix - Phase 3 End-User Polish
 * Persistent urgency/importance definitions with drag-and-drop
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Target, 
  Clock, 
  AlertTriangle, 
  CheckCircle2,
  Settings,
  Plus,
  Trash2,
  Edit3,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowDownLeft,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

export interface EisenhowerTask {
  id: string;
  title: string;
  description?: string;
  quadrant: 'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important';
  urgency: number; // 0-100
  importance: number; // 0-100
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  estimatedTime?: number; // minutes
  dueDate?: Date;
}

export interface EisenhowerDefinition {
  name: string;
  urgencyThreshold: number;
  importanceThreshold: number;
  customCriteria: {
    urgency: string[];
    importance: string[];
  };
  updatedAt: Date;
}

interface PersonalEisenhowerProps {
  tasks?: EisenhowerTask[];
  onTaskMove?: (taskId: string, newQuadrant: EisenhowerTask['quadrant']) => void;
  onTaskUpdate?: (task: EisenhowerTask) => void;
  onDefinitionUpdate?: (definition: EisenhowerDefinition) => void;
  className?: string;
}

export function PersonalEisenhower({ 
  tasks: externalTasks, 
  onTaskMove,
  onTaskUpdate,
  onDefinitionUpdate,
  className 
}: PersonalEisenhowerProps) {
  const [tasks, setTasks] = useState<EisenhowerTask[]>(externalTasks || []);
  const [definition, setDefinition] = useState<EisenhowerDefinition>({
    name: 'Personal Matrix',
    urgencyThreshold: 70,
    importanceThreshold: 70,
    customCriteria: {
      urgency: ['Has deadline', 'Time-sensitive', 'Requested by others', 'External pressure'],
      importance: ['Aligns with goals', 'High impact', 'Strategic value', 'Personal growth']
    },
    updatedAt: new Date()
  });
  const [selectedQuadrant, setSelectedQuadrant] = useState<EisenhowerTask['quadrant'] | null>(null);
  const [showDefinitionEditor, setShowDefinitionEditor] = useState(false);
  const [newTask, setNewTask] = useState<Partial<EisenhowerTask>>({});

  useEffect(() => {
    if (externalTasks) {
      setTasks(externalTasks);
    } else {
      loadSampleTasks();
    }
    loadDefinitionFromStorage();
  }, [externalTasks]);

  const loadSampleTasks = () => {
    const sampleTasks: EisenhowerTask[] = [
      {
        id: 'task-1',
        title: 'Prepare quarterly report',
        description: 'Financial overview for Q4 board meeting',
        quadrant: 'urgent-important',
        urgency: 85,
        importance: 90,
        createdAt: new Date(Date.now() - 86400000),
        updatedAt: new Date(),
        tags: ['work', 'financial'],
        estimatedTime: 180,
        dueDate: new Date(Date.now() + 172800000) // 2 days
      },
      {
        id: 'task-2',
        title: 'Plan vacation',
        description: 'Research destinations and book flights',
        quadrant: 'not-urgent-important',
        urgency: 30,
        importance: 75,
        createdAt: new Date(Date.now() - 259200000),
        updatedAt: new Date(),
        tags: ['personal', 'planning'],
        estimatedTime: 120
      },
      {
        id: 'task-3',
        title: 'Respond to non-critical emails',
        description: 'Clear inbox of low-priority messages',
        quadrant: 'urgent-not-important',
        urgency: 75,
        importance: 25,
        createdAt: new Date(Date.now() - 3600000),
        updatedAt: new Date(),
        tags: ['admin', 'email'],
        estimatedTime: 45
      },
      {
        id: 'task-4',
        title: 'Organize digital photos',
        description: 'Sort and backup photos from last year',
        quadrant: 'not-urgent-not-important',
        urgency: 15,
        importance: 20,
        createdAt: new Date(Date.now() - 604800000),
        updatedAt: new Date(),
        tags: ['personal', 'organization'],
        estimatedTime: 240
      }
    ];
    setTasks(sampleTasks);
  };

  const loadDefinitionFromStorage = () => {
    try {
      const stored = localStorage.getItem('eisenhower-definition');
      if (stored) {
        setDefinition(JSON.parse(stored));
      }
    } catch (error) {
      console.warn('Failed to load Eisenhower definition from storage');
    }
  };

  const saveDefinitionToStorage = (def: EisenhowerDefinition) => {
    try {
      localStorage.setItem('eisenhower-definition', JSON.stringify(def));
    } catch (error) {
      console.warn('Failed to save Eisenhower definition to storage');
    }
  };

  const getQuadrantData = () => {
    return {
      'urgent-important': {
        title: 'Do First',
        subtitle: 'Urgent & Important',
        icon: <AlertTriangle className="h-5 w-5 text-red-600" />,
        color: 'border-red-200 bg-red-50 dark:bg-red-950/20',
        headerColor: 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100',
        tasks: tasks.filter(t => t.quadrant === 'urgent-important')
      },
      'not-urgent-important': {
        title: 'Schedule',
        subtitle: 'Important, Not Urgent',
        icon: <Target className="h-5 w-5 text-blue-600" />,
        color: 'border-blue-200 bg-blue-50 dark:bg-blue-950/20',
        headerColor: 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100',
        tasks: tasks.filter(t => t.quadrant === 'not-urgent-important')
      },
      'urgent-not-important': {
        title: 'Delegate',
        subtitle: 'Urgent, Not Important',
        icon: <Clock className="h-5 w-5 text-yellow-600" />,
        color: 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20',
        headerColor: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100',
        tasks: tasks.filter(t => t.quadrant === 'urgent-not-important')
      },
      'not-urgent-not-important': {
        title: 'Eliminate',
        subtitle: 'Neither Urgent nor Important',
        icon: <CheckCircle2 className="h-5 w-5 text-gray-600" />,
        color: 'border-gray-200 bg-gray-50 dark:bg-gray-950/20',
        headerColor: 'bg-gray-100 dark:bg-gray-900/30 text-gray-900 dark:text-gray-100',
        tasks: tasks.filter(t => t.quadrant === 'not-urgent-not-important')
      }
    };
  };

  const determineQuadrant = (urgency: number, importance: number): EisenhowerTask['quadrant'] => {
    const isUrgent = urgency >= definition.urgencyThreshold;
    const isImportant = importance >= definition.importanceThreshold;
    
    if (isUrgent && isImportant) return 'urgent-important';
    if (!isUrgent && isImportant) return 'not-urgent-important';
    if (isUrgent && !isImportant) return 'urgent-not-important';
    return 'not-urgent-not-important';
  };

  const handleTaskMove = (taskId: string, newQuadrant: EisenhowerTask['quadrant']) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, quadrant: newQuadrant, updatedAt: new Date() }
        : task
    ));
    onTaskMove?.(taskId, newQuadrant);
    toast.success('Task moved successfully');
  };

  const handleAddTask = () => {
    if (!newTask.title) return;

    const urgency = newTask.urgency || 50;
    const importance = newTask.importance || 50;
    const quadrant = determineQuadrant(urgency, importance);

    const task: EisenhowerTask = {
      id: `task-${Date.now()}`,
      title: newTask.title,
      description: newTask.description,
      quadrant,
      urgency,
      importance,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: newTask.tags || [],
      estimatedTime: newTask.estimatedTime
    };

    setTasks(prev => [...prev, task]);
    setNewTask({});
    toast.success('Task added successfully');
  };

  const handleDefinitionUpdate = (updates: Partial<EisenhowerDefinition>) => {
    const updated = { ...definition, ...updates, updatedAt: new Date() };
    setDefinition(updated);
    saveDefinitionToStorage(updated);
    onDefinitionUpdate?.(updated);
    toast.success('Matrix definition updated');
  };

  const quadrants = getQuadrantData();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {definition.name}
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={showDefinitionEditor} onOpenChange={setShowDefinitionEditor}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Customize
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Customize Matrix Definition</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="matrix-name">Matrix Name</Label>
                      <Input
                        id="matrix-name"
                        value={definition.name}
                        onChange={(e) => setDefinition(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., Work Priorities, Personal Tasks"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="urgency-threshold">Urgency Threshold ({definition.urgencyThreshold}%)</Label>
                        <Input
                          id="urgency-threshold"
                          type="range"
                          min="0"
                          max="100"
                          value={definition.urgencyThreshold}
                          onChange={(e) => setDefinition(prev => ({ ...prev, urgencyThreshold: Number(e.target.value) }))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <Label htmlFor="importance-threshold">Importance Threshold ({definition.importanceThreshold}%)</Label>
                        <Input
                          id="importance-threshold"
                          type="range"
                          min="0"
                          max="100"
                          value={definition.importanceThreshold}
                          onChange={(e) => setDefinition(prev => ({ ...prev, importanceThreshold: Number(e.target.value) }))}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Urgency Criteria</Label>
                        <Textarea
                          value={definition.customCriteria.urgency.join('\n')}
                          onChange={(e) => setDefinition(prev => ({
                            ...prev,
                            customCriteria: {
                              ...prev.customCriteria,
                              urgency: e.target.value.split('\n').filter(Boolean)
                            }
                          }))}
                          placeholder="Enter criteria, one per line"
                          rows={4}
                        />
                      </div>
                      <div>
                        <Label>Importance Criteria</Label>
                        <Textarea
                          value={definition.customCriteria.importance.join('\n')}
                          onChange={(e) => setDefinition(prev => ({
                            ...prev,
                            customCriteria: {
                              ...prev.customCriteria,
                              importance: e.target.value.split('\n').filter(Boolean)
                            }
                          }))}
                          placeholder="Enter criteria, one per line"
                          rows={4}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowDefinitionEditor(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => {
                        handleDefinitionUpdate(definition);
                        setShowDefinitionEditor(false);
                      }}>
                        Save Changes
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button size="sm" onClick={() => setNewTask({ title: '', urgency: 50, importance: 50 })}>
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Matrix Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(quadrants).map(([quadrantKey, quadrant]) => (
          <Card key={quadrantKey} className={`min-h-[300px] ${quadrant.color} bg-card/90 dark:bg-card/95 border-2`}>
            <CardHeader className={`${quadrant.headerColor} rounded-t-lg backdrop-blur-sm`}>
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  {quadrant.icon}
                  <div>
                    <div className="font-semibold">{quadrant.title}</div>
                    <div className="text-sm font-normal opacity-80">{quadrant.subtitle}</div>
                  </div>
                </div>
                <Badge variant="outline" className="bg-white/80">
                  {quadrant.tasks.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="p-4">
              <div className="space-y-3">
                {quadrant.tasks.map((task) => (
                  <Card key={task.id} className="p-3 bg-card dark:bg-card/95 hover:bg-accent dark:hover:bg-accent/90 transition-colors cursor-pointer border border-border/50">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">{task.title}</h4>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            U:{task.urgency}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            I:{task.importance}
                          </Badge>
                        </div>
                      </div>
                      
                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {task.tags?.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        
                        {task.estimatedTime && (
                          <div className="text-xs text-muted-foreground">
                            {task.estimatedTime}m
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
                
                {quadrant.tasks.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No tasks in this quadrant
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Task Modal */}
      {newTask.title !== undefined && (
        <Dialog open={true} onOpenChange={() => setNewTask({})}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="task-title">Title</Label>
                <Input
                  id="task-title"
                  value={newTask.title || ''}
                  onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Task title"
                />
              </div>
              
              <div>
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={newTask.description || ''}
                  onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="task-urgency">Urgency ({newTask.urgency || 50}%)</Label>
                  <Input
                    id="task-urgency"
                    type="range"
                    min="0"
                    max="100"
                    value={newTask.urgency || 50}
                    onChange={(e) => setNewTask(prev => ({ ...prev, urgency: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label htmlFor="task-importance">Importance ({newTask.importance || 50}%)</Label>
                  <Input
                    id="task-importance"
                    type="range"
                    min="0"
                    max="100"
                    value={newTask.importance || 50}
                    onChange={(e) => setNewTask(prev => ({ ...prev, importance: Number(e.target.value) }))}
                  />
                </div>
              </div>
              
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="text-sm">
                  <strong>Will be placed in:</strong>{' '}
                  {quadrants[determineQuadrant(newTask.urgency || 50, newTask.importance || 50)].title}
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setNewTask({})}>
                  Cancel
                </Button>
                <Button onClick={handleAddTask} disabled={!newTask.title}>
                  Add Task
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}