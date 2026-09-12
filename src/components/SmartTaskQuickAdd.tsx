import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2 } from 'lucide-react';
import { createTask } from '@/types/task';
import { useTaskStoreSync } from '@/stores/taskStore';
import { deriveTaskDefaults, type DerivationContext, type SmartDefaults } from '@/services/smartDefaultsService';
import { createViewContext } from '@/views/sdk';
import { BecausePill } from '@/components/SmartBecausePill';

export function SmartTaskQuickAdd({ onCreated }: { onCreated?: (id: string) => void } = {}) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [smartDefaults, setSmartDefaults] = useState<null | SmartDefaults>(null);
  const taskStore = useTaskStoreSync();

  const handleInputChange = useCallback(async (value: string) => {
    setInput(value);
    
    // Generate smart defaults as user types (debounced)
    if (value.trim().length > 3) {
      try {
        const context: DerivationContext = {
          inputText: value,
          viewContext: createViewContext('task-quick-add', 'list'),
          existingTasks: taskStore.tasks,
          currentTime: Date.now()
        };
        
        const defaults = await deriveTaskDefaults(context);
        setSmartDefaults(defaults);
      } catch (error) {
        console.error('Failed to derive smart defaults:', error);
        setSmartDefaults(null);
      }
    } else {
      setSmartDefaults(null);
    }
  }, [taskStore.tasks]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setSaveError('');
    
    try {
      // Use smart defaults if available
      const context: DerivationContext = {
        inputText: input.trim(),
        viewContext: createViewContext('task-quick-add', 'list'),
        existingTasks: taskStore.tasks,
        currentTime: Date.now()
      };
      
      const defaults = await deriveTaskDefaults(context);
      
      const newTask = createTask(input.trim(), defaults.type || 'task', {
        priority: defaults.priority || 50,
        tags: defaults.tags || [],
        due: defaults.due,
        view: defaults.view
      });

      const created = await taskStore.addTask(newTask);
      setInput('');
      setSmartDefaults(null);
      onCreated?.(created.id);
    } catch (error) {
      console.error('Failed to create task:', error);
      setSaveError('This task could not be saved. Your words are still here; please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, taskStore, onCreated]);

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="text"
          placeholder="What would you like to do?"
          aria-label="New task"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          disabled={isLoading}
          className="min-h-11 min-w-0 flex-1"
        />
        <Button 
          type="submit" 
          disabled={!input.trim() || isLoading}
          size="sm"
          className="min-h-11 gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </Button>
      </form>
      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}

      {/* Smart Defaults Preview */}
      {smartDefaults && input.trim().length > 3 && (
        <div className="p-3 bg-muted/30 rounded-md border border-border/50">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-muted-foreground">Smart Defaults Applied:</span>
            <BecausePill explanation={smartDefaults.explanation} />
          </div>
          
          <div className="flex flex-wrap gap-2 text-xs">
            {smartDefaults.priority !== undefined && (
              <Badge variant="outline" className="gap-1">
                Priority: {smartDefaults.priority}/100
              </Badge>
            )}
            
            {smartDefaults.type && smartDefaults.type !== 'task' && (
              <Badge variant="outline" className="gap-1">
                Type: {smartDefaults.type}
              </Badge>
            )}
            
            {smartDefaults.tags && smartDefaults.tags.length > 0 && (
              <Badge variant="outline" className="gap-1">
                Tags: {smartDefaults.tags.map(t => `${t.emoji} ${t.name}`).join(', ')}
              </Badge>
            )}
            
            {smartDefaults.due && (
              <Badge variant="outline" className="gap-1">
                Due: {new Date(smartDefaults.due).toLocaleDateString()}
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
