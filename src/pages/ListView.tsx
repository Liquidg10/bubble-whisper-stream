import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Task, TaskId, TaskType, createTask, updateTask } from '@/types/task';
import { useTaskStoreSync } from '@/stores/taskStore';
import { createViewContext, createViewData, ViewSDK } from '@/views/sdk';
import { ViewBus, ViewBusHelpers, useViewBusSubscription } from '@/views/bus';
import { TaskCard, TaskCardConfigs } from '@/components/TaskCard';
import { TaskDetail } from '@/components/TaskDetail';
import { TaskQuickAdd } from '@/components/TaskQuickAdd';
import { ListViewFilters } from '@/components/ListViewFilters';
import { BulkActions } from '@/components/BulkActions';
import { KeyboardCRUDHandler } from '@/components/KeyboardCRUDHandler';
import { PlanningModeStats } from '@/components/PlanningModeStats';
import { isFeatureEnabled } from '@/config/flags';
import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { List, Keyboard, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ListView: React.FC = () => {
  const taskStore = useTaskStoreSync();
  const [focusedTaskId, setFocusedTaskId] = useState<TaskId | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<TaskId>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskType | 'all'>('all');
  const [completionFilter, setCompletionFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'due' | 'created' | 'updated'>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [shouldFocusSearch, setShouldFocusSearch] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showPlanningStats, setShowPlanningStats] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<TaskId | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // Create ViewSDK context
  const viewContext = useMemo(() => createViewContext('main-list', 'list'), []);

  // Filter and sort tasks
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = taskStore.tasks.filter(task => {
      // Search filter
      if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Tag filter
      if (selectedTags.length > 0 && !task.tags.some(tag => selectedTags.includes(tag.id))) {
        return false;
      }

      // Task type filter
      if (taskTypeFilter !== 'all' && task.type !== taskTypeFilter) {
        return false;
      }

      // Completion filter
      if (completionFilter === 'pending' && task.completed) return false;
      if (completionFilter === 'completed' && !task.completed) return false;

      return true;
    });

    // Sort tasks
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'priority':
          comparison = a.priority - b.priority;
          break;
        case 'due':
          const aDue = a.due || Infinity;
          const bDue = b.due || Infinity;
          comparison = aDue - bDue;
          break;
        case 'created':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'updated':
          comparison = a.updatedAt - b.updatedAt;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [taskStore.tasks, searchQuery, selectedTags, taskTypeFilter, completionFilter, sortBy, sortOrder]);

  // Get selected tasks
  const selectedTasks = useMemo(() => {
    return filteredAndSortedTasks.filter(task => selectedTaskIds.has(task.id));
  }, [filteredAndSortedTasks, selectedTaskIds]);

  // Create ViewSDK data
  const viewData = useMemo(() => 
    createViewData(filteredAndSortedTasks, Array.from(selectedTaskIds)), 
    [filteredAndSortedTasks, selectedTaskIds]
  );

  // ViewSDK actions
  const viewActions = useMemo(() => ({
    async upsert(task: Task) {
      await taskStore.updateTask(task.id, task);
      ViewBus.emit('task.updated', ViewBusHelpers.createTaskUpdatedEvent(
        task, 
        viewContext
      ));
    },

    async bulkUpsert(tasks: Task[]) {
      for (const task of tasks) {
        await taskStore.updateTask(task.id, task);
        ViewBus.emit('task.updated', ViewBusHelpers.createTaskUpdatedEvent(
          task, 
          viewContext
        ));
      }
    },

    async remove(id: TaskId) {
      await taskStore.deleteTask(id);
      setSelectedTaskIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },

    focus(id: TaskId) {
      setFocusedTaskId(id);
    }
  }), [taskStore, viewContext]);

  // Complete ViewSDK
  const viewSDK: ViewSDK = {
    ctx: viewContext,
    data: viewData,
    actions: viewActions
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Slash key to focus search
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShouldFocusSearch(true);
        setTimeout(() => setShouldFocusSearch(false), 100);
      }

      // Ctrl+A to select all visible tasks
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelectedTaskIds(new Set(filteredAndSortedTasks.map(task => task.id)));
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        setSelectedTaskIds(new Set());
        setFocusedTaskId(null);
      }

      // F1 or ? to show keyboard help
      if (e.key === 'F1' || (e.key === '?' && !e.shiftKey)) {
        e.preventDefault();
        setShowKeyboardHelp(!showKeyboardHelp);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [filteredAndSortedTasks, showKeyboardHelp]);

  // Task navigation
  const handleTaskKeyDown = useCallback((e: React.KeyboardEvent, taskId: TaskId) => {
    const currentIndex = filteredAndSortedTasks.findIndex(task => task.id === taskId);
    
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const direction = e.key === 'ArrowUp' ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(filteredAndSortedTasks.length - 1, currentIndex + direction));
      
      if (nextIndex !== currentIndex) {
        setFocusedTaskId(filteredAndSortedTasks[nextIndex].id);
      }
    }
  }, [filteredAndSortedTasks]);

  // Event bus subscriptions
  useViewBusSubscription('task.updated', (event) => {
    // Refresh data when tasks are updated from other views
    if (event.source.viewId !== viewContext.viewId) {
      taskStore.refreshFromBubbleStore();
    }
  });

  // Emit view changed events
  useEffect(() => {
    ViewBus.emit('view.changed', ViewBusHelpers.createViewChangedEvent(
      viewContext.viewId,
      viewContext.mode,
      'activated'
    ));

    return () => {
      ViewBus.emit('view.changed', ViewBusHelpers.createViewChangedEvent(
        viewContext.viewId,
        viewContext.mode,
        'deactivated'
      ));
    };
  }, [viewContext]);

  // Task management handlers
  const handleAddTask = useCallback(async (newTask: Omit<Task, 'id'>) => {
    await taskStore.addTask(newTask);
  }, [taskStore]);

  const handleUpdateTask = useCallback(async (task: Task) => {
    await viewActions.upsert(task);
  }, [viewActions]);

  const handleDeleteTask = useCallback(async (id: TaskId) => {
    await viewActions.remove(id);
  }, [viewActions]);

  const handleBulkUpdateTasks = useCallback(async (tasks: Task[]) => {
    await viewActions.bulkUpsert(tasks);
  }, [viewActions]);

  const handleBulkDeleteTasks = useCallback(async (ids: TaskId[]) => {
    for (const id of ids) {
      await viewActions.remove(id);
    }
  }, [viewActions]);

  const handleToggleSelect = useCallback((id: TaskId) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    // Emit selection changed event
    ViewBus.emit('selection.changed', ViewBusHelpers.createSelectionChangedEvent(
      viewContext.viewId,
      selectedTaskIds.has(id) ? [] : [id],
      selectedTaskIds.has(id) ? [id] : [],
      viewContext
    ));
  }, [selectedTaskIds, viewContext]);

  const handleFocusTask = useCallback((id: TaskId) => {
    setFocusedTaskId(id);
    viewActions.focus(id);
  }, [viewActions]);

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  const handleEditTask = useCallback((id: TaskId) => {
    setEditingTaskId(id);
    // Focus on the task item to enable inline editing
    setTimeout(() => {
      const taskElement = document.querySelector(`[data-task-id="${id}"]`);
      if (taskElement) {
        const editButton = taskElement.querySelector('button[aria-label*="Edit"]') as HTMLElement;
        editButton?.click();
      }
    }, 0);
  }, []);

  if (!isFeatureEnabled('listView')) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <List className="w-12 h-12 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">List View</h2>
          <p className="text-sm text-muted-foreground">
            This feature is currently disabled. Enable it in settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-border/50 bg-card/50 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <List className="w-6 h-6 text-accent-flow" />
              <h1 className="text-xl font-semibold text-foreground">List View</h1>
              <Badge variant="secondary" className="text-xs">
                {filteredAndSortedTasks.length} task{filteredAndSortedTasks.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKeyboardHelp(!showKeyboardHelp)}
                className="h-8 px-2 text-xs"
                aria-label="Show keyboard shortcuts"
              >
                <Keyboard className="w-4 h-4 mr-1" />
                Shortcuts
              </Button>
              
              {isFeatureEnabled('planningMode') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPlanningStats(!showPlanningStats)}
                  className="h-8 px-2 text-xs"
                  aria-label="Show planning statistics"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Stats
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Add */}
        <div className="flex-shrink-0 p-4 border-b border-border/50">
          <TaskQuickAdd 
            onAdd={handleAddTask}
            autoFocus={true}
          />
        </div>

        {/* Filters */}
        <div className="flex-shrink-0 p-4 border-b border-border/50">
          <ListViewFilters
            tasks={taskStore.tasks}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            taskTypeFilter={taskTypeFilter}
            onTaskTypeChange={setTaskTypeFilter}
            completionFilter={completionFilter}
            onCompletionFilterChange={setCompletionFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            onFocusSearch={shouldFocusSearch}
          />
        </div>

        {/* Task List */}
        <div className="flex-1 relative">
          <div className="h-full overflow-auto">
            <div className="p-4 space-y-2">
              <AnimatePresence mode="popLayout">
                {filteredAndSortedTasks.map((task, index) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ 
                      duration: 0.2, 
                      delay: Math.min(index * 0.02, 0.1),
                      layout: { duration: 0.2 }
                    }}
                  >
                    <TaskCard
                      task={task}
                      viewConfig={TaskCardConfigs.list}
                      isSelected={selectedTaskIds.has(task.id)}
                      isFocused={focusedTaskId === task.id}
                      onUpdate={handleUpdateTask}
                      onDelete={handleDeleteTask}
                      onSelect={handleToggleSelect}
                      onOpenDetail={setDetailTask}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {filteredAndSortedTasks.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-12 text-muted-foreground"
                >
                  <List className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No tasks found</h3>
                  <p className="text-sm">
                    {searchQuery || selectedTags.length > 0 || taskTypeFilter !== 'all' || completionFilter !== 'all'
                      ? 'Try adjusting your filters or search query.'
                      : 'Create your first task using the form above.'}
                  </p>
                </motion.div>
              )}
            </div>
          </div>

          {/* Bulk Actions */}
          <BulkActions
            selectedTasks={selectedTasks}
            onUpdateTasks={handleBulkUpdateTasks}
            onDeleteTasks={handleBulkDeleteTasks}
            onClearSelection={clearSelection}
          />
        </div>

        {/* Keyboard CRUD Handler */}
        <KeyboardCRUDHandler
          tasks={filteredAndSortedTasks}
          focusedTaskId={focusedTaskId}
          selectedTaskIds={selectedTaskIds}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          onAdd={handleAddTask}
          onFocus={handleFocusTask}
          onToggleSelect={handleToggleSelect}
          onEdit={handleEditTask}
        />

        {/* Planning Mode Stats */}
        <PlanningModeStats
          show={showPlanningStats}
          onClose={() => setShowPlanningStats(false)}
        />

        {/* Keyboard Help Overlay */}
        <AnimatePresence>
          {showKeyboardHelp && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
              onClick={() => setShowKeyboardHelp(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-card border border-border rounded-lg p-6 max-w-md mx-4 max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Keyboard className="w-5 h-5 text-accent-flow" />
                  <h3 className="text-lg font-semibold">Keyboard Shortcuts</h3>
                </div>
                
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="font-medium">Navigation</div>
                    <div></div>
                    
                    <div className="text-muted-foreground">↑/↓ Arrow</div>
                    <div>Move between tasks</div>
                    
                    <div className="text-muted-foreground">Tab</div>
                    <div>Navigate controls</div>
                    
                    <div className="text-muted-foreground">/</div>
                    <div>Focus search</div>
                    
                    <div className="font-medium mt-3">Actions</div>
                    <div></div>
                    
                    <div className="text-muted-foreground">Space</div>
                    <div>Toggle completion</div>
                    
                    <div className="text-muted-foreground">E</div>
                    <div>Edit task</div>
                    
                    <div className="text-muted-foreground">Enter</div>
                    <div>Edit task</div>
                    
                    <div className="text-muted-foreground">Ctrl+Enter</div>
                    <div>Select task</div>
                    
                    <div className="text-muted-foreground">Shift+Delete</div>
                    <div>Delete task</div>
                    
                    <div className="font-medium mt-3">Selection</div>
                    <div></div>
                    
                    <div className="text-muted-foreground">Ctrl+A</div>
                    <div>Select all</div>
                    
                    <div className="text-muted-foreground">Escape</div>
                    <div>Clear selection</div>
                    
                    <div className="text-muted-foreground">F1 or ?</div>
                    <div>Show this help</div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border">
                  <Button 
                    onClick={() => setShowKeyboardHelp(false)}
                    className="w-full"
                    size="sm"
                  >
                    Got it!
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TaskDetail Modal */}
        <TaskDetail
          task={detailTask}
          isOpen={!!detailTask}
          onClose={() => setDetailTask(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          view="list"
        />
      </div>
    </div>
  );
};