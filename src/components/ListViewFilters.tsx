import React, { useState, useRef, useEffect } from 'react';
import { Task, TaskType } from '@/types/task';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Filter, X, SortAsc, SortDesc } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ListViewFiltersProps {
  tasks: Task[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  taskTypeFilter: TaskType | 'all';
  onTaskTypeChange: (type: TaskType | 'all') => void;
  completionFilter: 'all' | 'pending' | 'completed';
  onCompletionFilterChange: (filter: 'all' | 'pending' | 'completed') => void;
  sortBy: 'priority' | 'due' | 'created' | 'updated';
  onSortChange: (sort: 'priority' | 'due' | 'created' | 'updated') => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (order: 'asc' | 'desc') => void;
  onFocusSearch: boolean;
  className?: string;
}

export const ListViewFilters: React.FC<ListViewFiltersProps> = ({
  tasks,
  searchQuery,
  onSearchChange,
  selectedTags,
  onTagsChange,
  taskTypeFilter,
  onTaskTypeChange,
  completionFilter,
  onCompletionFilterChange,
  sortBy,
  onSortChange,
  sortOrder,
  onSortOrderChange,
  onFocusSearch,
  className
}) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Focus search when requested
  useEffect(() => {
    if (onFocusSearch && searchRef.current) {
      searchRef.current.focus();
    }
  }, [onFocusSearch]);

  // Get unique tags from all tasks
  const availableTags = React.useMemo(() => {
    const tagMap = new Map();
    tasks.forEach(task => {
      task.tags.forEach(tag => {
        if (!tagMap.has(tag.id)) {
          tagMap.set(tag.id, tag);
        }
      });
    });
    return Array.from(tagMap.values());
  }, [tasks]);

  // Get task type counts
  const taskTypeCounts = React.useMemo(() => {
    const counts = tasks.reduce((acc, task) => {
      acc[task.type] = (acc[task.type] || 0) + 1;
      return acc;
    }, {} as Record<TaskType, number>);
    return counts;
  }, [tasks]);

  const handleTagToggle = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onTagsChange(selectedTags.filter(id => id !== tagId));
    } else {
      onTagsChange([...selectedTags, tagId]);
    }
  };

  const clearFilters = () => {
    onSearchChange('');
    onTagsChange([]);
    onTaskTypeChange('all');
    onCompletionFilterChange('all');
  };

  const hasActiveFilters = searchQuery || selectedTags.length > 0 || taskTypeFilter !== 'all' || completionFilter !== 'all';

  return (
    <div className={cn('space-y-3 p-3 bg-card/50 rounded-lg border', className)}>
      {/* Search and Main Controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="text"
            placeholder="Search tasks... (Press / to focus)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-9"
            aria-label="Search tasks"
          />
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'h-9 px-3',
            showFilters && 'bg-accent text-accent-foreground'
          )}
          aria-label="Toggle filters"
        >
          <Filter className="w-4 h-4" />
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 px-3 text-muted-foreground hover:text-foreground"
            aria-label="Clear all filters"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Completion Status Filter */}
      <Tabs value={completionFilter} onValueChange={onCompletionFilterChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="all" className="text-xs">All Tasks</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
          <TabsTrigger value="completed" className="text-xs">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="space-y-3 pt-2 border-t border-border/50">
          {/* Task Type Filter */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Task Type</label>
            <Select value={taskTypeFilter} onValueChange={onTaskTypeChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types ({tasks.length})</SelectItem>
                <SelectItem value="task">✅ Tasks ({taskTypeCounts.task || 0})</SelectItem>
                <SelectItem value="thought">💭 Thoughts ({taskTypeCounts.thought || 0})</SelectItem>
                <SelectItem value="reminder">⏰ Reminders ({taskTypeCounts.reminder || 0})</SelectItem>
                <SelectItem value="memory">💾 Memories ({taskTypeCounts.memory || 0})</SelectItem>
                <SelectItem value="mood">🌙 Moods ({taskTypeCounts.mood || 0})</SelectItem>
                <SelectItem value="photo">📸 Photos ({taskTypeCounts.photo || 0})</SelectItem>
                <SelectItem value="event">📅 Events ({taskTypeCounts.event || 0})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tag Filter */}
          {availableTags.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Tags</label>
              <div className="flex flex-wrap gap-1">
                {availableTags.map(tag => (
                  <Badge
                    key={tag.id}
                    variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                    className={cn(
                      'text-xs cursor-pointer transition-colors',
                      selectedTags.includes(tag.id) && 'bg-accent-void text-white'
                    )}
                    onClick={() => handleTagToggle(tag.id)}
                    style={{ 
                      backgroundColor: selectedTags.includes(tag.id) ? tag.colorHex : undefined,
                      borderColor: tag.colorHex 
                    }}
                  >
                    {tag.emoji} {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Sort Options */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Sort By</label>
              <Select value={sortBy} onValueChange={onSortChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="due">Due Date</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Order</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="w-full h-8 justify-start text-xs"
              >
                {sortOrder === 'asc' ? (
                  <>
                    <SortAsc className="w-3 h-3 mr-2" />
                    Ascending
                  </>
                ) : (
                  <>
                    <SortDesc className="w-3 h-3 mr-2" />
                    Descending
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Summary */}
      {hasActiveFilters && (
        <div className="text-xs text-muted-foreground">
          Showing {tasks.length} task{tasks.length !== 1 ? 's' : ''} with active filters
        </div>
      )}
    </div>
  );
};