/**
 * Kanban Columns Management Hook
 * Handles column persistence and configuration
 */

import { useState, useEffect, useCallback } from 'react';

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog', color: 'hsl(var(--muted))' },
  { id: 'next', title: 'Next', color: 'hsl(var(--primary-accent))' },
  { id: 'doing', title: 'Doing', color: 'hsl(var(--accent-flow))' },
  { id: 'done', title: 'Done', color: 'hsl(var(--success))' }
];

const STORAGE_KEY = 'kanban-columns';

export function useKanbanColumns() {
  const [columns, setColumns] = useState<KanbanColumn[]>(DEFAULT_COLUMNS);

  // Load columns from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsedColumns = JSON.parse(stored);
        if (Array.isArray(parsedColumns) && parsedColumns.length > 0) {
          setColumns(parsedColumns);
        }
      }
    } catch (error) {
      console.warn('Failed to load kanban columns from storage:', error);
    }
  }, []);

  // Save columns to localStorage whenever they change
  const saveColumns = useCallback((newColumns: KanbanColumn[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newColumns));
      setColumns(newColumns);
    } catch (error) {
      console.warn('Failed to save kanban columns to storage:', error);
    }
  }, []);

  // Update a specific column
  const updateColumn = useCallback((columnId: string, updates: Partial<KanbanColumn>) => {
    const newColumns = columns.map(col =>
      col.id === columnId ? { ...col, ...updates } : col
    );
    saveColumns(newColumns);
  }, [columns, saveColumns]);

  // Reset to default columns
  const resetColumns = useCallback(() => {
    saveColumns(DEFAULT_COLUMNS);
  }, [saveColumns]);

  return {
    columns,
    updateColumn,
    resetColumns,
    saveColumns
  };
}