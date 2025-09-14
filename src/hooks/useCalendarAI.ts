/**
 * Calendar AI Integration Hook
 * Provides AI-powered calendar features with real data integration
 */

import { useState, useEffect, useMemo } from 'react';
import { useTaskStore } from '@/stores/taskStore';
import { calendarSpacingService } from '@/services/calendarSpacingService';
import { behavioralScienceEngine } from '@/services/behavioralScienceEngine';
import { shouldShowFeature } from '@/utils/gradualRollout';
import { Task } from '@/types/task';

interface CalendarAIState {
  isEnabled: boolean;
  suggestions: any[];
  stressLevel: number;
  densityMetrics: {
    totalHours: number;
    eventCount: number;
    isPacked: boolean;
  };
  confidenceScores: Record<string, number>;
}

export function useCalendarAI(selectedDate?: Date) {
  const { tasks } = useTaskStore();
  const [aiState, setAIState] = useState<CalendarAIState>({
    isEnabled: false,
    suggestions: [],
    stressLevel: 0,
    densityMetrics: { totalHours: 0, eventCount: 0, isPacked: false },
    confidenceScores: {}
  });

  // Check if user should see calendar AI features
  const isAIEnabled = useMemo(() => {
    return shouldShowFeature('calendarAI');
  }, []);

  // Get tasks for selected date
  const dateEvents = useMemo(() => {
    if (!selectedDate) return [];
    
    return tasks
      .filter(task => {
        if (task.view?.calendar?.startTime) {
          const startTime = new Date(task.view.calendar.startTime);
          return startTime.toDateString() === selectedDate.toDateString();
        }
        if (task.due) {
          const dueDate = new Date(task.due);
          return dueDate.toDateString() === selectedDate.toDateString();
        }
        return false;
      })
      .map(task => {
        const startTime = task.view?.calendar?.startTime 
          ? new Date(task.view.calendar.startTime)
          : new Date(task.due!);
        const endTime = task.view?.calendar?.durationMin
          ? new Date(startTime.getTime() + (task.view.calendar.durationMin * 60 * 1000))
          : new Date(startTime.getTime() + 60 * 60 * 1000);
        
        return {
          id: task.id,
          title: task.title,
          start: startTime,
          end: endTime,
          priority: task.priority,
          isFlexible: false // Calendar view doesn't have isFlexible property yet
        };
      });
  }, [tasks, selectedDate]);

  // Update AI state when date or events change
  useEffect(() => {
    if (!isAIEnabled || !selectedDate) {
      setAIState(prev => ({ ...prev, isEnabled: false }));
      return;
    }

    // Calculate density metrics
    const totalMinutes = dateEvents.reduce((sum, event) => {
      const duration = event.end.getTime() - event.start.getTime();
      return sum + duration / (1000 * 60);
    }, 0);
    
    const totalHours = totalMinutes / 60;
    const isPacked = totalHours > 6;
    
    // Get current stress level
    const stressLevel = behavioralScienceEngine.detectStressLevel();
    
    // Generate spacing suggestions
    const suggestions = calendarSpacingService.generateSpacingSuggestions(
      selectedDate, 
      dateEvents, 
      3
    );

    // Calculate confidence scores for suggestions
    const confidenceScores: Record<string, number> = {};
    suggestions.forEach(suggestion => {
      confidenceScores[suggestion.id] = suggestion.confidence;
    });

    setAIState({
      isEnabled: true,
      suggestions,
      stressLevel,
      densityMetrics: {
        totalHours,
        eventCount: dateEvents.length,
        isPacked
      },
      confidenceScores
    });
  }, [isAIEnabled, selectedDate, dateEvents]);

  return {
    ...aiState,
    dateEvents,
    refreshSuggestions: () => {
      if (selectedDate) {
        const newSuggestions = calendarSpacingService.generateSpacingSuggestions(
          selectedDate, 
          dateEvents, 
          3
        );
        setAIState(prev => ({ ...prev, suggestions: newSuggestions }));
      }
    }
  };
}