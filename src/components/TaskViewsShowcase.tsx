/**
 * Task Views Showcase - Demonstrates all implemented views
 * Shows List, Kanban, Matrix views working with unified Task system
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  List, 
  Grid3X3, 
  Target, 
  Plus, 
  Search, 
  Filter,
  ArrowUp,
  ArrowDown,
  Circle,
  CheckCircle2
} from 'lucide-react';
import { UniversalTaskCard } from './UniversalTaskCard';
import type { Task } from '@/types/task';

interface MockTask extends Task {
  id: string;
  title: string;
  completed: boolean;
  priority: number;
  tags: Array<{id: string; name: string; emoji?: string}>;
  type: 'task';
  createdAt: number;
  updatedAt: number;
  view?: {
    list?: { order: number; group?: string };
    kanban?: { boardId: string; columnId: string; pos: number };
    matrix?: { urgency: 0|1|2|3; importance: 0|1|2|3; quadrant: 1|2|3|4 };
  };
}

const MOCK_TASKS: MockTask[] = [
  {
    id: 'task-1',
    title: 'Review quarterly goals and adjust targets',
    completed: false,
    priority: 85,
    tags: [{ id: '1', name: 'planning', emoji: '📋' }],
    type: 'task',
    createdAt: Date.now() - 24*60*60*1000,
    updatedAt: Date.now(),
    view: {
      list: { order: 1 },
      kanban: { boardId: 'main', columnId: 'doing', pos: 1 },
      matrix: { urgency: 3, importance: 3, quadrant: 1 }
    }
  },
  {
    id: 'task-2', 
    title: 'Call mom to check in',
    completed: false,
    priority: 60,
    tags: [{ id: '2', name: 'personal', emoji: '💕' }],
    type: 'task',
    createdAt: Date.now() - 12*60*60*1000,
    updatedAt: Date.now(),
    view: {
      list: { order: 2 },
      kanban: { boardId: 'main', columnId: 'todo', pos: 1 },
      matrix: { urgency: 1, importance: 2, quadrant: 3 }
    }
  },
  {
    id: 'task-3',
    title: 'Update project documentation',
    completed: true,
    priority: 70,
    tags: [{ id: '3', name: 'work', emoji: '💼' }],
    type: 'task',
    createdAt: Date.now() - 6*60*60*1000,
    updatedAt: Date.now(),
    view: {
      list: { order: 3 },
      kanban: { boardId: 'main', columnId: 'done', pos: 1 },
      matrix: { urgency: 2, importance: 2, quadrant: 4 }
    }
  },
  {
    id: 'task-4',
    title: 'Research new productivity tools',
    completed: false,
    priority: 40,
    tags: [{ id: '4', name: 'research', emoji: '🔍' }],
    type: 'task',
    createdAt: Date.now() - 2*60*60*1000,
    updatedAt: Date.now(),
    view: {
      list: { order: 4 },
      kanban: { boardId: 'main', columnId: 'backlog', pos: 1 },
      matrix: { urgency: 1, importance: 1, quadrant: 4 }
    }
  }
];

export function TaskViewsShowcase() {
  const [tasks, setTasks] = useState<MockTask[]>(MOCK_TASKS);
  const [showTaskCard, setShowTaskCard] = useState(false);
  const [editingTask, setEditingTask] = useState<MockTask | null>(null);
  const [activeView, setActiveView] = useState<'list' | 'kanban' | 'matrix'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTasks = tasks.filter(task => 
    task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.tags.some(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleTaskSave = (taskData: Task) => {
    const newTask: MockTask = {
      ...taskData,
      id: taskData.id || `task-${Date.now()}`,
      tags: taskData.tags || [],
      type: 'task',
      createdAt: taskData.createdAt || Date.now(),
      updatedAt: Date.now()
    } as MockTask;

    if (editingTask) {
      setTasks(prev => prev.map(t => t.id === newTask.id ? newTask : t));
    } else {
      setTasks(prev => [...prev, newTask]);
    }

    setShowTaskCard(false);
    setEditingTask(null);
  };

  const handleTaskToggle = (taskId: string) => {
    setTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };

  const getPriorityColor = (priority: number): string => {
    if (priority >= 80) return 'text-red-600';
    if (priority >= 60) return 'text-yellow-600';
    return 'text-green-600';
  };

  const ListView = () => (
    <div className="space-y-2">
      {filteredTasks
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .map(task => (
          <Card key={task.id} className="p-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleTaskToggle(task.id)}
                className="p-0 h-6 w-6"
              >
                {task.completed ? 
                  <CheckCircle2 className="h-5 w-5 text-primary" /> : 
                  <Circle className="h-5 w-5 text-muted-foreground" />
                }
              </Button>
              
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                  {task.title}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    Priority: {task.priority}
                  </Badge>
                  {task.tags.map(tag => (
                    <Badge key={tag.id} variant="secondary" className="text-xs">
                      {tag.emoji} {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className={`text-sm font-medium ${getPriorityColor(task.priority)}`}>
                {task.priority}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingTask(task);
                  setShowTaskCard(true);
                }}
              >
                Edit
              </Button>
            </div>
          </Card>
        ))}
    </div>
  );

  const KanbanView = () => {
    const columns = [
      { id: 'backlog', name: 'Backlog', tasks: filteredTasks.filter(t => t.view?.kanban?.columnId === 'backlog') },
      { id: 'todo', name: 'To Do', tasks: filteredTasks.filter(t => t.view?.kanban?.columnId === 'todo') },
      { id: 'doing', name: 'Doing', tasks: filteredTasks.filter(t => t.view?.kanban?.columnId === 'doing') },
      { id: 'done', name: 'Done', tasks: filteredTasks.filter(t => t.view?.kanban?.columnId === 'done') }
    ];

    return (
      <div className="grid grid-cols-4 gap-4">
        {columns.map(column => (
          <div key={column.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{column.name}</h3>
              <Badge variant="outline">{column.tasks.length}</Badge>
            </div>
            <div className="space-y-2">
              {column.tasks.map(task => (
                <Card key={task.id} className="p-3">
                  <div className="space-y-2">
                    <div className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                      {task.title}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {task.tags.map(tag => (
                          <Badge key={tag.id} variant="secondary" className="text-xs">
                            {tag.emoji}
                          </Badge>
                        ))}
                      </div>
                      <div className={`text-xs ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const MatrixView = () => {
    const quadrants = [
      { id: 1, name: 'Do First', color: 'bg-red-50 border-red-200', urgent: true, important: true },
      { id: 2, name: 'Schedule', color: 'bg-yellow-50 border-yellow-200', urgent: false, important: true },
      { id: 3, name: 'Delegate', color: 'bg-blue-50 border-blue-200', urgent: true, important: false },
      { id: 4, name: 'Eliminate', color: 'bg-gray-50 border-gray-200', urgent: false, important: false }
    ];

    return (
      <div className="grid grid-cols-2 gap-4 h-[600px]">
        {quadrants.map(quadrant => {
          const quadrantTasks = filteredTasks.filter(t => t.view?.matrix?.quadrant === quadrant.id);
          
          return (
            <Card key={quadrant.id} className={`p-4 ${quadrant.color}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">{quadrant.name}</h3>
                <Badge variant="outline">{quadrantTasks.length}</Badge>
              </div>
              
              <div className="space-y-2">
                {quadrantTasks.map(task => (
                  <Card key={task.id} className="p-2 bg-background">
                    <div className="text-sm font-medium">{task.title}</div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex gap-1">
                        {task.tags.map(tag => (
                          <span key={tag.id} className="text-xs">
                            {tag.emoji}
                          </span>
                        ))}
                      </div>
                      <span className={`text-xs ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Task Views Showcase</h1>
          <p className="text-on-surface-variant">
            Unified Task system working across List, Kanban, and Matrix views
          </p>
        </div>
        <Button onClick={() => setShowTaskCard(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks and tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Task Views */}
      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="list" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            List View
          </TabsTrigger>
          <TabsTrigger value="kanban" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            Kanban Board
          </TabsTrigger>
          <TabsTrigger value="matrix" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Priority Matrix
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <ListView />
        </TabsContent>

        <TabsContent value="kanban" className="mt-6">
          <KanbanView />
        </TabsContent>

        <TabsContent value="matrix" className="mt-6">
          <MatrixView />
        </TabsContent>
      </Tabs>

      {/* Task Creation/Edit Modal */}
      {showTaskCard && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <UniversalTaskCard
            task={editingTask || undefined}
            viewContext={{
              viewId: 'showcase',
              mode: activeView === 'list' ? 'list' : activeView === 'kanban' ? 'kanban' : 'matrix'
            }}
            onSave={handleTaskSave}
            onCancel={() => {
              setShowTaskCard(false);
              setEditingTask(null);
            }}
          />
        </div>
      )}

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Task Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{tasks.length}</div>
              <div className="text-sm text-muted-foreground">Total Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {tasks.filter(t => t.completed).length}
              </div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {tasks.filter(t => !t.completed && t.priority >= 70).length}
              </div>
              <div className="text-sm text-muted-foreground">High Priority</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)}%
              </div>
              <div className="text-sm text-muted-foreground">Completion Rate</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}